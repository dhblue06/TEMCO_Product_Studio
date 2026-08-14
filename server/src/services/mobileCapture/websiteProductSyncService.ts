// 手机采集：实时读写 PrestaShop 网站产品数据（搜索/扫码时）
import { getDatabase } from '../../database/database';
import { PrestaShopClient, PrestaShopConfig } from '../prestashop/prestashopClient';
import { fetchCombinations } from '../prestashop/combinationService';

function getSetting(key: string): string {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any;
  return String(row?.value || '').trim();
}

function loadPrestaShopConfig(): PrestaShopConfig {
  return {
    baseUrl: getSetting('prestashop_base_url') || 'https://www.temco.es',
    apiKey: getSetting('prestashop_api_key'),
    defaultLangId: getSetting('prestashop_default_lang_id') || getSetting('prestashop_language_id') || '1',
    spanishLangId: getSetting('prestashop_spanish_lang_id') || getSetting('prestashop_default_lang_id') || getSetting('prestashop_language_id') || '1',
    chineseLangId: getSetting('prestashop_chinese_lang_id'),
    defaultCategoryId: getSetting('prestashop_default_category_id') || '3',
    defaultManufacturerId: getSetting('prestashop_default_manufacturer_id') || '1',
    defaultShopId: getSetting('prestashop_default_shop_id') || '1',
  };
}

const DISPLAY_FIELDS = '[id,reference,name,price,ean13,quantity,manufacturer_name,active]';

function extractFirstProduct(data: any): any {
  const products = data?.products?.product;
  const first = Array.isArray(products) ? products[0] : products;
  return first || null;
}

function extractName(prod: any, langId: string): string {
  const langs = prod?.name?.language;
  if (Array.isArray(langs) && langs.length) {
    const hit = langs.find((l: any) => String(l['@_id']) === String(langId));
    const target = hit || langs[0];
    return String(target?.['#text'] ?? target ?? '').trim();
  }
  return String(prod?.name ?? '').trim();
}

/**
 * 从 PrestaShop 网站实时读取产品（按 reference，再按 ean13）
 * 超时 6 秒，失败返回 null（调用方静默回退本地）
 */
export async function fetchWebsiteProduct(query: string, timeoutMs = 6000): Promise<any | null> {
  const config = loadPrestaShopConfig();
  if (!config.baseUrl || !config.apiKey) return null;
  const client = new PrestaShopClient(config);

  const safeGet = (params: Record<string, string>) =>
    Promise.race([
      client.get('products', params),
      new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
    ]);

  try {
    let data = await safeGet({ 'filter[reference]': query, display: DISPLAY_FIELDS, limit: '1' });
    let prod = extractFirstProduct(data);
    if (!prod && /^\d{8,14}$/.test(query)) {
      data = await safeGet({ 'filter[ean13]': query, display: DISPLAY_FIELDS, limit: '1' });
      prod = extractFirstProduct(data);
    }
    return prod;
  } catch {
    return null;
  }
}

/**
 * 网站产品 → 本地 products 表 upsert（写），返回本地产品行；失败返回 null
 */
