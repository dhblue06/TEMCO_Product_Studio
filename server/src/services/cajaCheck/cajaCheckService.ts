// CAJA 新品检查：核心服务（v1.6 文档 §14-15、§19-22、§30-36、§50-52）
import crypto from 'crypto';
import { getDatabase } from '../../database/database';
import { PrestaShopClient } from '../prestashop/prestashopClient';
import { parseCajaExcel, CajaProductRow } from './excelParser';
import { buildWebsiteIndex, WebsiteProduct, WebsiteProductIndex } from './websiteIndex';
import { matchCajaProduct } from './matcher';
import { isValidBarcodeCandidate } from './normalizer';
import { buildProductXml, findPrestaShopProductByRef, SyncOptions } from '../prestashop/prestashopMapper';

function getSetting(key: string): string {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any;
  return row?.value || '';
}

function loadConfig() {
  return {
    baseUrl: getSetting('prestashop_base_url') || 'https://temcostar.com',
    apiKey: getSetting('prestashop_api_key') || '',
    defaultLangId: getSetting('prestashop_default_lang_id') || getSetting('prestashop_language_id') || '1',
    spanishLangId: getSetting('prestashop_spanish_lang_id') || '1',
    chineseLangId: getSetting('prestashop_chinese_lang_id') || '',
    defaultCategoryId: getSetting('prestashop_default_category_id') || '3',
    defaultManufacturerId: getSetting('prestashop_default_manufacturer_id') || '1',
    defaultShopId: getSetting('prestashop_default_shop_id') || '1',
  };
}

