// 手机采集产品匹配服务（文档 8.3 匹配优先级）
import { getDatabase } from '../../database/database';
import { normalizeModelKey, extractSixDigitSerial } from '../productImage/productImageNameParser';

export interface ProductMatch {
  productId: number;
  reference: string;
  name: string;
  model: string;
  ean13: string;
  serialNumber: string;
  brand: string;
  category: string;
  prestashopId: string;
  price?: number | null;
  soldOut?: boolean;
  fixedColors?: string[];
  website?: { imageCount: number; quantity: number; variants: { id: number; colors: string[]; quantity: number; reference: string; price: number }[] } | null;
  matchMethod: string;
  matchedValue: string;
  confidence: number;
}

export interface MatchResult {
  match: ProductMatch | null;
  candidates: ProductMatch[];
  message: string;
}

/** 解析产品固定颜色（JSON 数组，容错） */
export function parseFixedColors(raw: any): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(c => typeof c === 'string' && c.trim()) : [];
  } catch { return []; }
}

/**
 * 按优先级查找产品（文档 8.3）：
 * 1. EAN 精确 1.0
 * 2. 6 位序列号 = serial_number 1.0
 * 3. 6 位序列号 = reference 1.0
 * 4. Reference 精确 1.0
 * 5. 型号标准化精确 0.98
 * 6. 型号在名称中 0.95
 * 7. 名称模糊 → 候选列表人工选择
 */
export function matchProduct(query: string): MatchResult {
  const db = getDatabase();
  const q = (query || '').trim();
  if (!q) return { match: null, candidates: [], message: '查询为空' };

  const allProducts = db.prepare(`
    SELECT id, reference, name, model, ean13, serial_number, brand, category, prestashop_id, price, sold_out, fixed_colors
    FROM products
  `).all() as any[];

  const toMatch = (p: any, method: string, matchedValue: string, confidence: number): ProductMatch => ({
    productId: p.id,
    reference: p.reference || '',
    name: p.name || '',
    model: p.model || '',
    ean13: p.ean13 || '',
    serialNumber: p.serial_number || '',
    brand: p.brand || '',
    category: p.category || '',
    prestashopId: p.prestashop_id || '',
    price: p.price ?? null,
    soldOut: p.sold_out ? true : false,
    fixedColors: parseFixedColors(p.fixed_colors),
    matchMethod: method,
    matchedValue,
    confidence,
  });

  // 1. EAN 精确匹配（EAN-13 通常 13 位数字）
  if (/^\d{8,14}$/.test(q)) {
    const hits = allProducts.filter(p => p.ean13 && p.ean13.replace(/\D/g, '') === q.replace(/\D/g, ''));
    if (hits.length === 1) return { match: toMatch(hits[0], 'ean_exact', q, 1.0), candidates: [], message: 'EAN 精确匹配' };
    if (hits.length > 1) return { match: null, candidates: hits.map(h => toMatch(h, 'ean_exact', q, 1.0)), message: '多个产品命中同一 EAN' };
  }

  // 2/3. 6 位序列号匹配 serial_number / reference
  const sixDigit = extractSixDigitSerial(q) || (/^\d{6}$/.test(q) ? q : null);
  if (sixDigit) {
    const serialHits = allProducts.filter(p => p.serial_number && String(p.serial_number) === sixDigit);
    if (serialHits.length === 1) return { match: toMatch(serialHits[0], 'serial_exact', sixDigit, 1.0), candidates: [], message: '序列号匹配' };
    if (serialHits.length > 1) return { match: null, candidates: serialHits.map(h => toMatch(h, 'serial_exact', sixDigit, 1.0)), message: '多个产品命中同一序列号' };

    const refHits = allProducts.filter(p => p.reference && String(p.reference) === sixDigit);
    if (refHits.length === 1) return { match: toMatch(refHits[0], 'serial_as_reference', sixDigit, 1.0), candidates: [], message: '序列号匹配 Reference' };
    if (refHits.length > 1) return { match: null, candidates: refHits.map(h => toMatch(h, 'serial_as_reference', sixDigit, 1.0)), message: '多个产品命中' };
  }

  // 4. Reference 精确匹配
  const refKey = normalizeModelKey(q);
  const refHits = allProducts.filter(p => p.reference && normalizeModelKey(p.reference) === refKey);
  if (refHits.length === 1) return { match: toMatch(refHits[0], 'reference_exact', q, 1.0), candidates: [], message: 'Reference 精确匹配' };
  if (refHits.length > 1) return { match: null, candidates: refHits.map(h => toMatch(h, 'reference_exact', q, 1.0)), message: '多个产品命中同一 Reference' };

  // 5. 型号标准化精确匹配
  const modelHits = allProducts.filter(p => p.model && normalizeModelKey(p.model) === refKey);
  if (modelHits.length === 1) return { match: toMatch(modelHits[0], 'model_exact', q, 0.98), candidates: [], message: '型号精确匹配' };
  if (modelHits.length > 1) return { match: null, candidates: modelHits.map(h => toMatch(h, 'model_exact', q, 0.98)), message: '多个产品命中同一型号，请选择' };

  // 6. 型号出现在产品名称中
  const qUpper = q.toUpperCase();
  const nameHits = allProducts.filter(p => (p.name || '').toUpperCase().includes(qUpper));
  if (nameHits.length === 1) return { match: toMatch(nameHits[0], 'name_contains', q, 0.95), candidates: [], message: '型号出现在产品名称中' };
  if (nameHits.length > 1) return { match: null, candidates: nameHits.map(h => toMatch(h, 'name_contains', q, 0.95)), message: '多个候选产品，请选择' };

  // 7. 名称模糊搜索（LIKE，返回候选）
  const likeHits = allProducts
    .filter(p => (p.name || '').toUpperCase().includes(qUpper) || (p.reference || '').toUpperCase().includes(qUpper))
    .slice(0, 20);
  if (likeHits.length > 0) return { match: null, candidates: likeHits.map(h => toMatch(h, 'fuzzy', q, 0.5)), message: '找到候选产品，请选择' };

  return { match: null, candidates: [], message: '未找到匹配产品' };
}

