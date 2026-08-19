// 缺货上报服务：扫码/输条码 → 报"剩X件 / 剩X箱 / 已卖完" → 网站红标 + 一键同步库存到 PrestaShop
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database/database';
import { PrestaShopClient } from './prestashop/prestashopClient';

/** 缺货上报图片目录：data/uploads/stock-reports/{reportId}/ */
function reportImagesDir(reportId: number): string {
  const dir = path.join(__dirname, '../../data/uploads/stock-reports', String(reportId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 保存上报图片（multer 内存 buffer → 文件），返回相对路径列表 */
export function saveReportImage(reportId: number, file: { originalname?: string; buffer: Buffer; mimetype?: string }): { url: string; name: string } {
  const db = getDatabase();
  const report = db.prepare('SELECT * FROM stock_reports WHERE id = ?').get(reportId) as any;
  if (!report) throw new Error('上报记录不存在');

  const ext = (file.mimetype || '').split('/')[1] || 'jpg';
  const safeExt = ['jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'jpg';
  const name = `photo_${Date.now()}_${Math.round(Math.random() * 10000)}.${safeExt}`;
  const dir = reportImagesDir(reportId);
  fs.writeFileSync(path.join(dir, name), file.buffer);

  const url = `/api/stock-report/${reportId}/image/${name}`;
  const current = (() => { try { return JSON.parse(report.images_json || '[]'); } catch { return []; } })();
  current.push({ url, name, original: file.originalname || name, size: file.buffer.length, at: new Date().toISOString() });
  db.prepare('UPDATE stock_reports SET images_json = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(JSON.stringify(current), reportId);
  return { url, name };
}

/** 读取上报图片文件（供静态服务） */
export function getReportImageFile(reportId: number, name: string): { filePath: string; exists: boolean } {
  const safe = path.basename(name); // 防目录穿越
  const dir = reportImagesDir(reportId);
  const filePath = path.join(dir, safe);
  return { filePath, exists: fs.existsSync(filePath) };
}

/** 删除某张上报图片 */
export function deleteReportImage(reportId: number, name: string): boolean {
  const db = getDatabase();
  const report = db.prepare('SELECT * FROM stock_reports WHERE id = ?').get(reportId) as any;
  if (!report) return false;
  const safe = path.basename(name);
  const filePath = path.join(reportImagesDir(reportId), safe);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  const current = (() => { try { return JSON.parse(report.images_json || '[]'); } catch { return []; } })();
  const next = current.filter((i: any) => i.name !== safe);
  db.prepare('UPDATE stock_reports SET images_json = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(JSON.stringify(next), reportId);
  return true;
}


function getSetting(key: string): string {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any;
  return String(row?.value || '').trim();
}

function loadPrestaShopConfig() {
  return {
    baseUrl: getSetting('prestashop_base_url') || 'https://temcostar.com',
    apiKey: getSetting('prestashop_api_key'),
    defaultLangId: getSetting('prestashop_default_lang_id') || getSetting('prestashop_language_id') || '1',
    spanishLangId: getSetting('prestashop_spanish_lang_id') || getSetting('prestashop_default_lang_id') || getSetting('prestashop_language_id') || '1',
    chineseLangId: getSetting('prestashop_chinese_lang_id'),
    defaultCategoryId: getSetting('prestashop_default_category_id') || '3',
    defaultManufacturerId: getSetting('prestashop_default_manufacturer_id') || '1',
    defaultShopId: getSetting('prestashop_default_shop_id') || '1',
  };
}

/** 按条码 / reference / EAN / 名称模糊查本地产品 */
export function findProductByQuery(query: string): any | null {
  const db = getDatabase();
  const q = String(query || '').trim();
  if (!q) return null;
  // 1) 精确：reference / ean13 / upc
  let p = db.prepare('SELECT * FROM products WHERE reference = ? LIMIT 1').get(q) as any;
  if (!p) p = db.prepare('SELECT * FROM products WHERE ean13 = ? LIMIT 1').get(q) as any;
  if (!p) p = db.prepare('SELECT * FROM products WHERE upc = ? LIMIT 1').get(q) as any;
  // 2) 模糊：reference 前缀 / 名称包含
  if (!p) p = db.prepare('SELECT * FROM products WHERE reference LIKE ? LIMIT 1').get(`${q}%`) as any;
  if (!p) p = db.prepare('SELECT * FROM products WHERE name LIKE ? LIMIT 1').get(`%${q}%`) as any;
  if (!p) return null;
  return {
    id: p.id,
    reference: p.reference,
    name: p.name || '',
    ean13: p.ean13 || '',
    prestashopProductId: Number(p.prestashop_id) || 0,
    brand: p.brand || '',
    category: p.category || '',
    websiteQuantity: null as number | null,
  };
}

/** 读取网站实时库存（stock_availables 合计） */
export async function fetchWebsiteQuantity(psId: number): Promise<number | null> {
  if (!psId) return null;
  try {
    const config = loadPrestaShopConfig();
    if (!config.baseUrl || !config.apiKey) return null;
    const client = new PrestaShopClient(config);
    const data = await client.get<any>('stock_availables', { 'filter[id_product]': `[${psId}]`, display: '[id,quantity,id_product_attribute]' });
    const list = Array.isArray(data?.stock_availables?.stock_available)
      ? data.stock_availables.stock_available
      : data?.stock_availables?.stock_available ? [data.stock_availables.stock_available] : [];
    return list.reduce((sum: number, s: any) => sum + Number(s.quantity || 0), 0);
  } catch {
    return null;
  }
}

export interface CreateReportInput {
  query?: string;            // 条码 / reference / 名称
  productId?: number;        // 直接给本地产品 id（优先）
  reportType: 'pieces' | 'boxes' | 'sold_out';
  quantity?: number;         // pieces/boxes 数量；sold_out 传 0
  boxSize?: number;          // 每箱件数
  operatorName?: string;
  deviceName?: string;
  note?: string;
}

/** 新增缺货上报（同一产品已有 active 未解决上报时，覆盖更新数量） */
export async function createStockReport(input: CreateReportInput): Promise<any> {
  const db = getDatabase();
  const reportType = input.reportType;
  if (!['pieces', 'boxes', 'sold_out'].includes(reportType)) throw new Error('reportType 无效');

  let product = null;
  if (input.productId) {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(input.productId) as any;
    if (p) product = { id: p.id, reference: p.reference, name: p.name || '', ean13: p.ean13 || '', prestashopProductId: Number(p.prestashop_id) || 0, brand: p.brand || '', category: p.category || '' };
  } else if (input.query) {
    product = findProductByQuery(input.query);
  }
  if (!product) throw new Error('未找到该产品，请检查条码或编号');

  // 每箱件数（boxes 类型）：默认 10 件/箱，可在上报时指定
  const boxSize = reportType === 'boxes' ? Math.max(0, Math.round(Number(input.boxSize) || 0) || 0) : 0;
  const quantity = reportType === 'sold_out'
    ? 0
    : Math.max(0, Math.round(Number(input.quantity) || 0) || 0);
  // boxes → 总件数 = 箱数 × 每箱件数（用于同步网站库存）；箱数记录在 quantity
  const websiteQty = await fetchWebsiteQuantity(product.prestashopProductId);

  const existing = db.prepare(`
    SELECT * FROM stock_reports WHERE product_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1
  `).get(product.id) as any;

  let reportId: number;
  if (existing) {
    db.prepare(`
      UPDATE stock_reports SET report_type = ?, quantity = ?, box_size = ?, status = 'active',
        sync_status = 'pending', sync_error = '', website_quantity = ?, operator_name = ?, device_name = ?, note = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(reportType, quantity, boxSize, websiteQty, input.operatorName || '', input.deviceName || '', input.note || '', existing.id);
    reportId = existing.id;
  } else {
    const info = db.prepare(`
      INSERT INTO stock_reports (product_id, prestashop_product_id, reference, product_name, barcode, report_type, quantity, box_size, status, sync_status, website_quantity, operator_name, device_name, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 'pending', ?, ?, ?, ?)
    `).run(
      product.id,
      product.prestashopProductId || 0,
      product.reference,
      product.name,
      product.ean13 || '',
      reportType,
      quantity,
      boxSize,
      websiteQty,
      input.operatorName || '',
      input.deviceName || '',
      input.note || '',
    );
    reportId = Number(info.lastInsertRowid);
  }

  return db.prepare('SELECT * FROM stock_reports WHERE id = ?').get(reportId);
}

/** 缺货汇总（网站红标用）：返回 active 未解决的缺货产品数 */
export function getStockReportSummary(): { count: number; items: any[] } {
  const db = getDatabase();
  const items = db.prepare(`
    SELECT sr.*, p.name as local_name, p.prestashop_id as ps_id
    FROM stock_reports sr LEFT JOIN products p ON sr.product_id = p.id
    WHERE sr.status = 'active'
    ORDER BY sr.created_at DESC
  `).all() as any[];
  return { count: items.length, items };
}

/** 缺货明细列表（可按状态筛选） */
export function listStockReports(status?: string): any[] {
  const db = getDatabase();
  if (status && status !== 'all') {
    return db.prepare(`
      SELECT sr.*, p.name as local_name, p.prestashop_id as ps_id
      FROM stock_reports sr LEFT JOIN products p ON sr.product_id = p.id
      WHERE sr.status = ? ORDER BY sr.updated_at DESC LIMIT 300
    `).all(status) as any[];
  }
  return db.prepare(`
    SELECT sr.*, p.name as local_name, p.prestashop_id as ps_id
    FROM stock_reports sr LEFT JOIN products p ON sr.product_id = p.id
    ORDER BY sr.updated_at DESC LIMIT 300
  `).all() as any[];
}

/** 计算上报的"总件数"（用于同步网站库存）：pieces=数量；boxes=箱数×每箱件数；sold_out=0 */
export function reportTotalPieces(r: any): number {
  if (r.report_type === 'pieces') return Number(r.quantity || 0);
  if (r.report_type === 'boxes') return Number(r.quantity || 0) * Number(r.box_size || 0);
  return 0; // sold_out
}

/** 同步一条缺货上报的库存到网站（以总件数为准） */
export async function syncReportToWebsite(reportId: number): Promise<{ success: boolean; error?: string }> {
  const db = getDatabase();
  const r = db.prepare('SELECT * FROM stock_reports WHERE id = ?').get(reportId) as any;
  if (!r) throw new Error('上报记录不存在');
  const psId = Number(r.prestashop_product_id || 0);
  if (!psId) {
    db.prepare(`UPDATE stock_reports SET sync_status = 'failed', sync_error = '产品未绑定网站ID' WHERE id = ?`).run(reportId);
    return { success: false, error: '产品未绑定网站 ID，无法同步' };
  }
  const config = loadPrestaShopConfig();
  if (!config.baseUrl || !config.apiKey) {
    db.prepare(`UPDATE stock_reports SET sync_status = 'failed', sync_error = '未配置 PrestaShop API' WHERE id = ?`).run(reportId);
    return { success: false, error: '未配置 PrestaShop API' };
  }
  const client = new PrestaShopClient(config);
  const totalPieces = reportTotalPieces(r);
  const res = await client.updateProductStock(psId, totalPieces, config.defaultShopId);
  if (!res.success) {
    db.prepare(`UPDATE stock_reports SET sync_status = 'failed', sync_error = ? WHERE id = ?`).run(res.error || '同步失败', reportId);
    return { success: false, error: res.error };
  }
  db.prepare(`
    UPDATE stock_reports SET sync_status = 'synced', sync_error = '', status = 'synced', updated_at = datetime('now')
    WHERE id = ?
  `).run(reportId);
  return { success: true };
}

/** 一键同步全部 active 缺货上报到网站 */
export async function syncAllReportsToWebsite(): Promise<{ total: number; synced: number; failed: number; results: { id: number; reference: string; ok: boolean; error?: string }[] }> {
  const db = getDatabase();
  const reports = db.prepare(`SELECT * FROM stock_reports WHERE status IN ('active','synced') AND sync_status != 'synced' ORDER BY id`).all() as any[];
  const results: { id: number; reference: string; ok: boolean; error?: string }[] = [];
  let synced = 0, failed = 0;
  for (const r of reports) {
    try {
      const res = await syncReportToWebsite(r.id);
      if (res.success) { synced++; results.push({ id: r.id, reference: r.reference, ok: true }); }
      else { failed++; results.push({ id: r.id, reference: r.reference, ok: false, error: res.error }); }
    } catch (e: any) {
      failed++;
      results.push({ id: r.id, reference: r.reference, ok: false, error: e.message });
    }
  }
  return { total: reports.length, synced, failed, results };
}

/** 补货后标记已解决（从红标移除） */
export function resolveStockReport(reportId: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE stock_reports SET status = 'resolved', updated_at = datetime('now') WHERE id = ?`).run(reportId);
}

/** 删除上报记录 */
export function deleteStockReport(reportId: number): boolean {
  const db = getDatabase();
  const info = db.prepare('DELETE FROM stock_reports WHERE id = ?').run(reportId);
  return info.changes > 0;
}
