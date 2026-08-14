// 手机壳点货统计：手机型号目录（品牌 → 型号）。仅统计用，不同步网站。
import { getDatabase } from '../../database/database';

// 预置常见品牌型号（可按需扩展；手机壳点货统计用）
const PRESET_MODELS: { brand: string; model: string }[] = [
  // iPhone
  { brand: 'iPhone', model: 'iPhone 17 Pro' }, { brand: 'iPhone', model: 'iPhone 17 Pro Max' },
  { brand: 'iPhone', model: 'iPhone 17' }, { brand: 'iPhone', model: 'iPhone 17 Air' },
  { brand: 'iPhone', model: 'iPhone 16 Pro' }, { brand: 'iPhone', model: 'iPhone 16 Pro Max' },
  { brand: 'iPhone', model: 'iPhone 16' }, { brand: 'iPhone', model: 'iPhone 16e' },
  { brand: 'iPhone', model: 'iPhone 15 Pro' }, { brand: 'iPhone', model: 'iPhone 15 Pro Max' },
  { brand: 'iPhone', model: 'iPhone 15' }, { brand: 'iPhone', model: 'iPhone 14' },
  { brand: 'iPhone', model: 'iPhone 13' }, { brand: 'iPhone', model: 'iPhone 12' },
  { brand: 'iPhone', model: 'iPhone 11' }, { brand: 'iPhone', model: 'iPhone XR' },
  { brand: 'iPhone', model: 'iPhone SE' },
  // Samsung
  { brand: 'Samsung', model: 'Galaxy S25' }, { brand: 'Samsung', model: 'Galaxy S25 Ultra' },
  { brand: 'Samsung', model: 'Galaxy S24' }, { brand: 'Samsung', model: 'Galaxy S24 Ultra' },
  { brand: 'Samsung', model: 'Galaxy S23' }, { brand: 'Samsung', model: 'Galaxy A15' },
  { brand: 'Samsung', model: 'Galaxy A16' }, { brand: 'Samsung', model: 'Galaxy A35' },
  { brand: 'Samsung', model: 'Galaxy A55' }, { brand: 'Samsung', model: 'Galaxy A25' },
  { brand: 'Samsung', model: 'Galaxy A06' }, { brand: 'Samsung', model: 'Galaxy A05' },
  { brand: 'Samsung', model: 'Galaxy Z Flip6' }, { brand: 'Samsung', model: 'Galaxy Z Fold6' },
  { brand: 'Samsung', model: 'Galaxy Note 20' },
  // Xiaomi
  { brand: 'Xiaomi', model: 'Redmi Note 15' }, { brand: 'Xiaomi', model: 'Redmi Note 14' },
  { brand: 'Xiaomi', model: 'Redmi Note 14 Pro' }, { brand: 'Xiaomi', model: 'Redmi Note 13' },
  { brand: 'Xiaomi', model: 'Redmi Note 13 Pro' }, { brand: 'Xiaomi', model: 'Redmi 14C' },
  { brand: 'Xiaomi', model: 'Redmi 13C' }, { brand: 'Xiaomi', model: 'Xiaomi 15' },
  { brand: 'Xiaomi', model: 'Xiaomi 15 Pro' }, { brand: 'Xiaomi', model: 'Xiaomi 14' },
  { brand: 'Xiaomi', model: 'Xiaomi 14T' }, { brand: 'Xiaomi', model: 'Poco X7' },
  { brand: 'Xiaomi', model: 'Poco X6' }, { brand: 'Xiaomi', model: 'Poco M6' },
  // Huawei
  { brand: 'Huawei', model: 'Pura 70' }, { brand: 'Huawei', model: 'P60 Pro' },
  { brand: 'Huawei', model: 'Mate 60' }, { brand: 'Huawei', model: 'Nova 12' },
  // Oppo / Vivo / Realme / OnePlus
  { brand: 'OPPO', model: 'Reno 13' }, { brand: 'OPPO', model: 'Reno 12' },
  { brand: 'OPPO', model: 'A78' }, { brand: 'OPPO', model: 'A60' },
  { brand: 'vivo', model: 'V40' }, { brand: 'vivo', model: 'V30' },
  { brand: 'vivo', model: 'Y19s' }, { brand: 'vivo', model: 'Y28' },
  { brand: 'realme', model: '12 Pro' }, { brand: 'realme', model: 'Note 60' },
  { brand: 'realme', model: 'C67' }, { brand: 'OnePlus', model: '13' },
  { brand: 'OnePlus', model: '12' }, { brand: 'OnePlus', model: 'Nord 4' },
  // Google / Motorola / 其他
  { brand: 'Google', model: 'Pixel 9' }, { brand: 'Google', model: 'Pixel 9 Pro' },
  { brand: 'Google', model: 'Pixel 8a' }, { brand: 'Motorola', model: 'Moto G84' },
  { brand: 'Motorola', model: 'Moto G54' }, { brand: 'Motorola', model: 'Edge 50' },
];

