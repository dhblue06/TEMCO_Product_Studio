// PrestaShop 组合（变体）服务：读取/创建/更新/删除网站现有变体
import { getDatabase } from '../../database/database';
import { PrestaShopClient } from './prestashopClient';

export interface PSCombination {
  id: number;
  reference: string;
  ean13: string;
  quantity: number;
  price: number;
  attributeValueIds: number[];
}

export interface PSOptionValue {
  id: number;
  idAttributeGroup: number;
  name: string;
  /** PrestaShop 属性值的颜色色值（hex，仅颜色组有值） */
  color?: string;
  /** 纹理小图片 URL（按惯例 img/co/{id}.jpg 构造；可能不存在，前端加载失败回退 hex 色块） */
  textureUrl?: string;
}

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

function getClient(): PrestaShopClient {
  return new PrestaShopClient(loadConfig());
}

/** 提取 XML 中单个字段值（支持 CDATA） */
function field(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}(?:[^>]*)>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`));
  return m ? m[1].trim() : '';
}

/** 解析 combinations 列表 XML */
export function parseCombinations(xml: string): PSCombination[] {
  const blocks = xml.match(/<combination>[\s\S]*?<\/combination>/g) || [];
  return blocks.map(b => {
    // 精确匹配单个 product_option_value（避免误匹配 product_option_values 容器），并剥离 CDATA
    const attrIds = [...b.matchAll(/<product_option_value(?:\s[^>]*)?>[\s\S]*?<id>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/id>/g)]
      .map(m => parseInt(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim(), 10))
      .filter(n => !isNaN(n));
    return {
      id: parseInt(field(b, 'id'), 10) || 0,
      reference: field(b, 'reference'),
      ean13: field(b, 'ean13'),
      quantity: parseInt(field(b, 'quantity') || field(b, 'default_quantity'), 10) || 0,
      price: parseFloat(field(b, 'price')) || 0,
      attributeValueIds: attrIds,
    };
  }).filter(c => c.id > 0);
}

/** 解析 product_option_values（属性值/颜色）列表 XML */
export function parseOptionValues(xml: string): PSOptionValue[] {
  const blocks = xml.match(/<product_option_value>[\s\S]*?<\/product_option_value>/g) || [];
  return blocks.map(b => {
    const nameMatch = b.match(/<name[^>]*>[\s\S]*?<language[^>]*>([\s\S]*?)<\/language>/);
    let name = nameMatch ? nameMatch[1].trim() : '';
    // 去掉 CDATA 包裹
    name = name.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    const colorRaw = field(b, 'color').trim();
    return {
      id: parseInt(field(b, 'id'), 10) || 0,
      idAttributeGroup: parseInt(field(b, 'id_attribute_group'), 10) || 0,
      name,
      color: /^#?[0-9a-fA-F]{3,8}$/.test(colorRaw) ? colorRaw : '',
    };
  }).filter(v => v.id > 0 && v.name);
}

/** 直接请求 PrestaShop 并返回 XML 文本；失败时抛出带真实原因的详细错误 */
async function fetchPrestashopXml(resource: string): Promise<string> {
  const base = (getSetting('prestashop_base_url') || 'https://temcostar.com').replace(/\/+$/, '');
  const key = getSetting('prestashop_api_key');
  if (!key) throw new Error('未配置 PrestaShop API Key（请先在设置中填写）');
  const url = new URL(`${base}/api/${resource}`);
  url.searchParams.set('ws_key', key);
  const resp = await fetch(url.toString(), { redirect: 'follow' });
  const text = await resp.text();
  if (!resp.ok) {
    // 提取 PrestaShop 错误 message（如 "Resource ... is not allowed with this authentication key"）
    const m = text.match(/<message>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/message>/);
    const msg = (m ? m[1] : text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error(`PrestaShop API ${resp.status}: ${msg || '请求失败'}`);
  }
  return text;
}

/** 读取网站现有变体（quantity 从 stock_availables 合并，反映真实库存） */
export async function fetchCombinations(productId: number): Promise<PSCombination[]> {
  const [combXml, stockXml] = await Promise.all([
    fetchPrestashopXml(`combinations?filter[id_product]=[${productId}]&display=full`),
    // 兼容旧版本：先尝试带 filter，失败则全量后过滤
    fetchPrestashopXml(`stock_availables?filter[id_product]=[${productId}]&display=[id,id_product_attribute,quantity]`)
      .catch(() => fetchPrestashopXml('stock_availables?display=[id,id_product_attribute,quantity]')),
  ]);
  const combos = parseCombinations(combXml);
  // stock 映射：id_product_attribute(组合ID) → quantity
  const stockQty = new Map<number, number>();
  const stockBlocks = stockXml.match(/<stock_available>[\s\S]*?<\/stock_available>/g) || [];
  for (const b of stockBlocks) {
    const comboId = parseInt(field(b, 'id_product_attribute'), 10) || 0;
    const qty = parseInt(field(b, 'quantity'), 10) || 0;
    if (comboId > 0) stockQty.set(comboId, qty);
  }
  return combos.map(c => ({ ...c, quantity: stockQty.get(c.id) ?? c.quantity }));
}

/** 读取网站属性值；scope='color' 仅 Color 组（id_attribute_group=1/9），默认全量（变体名称映射需要全量） */
export async function fetchOptionValues(scope?: 'color'): Promise<PSOptionValue[]> {
  // 注意：此站点的 product_option_values 仅支持 display 字段 id,id_attribute_group,color,position,name（无 texture）
  const filter = scope === 'color' ? '&filter[id_attribute_group]=[1|9]' : '';
  const xml = await fetchPrestashopXml(`product_option_values?display=[id,id_attribute_group,name,color]${filter}`);
  const values = parseOptionValues(xml);
  // 纹理小图片按 PrestaShop 惯例路径 img/co/{属性值id}.jpg 构造（如 https://temcostar.com/img/co/142.jpg）；
  // 不是每个属性值都有图，前端 <img> 加载失败时会自动回退 hex 色块。
  const base = (getSetting('prestashop_base_url') || 'https://temcostar.com').replace(/\/+$/, '');
  return values.map(v => ({ ...v, textureUrl: `${base}/img/co/${v.id}.jpg` }));
}

/** 检测变体相关资源权限（组合/属性值/库存） */
export async function checkPermissions(): Promise<{ resource: string; ok: boolean; error?: string }[]> {
  const resources = ['combinations', 'product_option_values', 'stock_availables'];
  const out: { resource: string; ok: boolean; error?: string }[] = [];
  for (const r of resources) {
    try {
      await fetchPrestashopXml(`${r}?display=[id]`);
      out.push({ resource: r, ok: true });
    } catch (e: any) {
      out.push({ resource: r, ok: false, error: e.message });
    }
  }
  return out;
}

/** 构建组合 XML（创建用；补齐 PS 必填/常用字段） */
function buildCombinationXml(productId: number, data: {
  reference?: string; ean13?: string; price?: number | null; quantity?: number | null;
  attributeValueIds?: number[];
}): string {
  const attrs = (data.attributeValueIds || []).map(id =>
    `        <product_option_value><id>${id}</id></product_option_value>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <combination>
    <id_product>${productId}</id_product>
    <location></location>
    <ean13>${data.ean13 || ''}</ean13>
    <isbn></isbn>
    <upc></upc>
    <mpn></mpn>
    <quantity>${data.quantity ?? 0}</quantity>
    <reference>${data.reference || ''}</reference>
    <supplier_reference></supplier_reference>
    <wholesale_price>0</wholesale_price>
    <price>${data.price ?? 0}</price>
    <ecotax>0</ecotax>
    <weight>0</weight>
    <unit_price_impact>0</unit_price_impact>
    <minimal_quantity>1</minimal_quantity>
    <low_stock_threshold>0</low_stock_threshold>
    <low_stock_alert>0</low_stock_alert>
    <default_on>0</default_on>
    <available_date>0000-00-00</available_date>
    <associations>
      <product_option_values>
