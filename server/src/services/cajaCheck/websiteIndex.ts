// CAJA 新品检查：网站产品索引（v1.6 文档 §16-18）
// 使用 Map 索引避免 O(N²) 双循环；允许重复值（重复匹配 → review）。
import { normalizeReference, normalizeBarcode, normalizeProductName } from './normalizer';

export interface WebsiteProduct {
  id: number;
  reference: string;
  ean13: string;
  upc: string;
  name: string;
  active: string | number;
  /** 网站不含税售价（PrestaShop product.price） */
  price: number | null;
}

export interface WebsiteProductIndex {
  products: WebsiteProduct[];
  byReference: Map<string, WebsiteProduct[]>;
  byEan: Map<string, WebsiteProduct[]>;
  byUpc: Map<string, WebsiteProduct[]>;
  byNormalizedName: Map<string, WebsiteProduct[]>;
}

function pushTo(map: Map<string, WebsiteProduct[]>, key: string, product: WebsiteProduct): void {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(product);
  else map.set(key, [product]);
}

/** 构建网站产品索引（reference/ean/upc/标准化名称 → 产品列表，含重复） */
export function buildWebsiteIndex(products: WebsiteProduct[]): WebsiteProductIndex {
  const index: WebsiteProductIndex = {
    products,
    byReference: new Map(),
    byEan: new Map(),
    byUpc: new Map(),
    byNormalizedName: new Map(),
  };
  for (const p of products) {
    pushTo(index.byReference, normalizeReference(p.reference), p);
    pushTo(index.byEan, normalizeBarcode(p.ean13), p);
    pushTo(index.byUpc, normalizeBarcode(p.upc), p);
    pushTo(index.byNormalizedName, normalizeProductName(p.name), p);
  }
  return index;
}
