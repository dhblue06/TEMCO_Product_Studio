import { XMLBuilder } from 'fast-xml-parser';

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
  syncStock?: boolean;
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

function firstValue(...values: any[]): string {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function asPositiveId(value: any, fallback: string | number): string {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? String(Math.trunc(id)) : String(fallback);
}

function asPrice(value: any): string {
  const price = Number(String(value || '0').replace(',', '.'));
  return (Number.isFinite(price) && price >= 0 ? price : 0).toFixed(6);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .substring(0, 128) || 'product';
}

function langText(langId: string, text: string) {
  return { '@_id': langId, '#text': text };
}

/**
 * 将本地商品转换为 PrestaShop product XML。
 * 主要同步西班牙语正式内容，中文只作为本地审核，不上传到商品字段。
 */
export function buildProductXml(product: any, content: any, options: SyncOptions): string {
  const langId = asPositiveId(product.prestashop_lang_id, 1);
  const categoryId = asPositiveId(product.prestashop_category_id, 3);
  const manufacturerId = asPositiveId(product.prestashop_manufacturer_id, 1);
  const shopId = asPositiveId(product.prestashop_shop_id, 1);

  const productName = firstValue(content?.name, product.name, product.reference, 'Product');
  const description = firstValue(content?.description, content?.descriptionHtml, product.product_intro);
  const descriptionShort = firstValue(content?.description_short, content?.descriptionShort, product.selling_points, productName);
  const seoTitle = firstValue(content?.seo_title, content?.seoTitle, productName).substring(0, 128);
  const seoDescription = firstValue(content?.seo_description, content?.seoDescription, descriptionShort).substring(0, 320);
  const friendlyUrl = slugify(firstValue(content?.friendly_url, content?.friendlyUrl, productName, product.reference));

  const prestashopProduct: any = {
    product: {
      id: product.prestashop_id || undefined,
      reference: product.reference,
      active: product.status === '已下架' ? '0' : '1',
      state: '1',
      price: asPrice(product.price),
      id_category_default: categoryId,
      id_manufacturer: manufacturerId,
      id_shop_default: shopId,
      ean13: firstValue(product.ean13) || undefined,
      upc: firstValue(product.upc) || undefined,
      mpn: firstValue(product.mpn) || undefined,
      name: { language: langText(langId, productName) },
      link_rewrite: { language: langText(langId, friendlyUrl) },
      associations: {
        categories: {
          category: { id: categoryId },
        },
      },
    },
  };

  if (options.syncContent) {
    prestashopProduct.product.description = { language: langText(langId, description) };
    prestashopProduct.product.description_short = { language: langText(langId, descriptionShort) };
  }

  if (options.syncSeo) {
    prestashopProduct.product.meta_title = { language: langText(langId, seoTitle) };
    prestashopProduct.product.meta_description = { language: langText(langId, seoDescription) };
    prestashopProduct.product.link_rewrite = { language: langText(langId, friendlyUrl) };
  }

  if (!options.syncBrand) {
    delete prestashopProduct.product.id_manufacturer;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">\n${builder.build(prestashopProduct)}\n</prestashop>`;
  return xml;
}

/**
 * 在 PrestaShop 中通过 reference 查找商品。
 */
export async function findPrestaShopProductByRef(
  reference: string,
  client: any
): Promise<{ id: number | null; exists: boolean }> {
  try {
    const data = await client.get('products', {
      'filter[reference]': `[${reference}]`,
      display: '[id,reference]',
    });

    const products = data?.products?.product;
    if (products) {
      const list = Array.isArray(products) ? products : [products];
      const found = list.find((p: any) => String(p.reference) === String(reference));
      if (found && found.id) {
        return { id: Number(found.id), exists: true };
      }
    }
    return { id: null, exists: false };
  } catch {
    return { id: null, exists: false };
  }
}