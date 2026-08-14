// v1.5 仓库快速盘点服务：批次 / 产品 / 型号×颜色×数量 / 汇总 / 差异 / 缺货巡视
import { getDatabase } from '../database/database';
import { getPhoneModelGroups } from './mobileCapture/phoneModelService';
import { fetchCombinations } from './prestashop/combinationService';
import { fetchAllOptionValuesForSnapshot } from './inventoryWebsiteService';

// ===== 批次 =====

function nextSessionCode(db: any): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const prefix = `INV-${ymd}-`;
  const row = db.prepare("SELECT session_code FROM inventory_sessions WHERE session_code LIKE ? ORDER BY session_code DESC LIMIT 1").get(prefix + '%');
  let seq = 1;
  if (row) {
    const last = parseInt(String(row.session_code).split('-').pop() || '0', 10);
    if (Number.isFinite(last)) seq = last + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

export function createInventorySession(input: { name?: string; inventoryType?: string; operatorName?: string; deviceName?: string; notes?: string }): any {
  const db = getDatabase();
  const code = nextSessionCode(db);
  const info = db.prepare(`
    INSERT INTO inventory_sessions (session_code, name, inventory_type, operator_name, device_name, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(code, input.name || '', input.inventoryType || 'phone_case', input.operatorName || '', input.deviceName || '', input.notes || '');
  return db.prepare('SELECT * FROM inventory_sessions WHERE id = ?').get(info.lastInsertRowid);
}

export function listInventorySessions(status?: string) {
  const db = getDatabase();
  if (status) return db.prepare('SELECT * FROM inventory_sessions WHERE status = ? ORDER BY id DESC').all(status);
  return db.prepare('SELECT * FROM inventory_sessions ORDER BY id DESC LIMIT 100').all();
}

export function getInventorySession(id: number) {
  const db = getDatabase();
  const s = db.prepare('SELECT * FROM inventory_sessions WHERE id = ?').get(id);
  if (!s) return null;
  const products = db.prepare('SELECT * FROM inventory_products WHERE inventory_session_id = ? ORDER BY id').all(id);
  let modelCount = 0, colorCount = 0, totalQty = 0, outOfStock = 0, lowCount = 0;
  for (const p of products as any[]) {
    const mc = db.prepare('SELECT id FROM inventory_model_counts WHERE inventory_product_id = ?').all(p.id);
    modelCount += mc.length;
    for (const m of mc as any[]) {
      const cc = db.prepare('SELECT * FROM inventory_color_counts WHERE model_count_id = ?').all(m.id);
      colorCount += cc.length;
      for (const c of cc as any[]) {
        if (c.stock_status === 'out_of_stock') outOfStock++;
        else if (c.stock_status === 'low') lowCount++;
        totalQty += Number(c.quantity || 0);
      }
    }
  }
  return { ...s, products, stats: { products: products.length, models: modelCount, colors: colorCount, totalQty, outOfStock, lowCount } };
}

export function setInventorySessionStatus(id: number, status: 'active' | 'completed' | 'cancelled') {
  const db = getDatabase();
  db.prepare(`UPDATE inventory_sessions SET status = ?, completed_at = CASE WHEN ? != 'active' THEN datetime('now') ELSE completed_at END, updated_at = datetime('now') WHERE id = ?`)
    .run(status, status, id);
  return getInventorySession(id);
}

// ===== 盘点产品 =====

export function addInventoryProduct(sessionId: number, input: { productId?: number; prestashopProductId?: number }) {
  const db = getDatabase();
  let productName = '', reference = '', psId = input.prestashopProductId || 0;
  if (input.productId) {
    const p = db.prepare('SELECT id, reference, name, prestashop_id FROM products WHERE id = ?').get(input.productId) as any;
    if (p) {
      productName = p.name || '';
      reference = p.reference || '';
      if (!psId) psId = Number(p.prestashop_id) || 0;
    }
  }
  const info = db.prepare(`
    INSERT INTO inventory_products (inventory_session_id, product_id, prestashop_product_id, product_name, reference)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, input.productId || null, psId, productName, reference);
  const product = db.prepare('SELECT * FROM inventory_products WHERE id = ?').get(info.lastInsertRowid);
  // 异步填充网站快照（不阻塞）
  void refreshInventorySnapshot(info.lastInsertRowid as number);
  return product;
}

/** 拉取网站组合/库存快照存入 inventory_products.snapshot_json */
export async function refreshInventorySnapshot(inventoryProductId: number): Promise<void> {
  const db = getDatabase();
  const p = db.prepare('SELECT * FROM inventory_products WHERE id = ?').get(inventoryProductId) as any;
  if (!p || !p.prestashop_product_id) return;
  try {
    const [combos, ov] = await Promise.all([
      fetchCombinations(Number(p.prestashop_product_id)),
      fetchAllOptionValuesForSnapshot(),
    ]);
    const ovMap = new Map<number, string>((ov || []).map((v: any) => [v.id, v.name]));
    const snapshot = {
      fetchedAt: new Date().toISOString(),
      combinations: (combos || []).map((c: any) => ({
        id: c.id,
        colors: (c.attributeValueIds || []).map((id: number) => ovMap.get(id) || `#${id}`).filter(Boolean),
        quantity: c.quantity ?? 0,
        reference: c.reference || '',
      })),
    };
    db.prepare('UPDATE inventory_products SET snapshot_json = ? WHERE id = ?').run(JSON.stringify(snapshot), inventoryProductId);
  } catch { /* 网站不可用则快照为空 */ }
}

export function listInventoryProducts(sessionId: number) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM inventory_products WHERE inventory_session_id = ? ORDER BY id').all(sessionId);
}

