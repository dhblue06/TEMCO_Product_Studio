import { XMLBuilder } from 'fast-xml-parser';
import { getDatabase } from '../../database/database';

const builder = new XMLBuilder({
  format: true,
  suppressEmptyNode: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

export interface SyncOptions {
  syncContent: boolean;
  syncSeo: boolean;
  syncCategory: boolean;
  syncBrand: boolean;
  syncImages: boolean;
  syncVideos: boolean;
  syncPrice: boolean;
  syncStock: boolean;
  forceUpdate: boolean;
}

export const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  syncContent: true,
  syncSeo: true,
  syncCategory: true,
  syncBrand: true,
  syncImages: false,
  syncVideos: false,
  syncPrice: false,
  syncStock: false,
  forceUpdate: false,
};

/**
 * 将本地商品转换为 PrestaShop XML
 * 第一版只同步西语内容
 */
export function buildProductXml(
  product: any,
  content: any,
  options: SyncOptions
): string {
  const prestashopProduct: any = {
    product: {
      id: product.prestashop_id || undefined,
      reference: product.reference,
      active: '1',
      state: '1',
      price: (product.price || 0),
      id_category_default: product.prestashop_category_id || 3,
      id_manufacturer: product.prestashop_manufacturer_id || 1,
      id_shop_default: 1,
      ean13: product.ean13 || undefined,
      upc: product.upc || undefined,
      mpn: product.mpn || undefined,
      name: {},
      description: {},
      description_short: {},
      meta_title: {},
      meta_description: {},
      link_rewrite: {},
    },
  };

  // 西语内容 (language id = 1)
  const langId = '1';
  
  // 始终包含必要字段 (name 和 link_rewrite 是 PrestaShop 必填)
  const productName = content?.name || product.name || '';
  const friendlyUrl = (content?.friendly_url || product.name || product.reference || 'product')
    .toLowerCase()
    .replace(/[^a-z0-9\u00e0-\u00fc-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 128) || 'product';
  prestashopProduct.product.name = { language: { '@_id': langId, '#text': productName } };
  prestashopProduct.product.link_rewrite = { language: { '@_id': langId, '#text': friendlyUrl } };
  
  if (options.syncContent) {
    prestashopProduct.product.description = { language: { '@_id': langId, '#text': content?.description || '' } };
    prestashopProduct.product.description_short = { language: { '@_id': langId, '#text': content?.description_short || '' } };
  }

  if (options.syncSeo) {
    prestashopProduct.product.meta_title = { language: { '@_id': langId, '#text': content?.seo_title || '' } };
    prestashopProduct.product.meta_description = { language: { '@_id': langId, '#text': content?.seo_description || '' } };
    prestashopProduct.product.link_rewrite = { language: { '@_id': langId, '#text': content?.friendly_url || '' } };
  }

  if (options.syncCategory && product.prestashop_category_id) {
    prestashopProduct.product.id_category_default = product.prestashop_category_id;
  }

  if (options.syncBrand && product.prestashop_manufacturer_id) {
    prestashopProduct.product.id_manufacturer = product.prestashop_manufacturer_id;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">\n${builder.build(prestashopProduct)}\n</prestashop>`;
  return xml;
}

/**
 * 在 PrestaShop 中通过 reference 查找商品
 */
export async function findPrestaShopProductByRef(
  reference: string,
  client: any
): Promise<{ id: number | null; exists: boolean }> {
  try {
    const data = await client.get('products', {
      'filter[reference]': `[${reference}]`,
      'display': '[id,reference]',
    });
    
    const products = data?.products?.product;
    if (products) {
      const list = Array.isArray(products) ? products : [products];
      const found = list.find((p: any) => p.reference === reference);
      if (found && found.id) {
        return { id: Number(found.id), exists: true };
      }
    }
    return { id: null, exists: false };
  } catch {
    return { id: null, exists: false };
  }
}