export async function syncProductFromWebsite(query: string): Promise<any | null> {
  const prod = await fetchWebsiteProduct(query);
  if (!prod) return null;
  const config = loadPrestaShopConfig();
  const db = getDatabase();

  const reference = String(prod.reference ?? '').trim() || String(prod.id ?? '');
  if (!reference) return null;
  const name = extractName(prod, config.spanishLangId || config.defaultLangId) || reference;
  const ean13 = String(prod.ean13 ?? '').trim();
  // 注意：PrestaShop products 资源没有 model 字段，保持本地 model 不变
  // quantity/price 在 XML 里可能带属性（@_notFilterable），fast-xml-parser 解析为 {#text:...} 对象
  const toNumber = (v: any): number => {
    const raw = v && typeof v === 'object' ? v['#text'] : v;
    const n = Number(raw ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const price = toNumber(prod.price);
  const quantity = toNumber(prod.quantity);
  const psId = Number(prod.id) || 0;

  try {
    // 1. 按 reference 匹配
    const existing = db.prepare('SELECT id FROM products WHERE reference = ?').get(reference) as any;
    if (existing) {
      db.prepare(`
        UPDATE products SET name = ?, ean13 = ?, price = ?, quantity = ?, prestashop_id = ?,
        prestashop_sync_status = 'synced', prestashop_last_sync_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(name, ean13, price, quantity, psId || null, existing.id);
      return db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id);
    }
    // 2. 按 ean13 匹配（reference 不同步时）
    const byEan = ean13 ? (db.prepare('SELECT id FROM products WHERE ean13 = ?').get(ean13) as any) : null;
    if (byEan) {
      db.prepare(`
        UPDATE products SET reference = ?, name = ?, price = ?, quantity = ?, prestashop_id = ?,
        prestashop_sync_status = 'synced', prestashop_last_sync_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(reference, name, price, quantity, psId || null, byEan.id);
      return db.prepare('SELECT * FROM products WHERE id = ?').get(byEan.id);
    }
    // 3. 本地不存在 → 插入
    db.prepare(`
      INSERT INTO products (reference, name, ean13, price, quantity, prestashop_id, status, prestashop_sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '待处理', 'synced', datetime('now'), datetime('now'))
    `).run(reference, name, ean13, price, quantity, psId || null);
    return db.prepare('SELECT * FROM products WHERE reference = ?').get(reference);
  } catch {
    return null;
  }
}

/**
 * 实时读取网站附加数据：产品图片数量 + 变体列表（颜色名 + 真实库存）+ 真实库存（stock_availables）
 * 失败返回 null（调用方静默回退）
 */
export async function fetchWebsiteProductExtras(psId: number, timeoutMs = 7000): Promise<{
  imageCount: number;
  stockQuantity: number; // 真实总库存（stock_availables 合计；单一产品即产品级库存）
  variants: { id: number; colors: string[]; quantity: number; reference: string; price: number }[];
} | null> {
  if (!psId) return null;
  try {
    const config = loadPrestaShopConfig();
    if (!config.baseUrl || !config.apiKey) return null;
    const client = new PrestaShopClient(config);

    const safeGet = (fn: () => Promise<any>) =>
      Promise.race([fn(), new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs))]);

    const [imgData, combos, ov, stockData] = await Promise.all([
      safeGet(() => client.get('images/products/' + psId)),
      safeGet(() => fetchCombinations(psId)),
      safeGet(() => fetchAllOptionValues()),
      safeGet(() => fetchStockAvailables(psId)),
    ]);

    // 图片数量
    const imgNode = (imgData as any)?.image;
    const imageCount = Array.isArray(imgNode) ? imgNode.length : imgNode ? 1 : 0;

    // 真实库存：变体产品 = 组合库存合计；单一产品 = id_product_attribute 0 的产品级库存
    const stockBlocks = (stockData as any)?.stock_availables?.stock_available;
    const stockRows = Array.isArray(stockBlocks) ? stockBlocks : stockBlocks ? [stockBlocks] : [];
    let baseStock = 0, comboStock = 0;
    for (const b of stockRows) {
      const attrRaw = b?.id_product_attribute && typeof b.id_product_attribute === 'object' ? b.id_product_attribute['#text'] : b?.id_product_attribute;
      const attrId = parseInt(String(attrRaw ?? 0), 10) || 0;
      const qRaw = b?.quantity && typeof b.quantity === 'object' ? b.quantity['#text'] : b?.quantity;
      const qty = parseInt(String(qRaw ?? 0), 10);
      if (Number.isFinite(qty)) {
        if (attrId === 0) baseStock += qty; else comboStock += qty;
      }
    }

    // 变体：attributeValueIds → 颜色名
    const ovMap = new Map<number, string>((ov || []).map((v: any) => [v.id, v.name]));
    const variants = (combos || []).map((c: any) => ({
      id: c.id,
      colors: (c.attributeValueIds || []).map((id: number) => ovMap.get(id) || '').filter(Boolean),
      quantity: c.quantity ?? 0,
      reference: c.reference || '',
      price: c.price || 0,
    }));

    // 总库存：有变体 → 组合库存合计；无变体（单一产品）→ 产品级库存
    const stockQuantity = variants.length > 0 ? comboStock : baseStock;

    return { imageCount, stockQuantity, variants };
  } catch {
    return null;
  }
}

/** 批量查询产品在网站的启用状态（active），返回 { psId: boolean } */
export async function fetchProductsActiveMap(psIds: number[]): Promise<Record<number, boolean>> {
  const ids = (psIds || []).filter(Boolean);
  if (!ids.length) return {};
  try {
    const config = loadPrestaShopConfig();
    if (!config.baseUrl || !config.apiKey) return {};
    const client = new PrestaShopClient(config);
    const data = await Promise.race([
      client.get('products', { 'filter[id]': '[' + ids.join('|') + ']', display: '[id,active]', limit: String(ids.length) }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 6000)),
    ]);
    const blocks = (data as any)?.products?.product;
    const list = Array.isArray(blocks) ? blocks : blocks ? [blocks] : [];
    const map: Record<number, boolean> = {};
    for (const p of list) {
      const id = Number(p?.id ?? 0);
      const activeRaw = p?.active && typeof p.active === 'object' ? p.active['#text'] : p?.active;
      if (id) map[id] = String(activeRaw) === '1';
    }
    return map;
  } catch {
    return {};
  }
}

/** 读取全部属性值（含型号/尺寸组，用于变体颜色名映射） */
async function fetchAllOptionValues(): Promise<any[]> {
  try {
    const config = loadPrestaShopConfig();
    if (!config.baseUrl || !config.apiKey) return [];
    const client = new PrestaShopClient(config);
    const data = await client.get('product_option_values', { display: '[id,id_attribute_group,name]' });
    const blocks = (data as any)?.product_option_values?.product_option_value;
    const list = Array.isArray(blocks) ? blocks : blocks ? [blocks] : [];
    return list.map((v: any) => {
      const nameRaw = v?.name?.language;
      const langs = Array.isArray(nameRaw) ? nameRaw : nameRaw ? [nameRaw] : [];
      const target = langs.find((l: any) => String(l['@_id']) === String(config.spanishLangId || config.defaultLangId)) || langs[0];
      return { id: Number(v?.id ?? 0), name: String(target?.['#text'] ?? target ?? '').trim(), id_attribute_group: Number(v?.id_attribute_group ?? 0) };
    }).filter((v: any) => v.id && v.name);
  } catch { return []; }
}

/** 读取某产品全部 stock_availables（真实库存来源；含 id_product_attribute=0 的产品级记录） */
async function fetchStockAvailables(productId: number): Promise<any | null> {
  const base = (getSetting('prestashop_base_url') || 'https://www.temco.es').replace(/\/+$/, '');
  const key = getSetting('prestashop_api_key');
  if (!key) return null;
  const url = new URL(`${base}/api/stock_availables`);
  url.searchParams.set('ws_key', key);
  url.searchParams.set('filter[id_product]', `[${productId}]`);
  url.searchParams.set('display', '[id,id_product_attribute,quantity]');
  const resp = await fetch(url.toString(), { redirect: 'follow' });
  if (!resp.ok) return null;
  const text = await resp.text();
  try {
    const { XMLParser } = require('fast-xml-parser');
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const parsed = parser.parse(text);
    return parsed?.prestashop || parsed;
  } catch {
    return null;
  }
}