/** 产品盘点详情：型号目录 + 本次已盘 + 上次盘点 + 网站快照 */
export function getInventoryProduct(id: number) {
  const db = getDatabase();
  const p = db.prepare('SELECT * FROM inventory_products WHERE id = ?').get(id) as any;
  if (!p) return null;
  const counted = db.prepare(`
    SELECT mc.id, mc.brand, mc.model, mc.status, mc.counted_at,
      (SELECT COUNT(*) FROM inventory_color_counts cc WHERE cc.model_count_id = mc.id) as color_count
    FROM inventory_model_counts mc WHERE mc.inventory_product_id = ? ORDER BY mc.id
  `).all(id);
  const colorsByModel = new Map<number, any[]>();
  for (const m of counted as any[]) {
    colorsByModel.set(m.id, db.prepare('SELECT * FROM inventory_color_counts WHERE model_count_id = ? ORDER BY id').all(m.id));
  }
  const countedModels = (counted as any[]).map(m => ({ ...m, colors: colorsByModel.get(m.id) || [] }));

  // 上次盘点（本产品上一次批次：取最近的 inventory_products 记录）
  const prev = db.prepare(`
    SELECT mc.model, mc.counted_at,
      (SELECT json_group_array(json_object('color', cc.color_name, 'quantity', cc.quantity)) FROM inventory_color_counts cc WHERE cc.model_count_id = mc.id) as colors
    FROM inventory_model_counts mc
    JOIN inventory_products ip ON mc.inventory_product_id = ip.id
    WHERE ip.product_id = ? AND ip.id != ?
    ORDER BY mc.counted_at DESC LIMIT 50
  `).all(p.product_id, id);

  return { ...p, snapshot: (() => { try { return JSON.parse(p.snapshot_json || 'null'); } catch { return null; } })(), countedModels, lastCounts: prev };
}

// ===== 型号 × 颜色 × 数量 =====

/** 保存一个型号（upsert model_count + 重写颜色行） */
export function saveInventoryModel(inventoryProductId: number, input: {
  brand?: string; model: string; colors?: { color: string; quantity?: number | null; countType?: string; stockStatus?: string }[];
  status?: 'counted' | 'skipped' | 'out_of_stock';
}) {
  const db = getDatabase();
  const p = db.prepare('SELECT id FROM inventory_products WHERE id = ?').get(inventoryProductId) as any;
  if (!p) throw new Error('盘点产品不存在');
  const colors = Array.isArray(input.colors) ? input.colors : [];
  const modelStatus = (input.status === 'skipped' || input.status === 'out_of_stock') ? input.status : 'counted';

  const tx = db.transaction(() => {
    let mc = db.prepare('SELECT id FROM inventory_model_counts WHERE inventory_product_id = ? AND model = ?')
      .get(inventoryProductId, input.model) as any;
    if (mc) {
      db.prepare('UPDATE inventory_model_counts SET brand = ?, status = ?, counted_at = datetime(\'now\') WHERE id = ?')
        .run(input.brand || '', modelStatus, mc.id);
      db.prepare('DELETE FROM inventory_color_counts WHERE model_count_id = ?').run(mc.id);
    } else {
      const info = db.prepare(`
        INSERT INTO inventory_model_counts (inventory_product_id, brand, model, status) VALUES (?, ?, ?, ?)
      `).run(inventoryProductId, input.brand || '', input.model, modelStatus);
      mc = { id: info.lastInsertRowid };
    }
    for (const c of colors) {
      const qty = (c.countType === 'exact' || c.countType === 'estimated') ? (c.quantity ?? null) : null;
      const stockStatus = c.stockStatus || (qty === 0 ? 'out_of_stock' : qty === null ? 'not_counted' : qty !== null && qty < 5 ? 'low' : 'in_stock');
      db.prepare(`
        INSERT INTO inventory_color_counts (model_count_id, color_name, quantity, count_type, stock_status) VALUES (?, ?, ?, ?, ?)
      `).run(mc.id, c.color, qty, c.countType || 'exact', stockStatus);
    }
  });
  tx();
  return getInventoryModel(inventoryProductId, input.model);
}