/** 获取产品采集状态信息（文档 8.4/8.5） */
export function getProductCaptureStatus(productId: number) {
  const db = getDatabase();
  const product = db.prepare(`
    SELECT p.id, p.reference, p.name, p.model, p.ean13, p.serial_number, p.brand, p.category,
           p.prestashop_id, p.quantity
    FROM products p WHERE p.id = ?
  `).get(productId) as any;
  if (!product) return null;

  const imageCount = (db.prepare('SELECT COUNT(*) as c FROM product_images WHERE product_id = ?').get(productId) as any)?.c || 0;
  const lastCapture = db.prepare(`
    SELECT id, capture_status, created_at, submitted_at
    FROM mobile_captures WHERE product_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(productId) as any;

  // 未完成采集任务（防止重复采集，8.5）
  const activeCapture = db.prepare(`
    SELECT c.id, c.capture_status, c.created_at,
      (SELECT COUNT(*) FROM mobile_capture_images i WHERE i.capture_id = c.id) as image_count,
      (SELECT GROUP_CONCAT(ic.color_name) FROM mobile_capture_image_colors ic
        JOIN mobile_capture_images mi ON mi.id = ic.capture_image_id
        WHERE mi.capture_id = c.id) as colors
    FROM mobile_captures c
    WHERE c.product_id = ? AND c.capture_status IN ('draft','submitted','reviewing','processing','ready')
    ORDER BY c.id DESC LIMIT 1
  `).get(productId) as any;

  return {
    product: {
      id: product.id,
      reference: product.reference,
      name: product.name,
      model: product.model,
      ean13: product.ean13,
      serialNumber: product.serial_number,
      brand: product.brand,
      category: product.category,
      prestashopProductId: product.prestashop_id ? parseInt(product.prestashop_id, 10) || 0 : 0,
      quantity: product.quantity || 0,
      imageCount,
      hasImages: imageCount > 0,
      lastCapture: lastCapture ? { id: lastCapture.id, status: lastCapture.capture_status, createdAt: lastCapture.created_at, submittedAt: lastCapture.submitted_at } : null,
    },
    activeCapture: activeCapture || null,
  };
}

/** 产品名称模糊搜索（候选列表） */
export function searchProductsByName(query: string, limit = 20): any[] {
  const db = getDatabase();
  const q = (query || '').trim();
  if (!q) return [];
  const like = `%${q}%`;
  return db.prepare(`
    SELECT id, reference, name, model, ean13, serial_number, brand, category, prestashop_id, price
    FROM products
    WHERE name LIKE ? OR reference LIKE ? OR model LIKE ? OR ean13 LIKE ?
    ORDER BY updated_at DESC LIMIT ?
  `).all(like, like, like, like, limit);
}