/** 型号名规范化：去空白/大小写/品牌前缀，用于去重比较（Galaxy S25 Ultra ≡ Samsung S25 Ultra） */
function normalizeModel(model: string): string {
  let m = (model || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const prefixes = [
    'samsung galaxy', 'samsung', 'galaxy', 'xiaomi', 'redmi', 'poco', 'huawei', 'honor',
    'oppo', 'vivo', 'realme', 'oneplus', 'one plus', 'google pixel', 'pixel',
    'motorola', 'moto', 'iphone', 'ipad', 'apple',
  ];
  for (const p of prefixes) {
    if (m === p) { m = ''; break; }
    if (m.startsWith(p + ' ')) { m = m.slice(p.length + 1); break; }
  }
  return m;
}

/** 型号名 → 品牌归类（关键词优先，规则简单可靠） */
export function classifyBrand(model: string): string {  const m = (model || '').trim().toLowerCase();
  if (!m) return '其他品牌';
  const has = (k: string[]) => k.some(x => m.includes(x));
  if (has(['iphone', ' iphone', ' i-phone'])) return 'iPhone';
  if (has(['samsung', 'galaxy', 'note 20', 'note20', 'z flip', 'z fold'])) return 'Samsung';
  if (has(['xiaomi', 'redmi', 'poco', 'mi '])) return 'Xiaomi';
  if (has(['huawei', 'honor'])) return 'Huawei';
  if (has(['oppo', 'realme', 'oneplus', 'one plus'])) return 'OPPO';
  if (has(['vivo'])) return 'vivo';
  if (has(['pixel', 'google'])) return 'Google';
  if (has(['motorola', 'moto '])) return 'Motorola';
  return '其他品牌';
}

/** 读取网站 Modelo 属性组（id_attribute_group=8）的型号值 */
async function fetchWebsiteModelValues(): Promise<string[]> {
  try {
    const db = getDatabase();
    const gs = (k: string) => String((db.prepare('SELECT value FROM api_settings WHERE key = ?').get(k) as any)?.value || '');
    const base = (gs('prestashop_base_url') || 'https://www.temco.es').replace(/\/+$/, '');
    const key = gs('prestashop_api_key');
    if (!key) return [];
    const url = new URL(`${base}/api/product_option_values`);
    url.searchParams.set('ws_key', key);
    url.searchParams.set('filter[id_attribute_group]', '[8]');
    url.searchParams.set('display', '[id,name]');
    const resp = await Promise.race([
      fetch(url.toString(), { redirect: 'follow' }),
      new Promise<Response>(resolve => setTimeout(() => resolve(new Response('')), 6000)),
    ]);
    if (!resp.ok) return [];
    const txt = await resp.text();
    const names = [...txt.matchAll(/<name><language[^>]*><!\[CDATA\[([^\]]+)\]\]><\/language><\/name>/g)].map(m => m[1]);
    return names.filter((n: string) => n && n.trim()).map((n: string) => n.trim());
  } catch {
    return [];
  }
}