${attrs}
      </product_option_values>
    </associations>
  </combination>
</prestashop>`;
}

/** 更新库存（尽力而为，失败不阻塞） */
async function updateStock(productId: number, combinationId: number, quantity: number | null | undefined): Promise<void> {
  if (quantity === undefined || quantity === null) return;
  try {
    const client = getClient();
    const xml = await client.getRawXml(`stock_availables?filter[id_product]=[${productId}]&filter[id_product_attribute]=[${combinationId}]&display=[id,quantity]`);
    const id = parseInt(field(xml || '', 'id'), 10);
    if (!id) return;
    const full = await client.getRawXml(`stock_availables/${id}?display=full`);
    if (!full) return;
    let modified = full.replace(/(<quantity[^>]*>)(?:<!\[CDATA\[)?[\s\S]*?(?:\]\]>)?(<\/quantity>)/, `$1${quantity}$2`);
    modified = modified.replace(/\s*<(product_name|product_attribute_name)[^>]*>[\s\S]*?<\/\1>\s*/g, '\n');
    await client.putXml('stock_availables', id, modified);
  } catch (e) {
    console.error('[Combination] updateStock failed:', (e as Error).message);
  }
}

/** 创建变体 */
export async function createCombination(productId: number, data: {
  reference?: string; ean13?: string; price?: number | null; quantity?: number | null;
  attributeValueIds?: number[];
}): Promise<number> {
  if (!data.attributeValueIds || data.attributeValueIds.length === 0) {
    throw new Error('新增变体必须选择至少一个属性值（如颜色）');
  }
  const client = getClient();
  const res = await client.postXml('combinations', buildCombinationXml(productId, data));
  const id = Number(res?.combination?.id || extractCreatedId(res));
  if (!id) throw new Error('创建失败，未获取到变体 ID');
  await updateStock(productId, id, data.quantity);
  return id;
}

function extractCreatedId(res: any): number {
  try {
    const text = typeof res === 'string' ? res : JSON.stringify(res);
    const m = text.match(/<id>(\d+)<\/id>/);
    return m ? parseInt(m[1], 10) : 0;
  } catch { return 0; }
}

/** 更新变体（回读网站现有 XML → 修改字段 → PUT） */
export async function updateCombination(id: number, data: {
  reference?: string; ean13?: string; price?: number | null; quantity?: number | null;
  attributeValueIds?: number[];
}, productId?: number): Promise<void> {
  const client = getClient();
  const full = await client.getRawXml(`combinations/${id}?display=full`);
  if (!full) throw new Error('无法读取网站现有变体');
  let xml = full;

  if (data.reference !== undefined) {
    xml = xml.replace(/(<reference[^>]*>)(?:<!\[CDATA\[)?[\s\S]*?(?:\]\]>)?(<\/reference>)/, `$1${data.reference}$2`);
  }
  if (data.ean13 !== undefined) {
    xml = xml.replace(/(<ean13[^>]*>)(?:<!\[CDATA\[)?[\s\S]*?(?:\]\]>)?(<\/ean13>)/, `$1${data.ean13}$2`);
  }
  if (data.price !== undefined) {
    xml = xml.replace(/(<price[^>]*>)(?:<!\[CDATA\[)?[\s\S]*?(?:\]\]>)?(<\/price>)/, `$1${data.price ?? 0}$2`);
  }
  if (data.attributeValueIds) {
    const attrs = data.attributeValueIds.map(v =>
      `        <product_option_value><id>${v}</id></product_option_value>`
    ).join('\n');
    const newAssoc = `<associations>
      <product_option_values>
${attrs}
      </product_option_values>
    </associations>`;
    xml = xml.replace(/<associations>[\s\S]*?<\/associations>/, newAssoc);
  }

  // 移除只读字段（quantity 来自 stock_available，不能直接写）
  xml = xml.replace(/\s*<quantity[^>]*>[\s\S]*?<\/quantity>\s*/, '\n');
  await client.putXml('combinations', id, xml);
  if (productId) await updateStock(productId, id, data.quantity);
}

/** 删除变体 */
export async function deleteCombination(id: number): Promise<void> {
  await getClient().deleteResource('combinations', id);
}