export function getInventoryModel(inventoryProductId: number, model: string) {
  const db = getDatabase();
  const mc = db.prepare('SELECT * FROM inventory_model_counts WHERE inventory_product_id = ? AND model = ?')
    .get(inventoryProductId, model) as any;
  if (!mc) return null;
  const colors = db.prepare('SELECT * FROM inventory_color_counts WHERE model_count_id = ? ORDER BY id').all(mc.id);
  return { ...mc, colors };
}

/** 批量保存多个型号（连续盘点一次提交） */
export function batchSaveInventoryModels(inventoryProductId: number, models: { brand?: string; model: string; colors?: any[]; status?: string }[]) {
  const saved = [];
  for (const m of models || []) {
    const status = (m.status === 'skipped' || m.status === 'out_of_stock') ? m.status : undefined;
    saved.push(saveInventoryModel(inventoryProductId, { ...m, status }));
  }
  return saved;
}

// ===== 汇总矩阵 =====

export function getInventorySummary(inventoryProductId: number) {
  const db = getDatabase();
  const p = db.prepare('SELECT * FROM inventory_products WHERE id = ?').get(inventoryProductId) as any;
  if (!p) return null;
  const models = db.prepare(`
    SELECT mc.id, mc.brand, mc.model, mc.status,
      (SELECT COUNT(*) FROM inventory_color_counts cc WHERE cc.model_count_id = mc.id) as color_count
    FROM inventory_model_counts mc WHERE mc.inventory_product_id = ? ORDER BY mc.id
  `).all(inventoryProductId);
  const rows: any[] = [];
  let totalQty = 0, outOfStock = 0, lowCount = 0, colorRecords = 0;
  for (const m of models as any[]) {
    const colors = db.prepare('SELECT color_name, quantity, count_type, stock_status FROM inventory_color_counts WHERE model_count_id = ? ORDER BY id').all(m.id);
    colorRecords += colors.length;
    const colorMap: Record<string, any> = {};
    for (const c of colors as any[]) {
      colorMap[c.color_name] = c;
      if (c.stock_status === 'out_of_stock') outOfStock++;
      else if (c.stock_status === 'low') lowCount++;
      totalQty += Number(c.quantity || 0);
    }
    rows.push({ brand: m.brand, model: m.model, status: m.status, colors: colorMap, colorList: colors });
  }
  return {
    ...p,
    rows,
    stats: { models: rows.length, colorRecords, totalQty, outOfStock, lowCount },
  };
}

/** 与网站库存差异（快照 vs 实盘） */
export function getInventoryDifferences(inventoryProductId: number) {
  const db = getDatabase();
  const p = db.prepare('SELECT * FROM inventory_products WHERE id = ?').get(inventoryProductId) as any;
  if (!p) return [];
  const snapshot = (() => { try { return JSON.parse(p.snapshot_json || 'null'); } catch { return null; } })();
  const models = db.prepare(`
    SELECT mc.brand, mc.model, mc.id FROM inventory_model_counts mc WHERE mc.inventory_product_id = ?
  `).all(inventoryProductId) as any[];
  const diffs: any[] = [];
  for (const m of models) {
    const colors = db.prepare('SELECT * FROM inventory_color_counts WHERE model_count_id = ? ORDER BY id').all(m.id) as any[];
    for (const c of colors) {
      // 匹配网站快照：颜色名包含（忽略大小写）
      const websiteQty = snapshot && Array.isArray(snapshot.combinations)
        ? snapshot.combinations
            .filter((com: any) => (com.colors || []).some((cn: string) => cn.toLowerCase() === String(c.color_name).toLowerCase()))
            .reduce((sum: number, com: any) => sum + Number(com.quantity || 0), 0)
        : null;
      const actual = Number(c.quantity ?? 0);
      const diff = websiteQty === null ? null : actual - websiteQty;
      diffs.push({
        brand: m.brand, model: m.model, color: c.color_name,
        actual, website: websiteQty, difference: diff,
        status: diff === null ? 'unknown' : diff === 0 ? 'match' : Math.abs(diff) <= 3 ? 'small' : 'large',
      });
    }
  }
  return diffs;
}

// ===== 缺货巡视 =====

export function createStockFlag(input: { productId?: number; brand?: string; model?: string; colorName?: string; status: string; operatorName?: string }) {
  const db = getDatabase();
  const info = db.prepare(`
    INSERT INTO inventory_stock_flags (product_id, brand, model, color_name, status, operator_name) VALUES (?, ?, ?, ?, ?, ?)
  `).run(input.productId || null, input.brand || '', input.model || '', input.colorName || '', input.status, input.operatorName || '');
  return db.prepare('SELECT * FROM inventory_stock_flags WHERE id = ?').get(info.lastInsertRowid);
}

export function listStockFlags(productId?: number) {
  const db = getDatabase();
  if (productId) return db.prepare('SELECT * FROM inventory_stock_flags WHERE product_id = ? ORDER BY id DESC LIMIT 100').all(productId);
  return db.prepare('SELECT * FROM inventory_stock_flags ORDER BY id DESC LIMIT 200').all();
}

export { getPhoneModelGroups };
