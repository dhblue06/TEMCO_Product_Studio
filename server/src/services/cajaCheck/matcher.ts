// CAJA 新品检查：匹配器（v1.6 文档 §10-13、§27-29）
// 优先级：有效 EAN 精确 → Reference 精确 → 标准化名称精确 → 新品
// 安全原则：模糊名称相似绝不判 existing；重复匹配 → review；网站读取失败 → 整批失败。
import {
  normalizeReference,
  normalizeBarcode,
  isValidBarcodeCandidate,
  normalizeProductName,
} from './normalizer';
import { CajaProductRow } from './excelParser';
import { WebsiteProductIndex, WebsiteProduct } from './websiteIndex';

export type CajaCheckStatus = 'existing' | 'new' | 'review';

export type CajaMatchMethod =
  | 'ean'
  | 'upc'
  | 'reference'
  | 'exact_name'
  | 'similar_name'
  | 'duplicate_ean'
  | 'duplicate_reference'
  | 'none';

export interface CajaMatchResult {
  status: CajaCheckStatus;
  matchMethod: CajaMatchMethod;
  prestashopProduct?: WebsiteProduct;
  score?: number;
}

/** 唯一匹配返回 existing；多个匹配返回 review（不隐藏可能的新品） */
function uniqueOrReview(
  list: WebsiteProduct[] | undefined,
  status: CajaMatchResult['status'],
  method: CajaMatchMethod,
  duplicateMethod: CajaMatchMethod,
  score: number,
): CajaMatchResult | null {
  if (!list || list.length === 0) return null;
  if (list.length === 1) {
    return { status, matchMethod: method, prestashopProduct: list[0], score };
  }
  return { status: 'review', matchMethod: duplicateMethod, prestashopProduct: list[0], score: 0.5 };
}

export function matchCajaProduct(caja: CajaProductRow, index: WebsiteProductIndex): CajaMatchResult {
  // ① 有效条码 → EAN / UPC
  const barcode = normalizeBarcode(caja.barcode);
  if (isValidBarcodeCandidate(barcode)) {
    const byEan = uniqueOrReview(index.byEan.get(barcode), 'existing', 'ean', 'duplicate_ean', 1);
    if (byEan) return byEan;
    const byUpc = uniqueOrReview(index.byUpc.get(barcode), 'existing', 'upc', 'duplicate_ean', 0.98);
    if (byUpc) return byUpc;
  }

  // ② Reference 精确（trim + 大写）
  const ref = normalizeReference(caja.reference);
  if (ref) {
    const byRef = uniqueOrReview(index.byReference.get(ref), 'existing', 'reference', 'duplicate_reference', 0.99);
    if (byRef) return byRef;
  }

  // ③ 标准化名称精确匹配（只做辅助；唯一匹配才判 existing）
  const normName = normalizeProductName(caja.name);
  if (normName) {
    const byName = uniqueOrReview(index.byNormalizedName.get(normName), 'existing', 'exact_name', 'duplicate_reference', 0.9);
    if (byName) return byName;
  }

  // ④ 无可靠匹配 → 新品（v1.6 不启用模糊名称匹配）
  return { status: 'new', matchMethod: 'none' };
}