/** 品牌容器 → 品牌映射（网站分类：Accesorios para SAMSUNG → Samsung） */
const BRAND_CONTAINER_KEYWORDS: { kw: string; brand: string }[] = [
  { kw: 'iphone', brand: 'iPhone' }, { kw: 'ipad', brand: 'iPad' },
  { kw: 'samsung', brand: 'Samsung' }, { kw: 'xiaomi', brand: 'Xiaomi' },
  { kw: 'redmi', brand: 'Xiaomi' }, { kw: 'pocophone', brand: 'Xiaomi' }, { kw: 'poco', brand: 'Xiaomi' },
  { kw: 'huawei', brand: 'Huawei' }, { kw: 'honor', brand: 'Huawei' },
  { kw: 'oppo', brand: 'OPPO' }, { kw: 'vivo', brand: 'vivo' }, { kw: 'realme', brand: 'realme' },
  { kw: 'oneplus', brand: 'OnePlus' }, { kw: 'google', brand: 'Google' }, { kw: 'pixel', brand: 'Google' },
  { kw: 'motorola', brand: 'Motorola' },
];

/** 扫描网站分类树：品牌容器（Accesorios XXX）→ 子分类 = 型号列表 */
async function fetchWebsiteCategoryModels(): Promise<{ brand: string; models: string[] }[]> {
  try {
    const db = getDatabase();
    const gs = (k: string) => String((db.prepare('SELECT value FROM api_settings WHERE key = ?').get(k) as any)?.value || '');
    const base = (gs('prestashop_base_url') || 'https://www.temco.es').replace(/\/+$/, '');
    const key = gs('prestashop_api_key');
    if (!key) return [];
    const url = new URL(`${base}/api/categories`);
    url.searchParams.set('ws_key', key);
    url.searchParams.set('display', '[id,id_parent,name]');
    url.searchParams.set('limit', '0,800');
    const resp = await Promise.race([
      fetch(url.toString(), { redirect: 'follow' }),
      new Promise<Response>(resolve => setTimeout(() => resolve(new Response('')), 10000)),
    ]);
    if (!resp.ok) return [];
    const txt = await resp.text();
    const cats: { id: number; pid: number; name: string }[] = [];
    const re = /<category>([\s\S]*?)<\/category>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) {
      const b = m[1];
      cats.push({
        id: Number((b.match(/<id><!\[CDATA\[(\d+)\]\]><\/id>/) || [])[1] || 0),
        pid: Number((b.match(/<id_parent[^>]*><!\[CDATA\[(\d+)\]\]><\/id_parent>/) || [])[1] || 0),
        name: (b.match(/<name><language[^>]*><!\[CDATA\[([^\]]+)\]\]><\/language><\/name>/) || [])[1] || '',
      });
    }
    const childrenOf = new Map<number, { id: number; name: string }[]>();
    for (const c of cats) {
      if (!childrenOf.has(c.pid)) childrenOf.set(c.pid, []);
      childrenOf.get(c.pid)!.push(c);
    }
    const out: { brand: string; models: string[] }[] = [];
    for (const c of cats) {
      const lower = c.name.toLowerCase();
      if (!lower.includes('accesorios') && !lower.includes('fundas') && !lower.includes('carcasas')) continue;
      const children = childrenOf.get(c.id) || [];
      if (children.length < 2) continue;
      // 找品牌
      const hit = BRAND_CONTAINER_KEYWORDS.find(k => lower.includes(k.kw));
      const brand = hit ? hit.brand : '其他品牌';
      const models = children
        .map(x => x.name.trim())
        .filter(n => n && !/accesorios|fundas|carcasas|otro|otros/i.test(n));
      if (models.length) out.push({ brand, models });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 同步手机型号目录与网站保持一致：
 * - 全量替换网站分类树（website_category）与 Modelo 组（website）的型号（删除已下架分类）
 * - 预置型号（preset）保持不变
 * 返回本次同步统计。
 */
export async function syncPhoneModelCatalog(): Promise<{ added: number; removed: number; total: number }> {
  const db = getDatabase();
  const website = await fetchWebsiteModelValues();
  const categoryGroups = await fetchWebsiteCategoryModels();
  // 网站拉取失败（两者皆空）时保留现有目录，避免误删
  if (!website.length && categoryGroups.length === 0) {
    const total = (db.prepare('SELECT count(*) AS c FROM phone_model_catalog').get() as any).c;
    return { added: 0, removed: 0, total };
  }
  const removed = db.prepare("DELETE FROM phone_model_catalog WHERE source IN ('website','website_category')").run().changes;
  let added = 0;
  for (const g of categoryGroups) {
    for (const model of g.models) {
      db.prepare('INSERT OR IGNORE INTO phone_model_catalog (brand, model, source) VALUES (?, ?, ?)')
        .run(g.brand, model, 'website_category');
      added++;
    }
  }
  for (const model of website) {
    db.prepare('INSERT OR IGNORE INTO phone_model_catalog (brand, model, source) VALUES (?, ?, ?)')
      .run(classifyBrand(model), model, 'website');
    added++;
  }
  // 预置也写入（首次）
  for (const p of PRESET_MODELS) {
    db.prepare('INSERT OR IGNORE INTO phone_model_catalog (brand, model, source) VALUES (?, ?, ?)')
      .run(p.brand, p.model, 'preset');
  }
  const total = (db.prepare('SELECT count(*) AS c FROM phone_model_catalog').get() as any).c;
  return { added, removed, total };
}

let lastSyncAt = 0;
/** 节流同步：距上次同步超过 10 分钟则重新拉取网站（启动首次 lastSyncAt=0 必触发）。返回 null 表示跳过 */
export async function maybeSyncPhoneModelCatalog(force = false): Promise<{ added: number; removed: number; total: number } | null> {
  if (!force && Date.now() - lastSyncAt < 10 * 60 * 1000) return null;
  lastSyncAt = Date.now();
  try {
    return await syncPhoneModelCatalog();
  } catch {
    // 网站不可用时保持现有目录，不影响手机端
    return null;
  }
}

/** 手机型号目录（按品牌分组）：读本地 catalog，快速返回（同步由启动钩子 / maybeSync 触发） */
export function getPhoneModelGroups(): { brand: string; models: string[] }[] {
  const db = getDatabase();
  // 网站来源（分类树 / Modelo 组）优先于预置型号，保证规范化去重时保留网站命名（Samsung S25 Ultra 而非 Galaxy S25 Ultra）
  const rows = db.prepare(
    "SELECT brand, model FROM phone_model_catalog ORDER BY CASE source WHEN 'website_category' THEN 0 WHEN 'website' THEN 1 ELSE 2 END, brand, id"
  ).all() as any[];
  // 型号顺序 = 网站分类树入库顺序优先，预置等补充型号追加到品牌末尾。
  // 去重按规范化名称（Galaxy S25 Ultra 与 Samsung S25 Ultra 视为同一型号），分类树版本优先保留
  const groups = new Map<string, string[]>();
  const seenNorm = new Map<string, string>();
  const addModel = (brand: string, model: string) => {
    const norm = normalizeModel(model);
    if (!norm) return;
    const key = brand + '|' + norm;
    if (seenNorm.has(key)) return;
    seenNorm.set(key, model);
    if (!groups.has(brand)) groups.set(brand, []);
    groups.get(brand)!.push(model);
  };
  for (const r of rows) addModel(r.brand, r.model);
  const order = ['iPhone', 'Samsung', 'Xiaomi', 'Huawei', 'OPPO', 'vivo', 'realme', 'Google', 'Motorola', '其他品牌'];
  return Array.from(groups.entries())
    .sort((a, b) => (order.indexOf(a[0]) === -1 ? 99 : order.indexOf(a[0])) - (order.indexOf(b[0]) === -1 ? 99 : order.indexOf(b[0])))
    .map(([brand, models]) => ({ brand, models }));
}

/** 保存任务勾选的手机型号（JSON：[{brand, model}]） */
export function saveCapturePhoneModels(captureId: number, models: { brand: string; model: string }[]): void {
  const db = getDatabase();
  db.prepare('UPDATE mobile_captures SET phone_models = ? WHERE id = ?')
    .run(models && models.length ? JSON.stringify(models) : '', captureId);
}

/** 读取任务勾选的手机型号 */
export function getCapturePhoneModels(captureId: number): { brand: string; model: string }[] {
  const db = getDatabase();
  const row = db.prepare('SELECT phone_models FROM mobile_captures WHERE id = ?').get(captureId) as any;
  if (!row?.phone_models) return [];
  try {
    const v = JSON.parse(row.phone_models);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
