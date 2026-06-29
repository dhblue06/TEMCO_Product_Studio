import { getDatabase } from '../../database/database';

export interface ValidationResult {
  success: boolean;
  canSync: boolean;
  errors: string[];
  warnings: string[];
  product?: any;
  content?: any;
}

/**
 * 校验商品是否可以同步到 PrestaShop
 */
export function validateProduct(ref: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const db = getDatabase();

  // 1. 本地商品是否存在
  const product = db.prepare('SELECT * FROM products WHERE reference = ?').get(ref) as any;
  if (!product) {
    errors.push('商品不存在');
    return { success: false, canSync: false, errors, warnings };
  }

  // 2. reference 是否存在
  if (!product.reference) {
    errors.push('reference 为空');
  }

  // 3. 读取西语内容
  const content = db.prepare(
    'SELECT * FROM product_contents WHERE product_id = ? AND lang = ?'
  ).get(product.id, 'es') as any;

  if (!content) {
    warnings.push('没有西语内容，将使用商品主表的 name');
  }

  // 4. 西语标题
  const esName = content?.name || product.name;
  if (!esName) {
    errors.push('西语标题为空');
  } else if (esName.length < 2) {
    errors.push('西语标题太短');
  }

  // 5. 西语长描述
  if (!content?.description) {
    warnings.push('西语长描述为空');
  }

  // 6. SEO 标题
  if (!content?.seo_title) {
    warnings.push('SEO 标题为空');
  }

  // 7. PrestaShop 配置
  const baseUrl = (db.prepare("SELECT value FROM api_settings WHERE key = 'prestashop_base_url'").get() as any)?.value;
  const apiKey = (db.prepare("SELECT value FROM api_settings WHERE key = 'prestashop_api_key'").get() as any)?.value;

  if (!baseUrl || !apiKey) {
    errors.push('PrestaShop API 未配置');
  }

  // 8. 默认分类 ID
  const defaultCategoryId = product.prestashop_category_id || 
    (db.prepare("SELECT value FROM api_settings WHERE key = 'prestashop_default_category_id'").get() as any)?.value;
  if (!defaultCategoryId) {
    errors.push('默认分类 ID 未设置');
  } else {
    product.prestashop_category_id = defaultCategoryId;
  }

  // 9. 默认品牌 ID
  const defaultManufacturerId = product.prestashop_manufacturer_id ||
    (db.prepare("SELECT value FROM api_settings WHERE key = 'prestashop_default_manufacturer_id'").get() as any)?.value;
  if (!defaultManufacturerId) {
    warnings.push('默认品牌 ID 未设置，将使用 ID=1');
    product.prestashop_manufacturer_id = 1;
  } else {
    product.prestashop_manufacturer_id = defaultManufacturerId;
  }

  return {
    success: errors.length === 0,
    canSync: errors.length === 0,
    errors,
    warnings,
    product,
    content,
  };
}