function asArray<T>(val: T | T[] | null | undefined): T[] {
  if (val === null || val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

/** 读取网站商品精简字段（id/reference/ean13/upc/name/active/price）；失败抛错（不返回空数组） */
export async function fetchWebsiteProducts(): Promise<WebsiteProduct[]> {
  const config = loadConfig();
  if (!config.baseUrl || !config.apiKey) {
    throw new Error('未配置 PrestaShop API Key（请先检查系统设置 → PrestaShop）');
  }
  const client = new PrestaShopClient(config);
  const data = await client.get<any>('products', {
    display: '[id,reference,ean13,upc,name,active,price]',
    limit: '100000',
  });
  const list = asArray<any>(data?.products?.product);
  if (list.length === 0) {
    throw new Error('WEBSITE_DATA_EMPTY');
  }
  return list.map((p: any) => ({
    id: Number(p?.id ?? 0),
    reference: String(p?.reference ?? '').trim(),
    ean13: String(p?.ean13 ?? '').trim(),
    upc: String(p?.upc ?? '').trim(),
    name: String(p?.name ?? '').trim(),
    active: p?.active ?? '',
    price: toPrice(p?.price),
  }));
}

/** 价格解析：数字字符串 → number，无法解析返回 null */
function toPrice(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** 价格是否视为“有变动”：与文件售价差异超过容差（0.005，兼容浮点/四舍五入差异） */
export function isPriceChanged(filePrice: number | undefined | null, websitePrice: number | null | undefined): boolean {
  if (filePrice === null || filePrice === undefined) return false;
  if (websitePrice === null || websitePrice === undefined) return false;
  return Math.abs(Number(filePrice) - Number(websitePrice)) > 0.005;
}

export interface PreviewResult {
  filename: string;
  totalRows: number;
  validRows: number;
  columns: string[];
  sample: { reference: string; barcode: string; name: string }[];
}

/** 预览：只解析文件，不比对网站 */
export function previewCheck(buffer: Buffer, filename: string): PreviewResult {
  const { rows, columns } = parseCajaExcel(buffer);
  return {
    filename,
    totalRows: rows.length,
    validRows: rows.length,
    columns,
    sample: rows.slice(0, 5).map(r => ({ reference: r.reference, barcode: r.barcode, name: r.name })),
  };
}

export interface RunSummary {
  batchId: number;
  total: number;
  existing: number;
  new: number;
  review: number;
  priceChanged: number;
  websiteProducts: number;
}

/** 正式检查：解析 → 读网站 → 匹配 → 落库。网站失败必须抛错（禁止全部误判为新品）。 */
export async function runCheck(buffer: Buffer, filename: string): Promise<RunSummary> {
  const db = getDatabase();
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

  // 解析 Excel（失败则直接抛，不建批次）
  const { rows } = parseCajaExcel(buffer);

  const batchId = Number(db.prepare(`
    INSERT INTO caja_check_batches (filename, file_hash, total_rows, status)
    VALUES (?, ?, ?, 'reading_excel')
  `).run(filename, fileHash, rows.length).lastInsertRowid);

  const fail = (message: string) => {
    db.prepare(`UPDATE caja_check_batches SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?`)
      .run(message, batchId);
  };

  let websiteProducts: WebsiteProduct[];
  try {
    db.prepare(`UPDATE caja_check_batches SET status = 'fetching_website' WHERE id = ?`).run(batchId);
    websiteProducts = await fetchWebsiteProducts();
  } catch (e: any) {
    fail(`网站商品读取失败：${e.message}`);
    throw new Error(`无法读取网站商品。请检查：系统设置 → PrestaShop → API 连接（${e.message}）`);
  }

  if (websiteProducts.length === 0) {
    fail('WEBSITE_DATA_EMPTY');
    throw new Error('网站商品数据为空，检查已中止（不产生新品结果）');
  }

  db.prepare(`UPDATE caja_check_batches SET status = 'matching' WHERE id = ?`).run(batchId);
  const index = buildWebsiteIndex(websiteProducts);
  const insertItem = db.prepare(`
    INSERT INTO caja_check_items (
      batch_id, caja_reference, barcode, name, name2,
      purchase_price, sale_price, edit_date, caja_status,
      result_status, match_method,
      prestashop_product_id, prestashop_reference, prestashop_ean13, prestashop_name,
      prestashop_price, price_changed,
      match_score, raw_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const write = db.transaction((rowsToWrite: CajaProductRow[]) => {
    const counts = { existing: 0, new: 0, review: 0, priceChanged: 0 };
    for (const row of rowsToWrite) {
      const r = matchCajaProduct(row, index);
      counts[r.status]++;
      const websitePrice = r.prestashopProduct?.price ?? null;
      const changed = isPriceChanged(row.salePrice, websitePrice) ? 1 : 0;
      if (changed === 1) counts.priceChanged++;
      insertItem.run(
        batchId,
        row.reference || null,
        row.barcode || null,
        row.name || null,
        row.name2 || null,
        row.purchasePrice ?? null,
        row.salePrice ?? null,
        row.editDate || null,
        row.status || null,
        r.status,
        r.matchMethod,
        r.prestashopProduct?.id ?? null,
        r.prestashopProduct?.reference || null,
        r.prestashopProduct?.ean13 || null,
        r.prestashopProduct?.name || null,
        websitePrice,
        changed,
        r.score ?? null,
        JSON.stringify(row.rawData),
      );
    }
    return counts;
  });
  const counts = write(rows);

  db.prepare(`
    UPDATE caja_check_batches SET
      status = 'completed',
      existing_count = ?, new_count = ?, review_count = ?, price_changed_count = ?,
      website_product_count = ?,
      completed_at = datetime('now')
    WHERE id = ?
  `).run(counts.existing, counts.new, counts.review, counts.priceChanged, websiteProducts.length, batchId);

  return {
    batchId,
    total: rows.length,
    existing: counts.existing,
    new: counts.new,
    review: counts.review,
    priceChanged: counts.priceChanged,
    websiteProducts: websiteProducts.length,
  };
}

export interface BatchRow {
  id: number;
  filename: string;
  total_rows: number;
  existing_count: number;
  new_count: number;
  review_count: number;
  price_changed_count: number;
  website_product_count: number;
  status: string;
  error_message: string;
  created_at: string;
  completed_at: string;
}

/** 最近检查批次（最近 20 个） */
export function listBatches(): BatchRow[] {
  return getDatabase().prepare(`
    SELECT id, filename, total_rows, existing_count, new_count, review_count, price_changed_count,
           website_product_count, status, error_message, created_at, completed_at
    FROM caja_check_batches ORDER BY id DESC LIMIT 20
  `).all() as BatchRow[];
}

export function getBatch(id: number): BatchRow | null {
  return (getDatabase().prepare(`
    SELECT id, filename, total_rows, existing_count, new_count, review_count, price_changed_count,
           website_product_count, status, error_message, created_at, completed_at
    FROM caja_check_batches WHERE id = ?
  `).get(id) as BatchRow) || null;
}

export function deleteBatch(id: number): boolean {
  const info = getDatabase().prepare('DELETE FROM caja_check_batches WHERE id = ?').run(id);
  return info.changes > 0;
}

export interface ItemsQuery {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: string;
}

export interface ItemsResult {
  items: any[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
}

const SORT_WHITELIST = ['caja_reference', 'barcode', 'name', 'sale_price', 'prestashop_price', 'result_status', 'id'];

// v1.6：CAJA 新品 → 网站批量创建（基础信息：reference/名称/售价/EAN/库存0/默认分类品牌）
export interface UploadWebsiteResult {
  total: number;
  created: number;
  exists: number;
  skipped: number;
  failed: number;
  results: { itemId: number; reference: string; status: 'created' | 'exists' | 'skipped' | 'failed'; prestashopId?: number | null; error?: string }[];
}

export async function uploadItemsToWebsite(batchId: number, itemIds: number[]): Promise<UploadWebsiteResult> {
  const db = getDatabase();
  if (!itemIds || itemIds.length === 0) throw new Error('未选择要上传的商品');

  const config = loadConfig();
  if (!config.baseUrl || !config.apiKey) throw new Error('未配置 PrestaShop API Key（请先检查系统设置 → PrestaShop）');
  const client = new PrestaShopClient(config);

  const placeholders = itemIds.map(() => '?').join(',');
  const items = db.prepare(
    `SELECT id, caja_reference, barcode, name, sale_price, purchase_price, prestashop_product_id, upload_error
     FROM caja_check_items WHERE batch_id = ? AND id IN (${placeholders})`
  ).all(batchId, ...itemIds) as any[];
  if (items.length === 0) throw new Error('未找到要上传的商品');

  // 基础信息创建选项：内容/SEO 由 mapper 回退到名称，不传图片/视频/库存
  const options: SyncOptions = {
    syncContent: true, syncSeo: true, syncCategory: false, syncBrand: true,
    syncImages: false, syncVideos: false, syncPrice: true, syncStock: false, forceUpdate: false,
  };

  const results: UploadWebsiteResult['results'] = [];
  let created = 0, exists = 0, skipped = 0, failed = 0;

  for (const item of items) {
    const reference = String(item.caja_reference || '').trim();
    const result: UploadWebsiteResult['results'][number] = { itemId: item.id, reference, status: 'skipped', prestashopId: null };
    try {
      // 已上传过 → 跳过
      if (item.prestashop_product_id) {
        result.status = 'skipped';
        result.prestashopId = Number(item.prestashop_product_id);
        skipped++;
        results.push(result);
        continue;
      }
      // 网站已有同 reference → 记录现有 ID（upload_status='exists'，不重复创建）
      const found = reference ? await findPrestaShopProductByRef(reference, client) : { exists: false, id: null };
      if (found.exists && found.id) {
        db.prepare("UPDATE caja_check_items SET prestashop_product_id = ?, upload_status = 'exists' WHERE id = ?").run(found.id, item.id);
        result.status = 'exists';
        result.prestashopId = found.id;
        exists++;
        results.push(result);
        continue;
      }
      // 创建基础商品
      const product: any = {
        reference,
        name: String(item.name || reference || 'Product'),
        price: item.sale_price ?? 0,
        ean13: isValidBarcodeCandidate(String(item.barcode || '')) ? String(item.barcode) : '',
        quantity: 0,
        status: '',
        prestashop_lang_id: config.spanishLangId || config.defaultLangId,
        prestashop_category_id: config.defaultCategoryId,
        prestashop_manufacturer_id: config.defaultManufacturerId,
        prestashop_shop_id: config.defaultShopId,
      };
      const xml = buildProductXml(product, {}, options);
      const response = await client.postXml('products', xml);
      // 注意：prestashopClient 的 isArray 配置把 'product' 解析为数组
      const createdProduct = Array.isArray(response?.product) ? response.product[0] : response?.product;
      const psId = Number(createdProduct?.id || 0) || null;
      if (!psId) {
        throw new Error(`创建后未返回商品 ID（响应：${JSON.stringify(response).slice(0, 200)}）`);
      }
      db.prepare("UPDATE caja_check_items SET prestashop_product_id = ?, upload_status = 'created', upload_error = NULL WHERE id = ?").run(psId, item.id);
      // 库存初始 0（不把 CAJA 库存当网站库存）
      try { await client.updateProductStock(psId, 0, config.defaultShopId); } catch { /* 库存设置失败不阻断 */ }
      result.status = 'created';
      result.prestashopId = psId;
      created++;
    } catch (e: any) {
      const msg = e?.message || String(e);
      db.prepare('UPDATE caja_check_items SET upload_error = ? WHERE id = ?').run(msg, item.id);
      result.status = 'failed';
      result.error = msg;
      failed++;
    }
    results.push(result);
  }

  return { total: items.length, created, exists, skipped, failed, results };
}

/** 批次明细（默认 status=new，分页 50；status='price_changed' 时筛选价格有变动的已匹配商品） */
export function getItems(batchId: number, q: ItemsQuery = {}): ItemsResult {
  const db = getDatabase();
  const page = Math.max(1, q.page || 1);
  const pageSize = Math.min(200, Math.max(1, q.pageSize || 50));
  const where: string[] = ['batch_id = ?'];
  const params: any[] = [batchId];

  if (q.status && q.status !== 'all') {
    if (q.status === 'price_changed') {
      where.push('prestashop_product_id IS NOT NULL AND price_changed = 1');
    } else {
      where.push('result_status = ?');
      params.push(q.status);
    }
  }
  if (q.search) {
    const like = `%${q.search}%`;
    where.push('(caja_reference LIKE ? OR barcode LIKE ? OR name LIKE ?)');
    params.push(like, like, like);
  }

  const sort = SORT_WHITELIST.includes(q.sort || '') ? q.sort : 'id';
  const order = (q.order || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const total = (db.prepare(`SELECT COUNT(*) as c FROM caja_check_items WHERE ${where.join(' AND ')}`).get(...params) as any).c || 0;
  const items = db.prepare(`
    SELECT id, caja_reference, barcode, name, name2, purchase_price, sale_price,
           edit_date, caja_status, result_status, match_method,
           prestashop_product_id, prestashop_reference, prestashop_ean13, prestashop_name, match_score,
           prestashop_price, price_changed, price_sync_status, price_sync_error,
           upload_error, upload_status
    FROM caja_check_items WHERE ${where.join(' AND ')}
    ORDER BY ${sort} ${order} LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize);

  return { items, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export interface SyncPriceResult {
  total: number;
  synced: number;
  failed: number;
  skipped: number;
  results: { itemId: number; reference: string; status: 'synced' | 'failed' | 'skipped'; prestashopId?: number | null; error?: string }[];
}

/**
 * 价格同步：把勾选商品的网站价格（PrestaShop product.price）更新为上传文件中的售价。
 * 以文件为准：读网站 full XML → 仅替换 <price> → PUT。
 */
export async function syncPricesToWebsite(batchId: number, itemIds: number[]): Promise<SyncPriceResult> {
  const db = getDatabase();
  if (!itemIds || itemIds.length === 0) throw new Error('未选择要同步价格的商品');

  const config = loadConfig();
  if (!config.baseUrl || !config.apiKey) throw new Error('未配置 PrestaShop API Key（请先检查系统设置 → PrestaShop）');
  const client = new PrestaShopClient(config);

  const placeholders = itemIds.map(() => '?').join(',');
  const items = db.prepare(
    `SELECT id, caja_reference, sale_price, prestashop_product_id
     FROM caja_check_items WHERE batch_id = ? AND id IN (${placeholders})`
  ).all(batchId, ...itemIds) as any[];
  if (items.length === 0) throw new Error('未找到要同步价格的商品');

  const results: SyncPriceResult['results'] = [];
  let synced = 0, failed = 0, skipped = 0;

  for (const item of items) {
    const reference = String(item.caja_reference || '').trim();
    const psId = Number(item.prestashop_product_id) || 0;
    const result: SyncPriceResult['results'][number] = { itemId: item.id, reference, status: 'skipped', prestashopId: psId || null };
    // 未匹配到网站商品 / 文件无售价 → 跳过
    if (!psId || item.sale_price === null || item.sale_price === undefined) {
      skipped++;
      results.push(result);
      continue;
    }
    try {
      const xml = await client.getRawXml(`products/${psId}?display=full`);
      if (!xml) throw new Error('无法读取网站商品（API 未返回内容）');
      const newPrice = Number(item.sale_price).toFixed(6);
      // 仅替换 <price> 字段（兼容 CDATA），其余字段原样保留
      const modified = xml.replace(/(<price[^>]*>)(?:<!\[CDATA\[)?[\s\S]*?(?:\]\]>)?(<\/price>)/, `$1${newPrice}$2`);
      if (modified === xml) throw new Error('网站商品 XML 中未找到 price 字段');
      await client.putXml('products', psId, modified);
      db.prepare(`
        UPDATE caja_check_items SET
          prestashop_price = ?, price_changed = 0,
          price_sync_status = 'synced', price_sync_error = NULL
        WHERE id = ?
      `).run(Number(item.sale_price), item.id);
      result.status = 'synced';
      synced++;
    } catch (e: any) {
      const msg = e?.message || String(e);
      db.prepare("UPDATE caja_check_items SET price_sync_status = 'failed', price_sync_error = ? WHERE id = ?").run(msg, item.id);
      result.status = 'failed';
      result.error = msg;
      failed++;
    }
    results.push(result);
  }

  return { total: items.length, synced, failed, skipped, results };
}
