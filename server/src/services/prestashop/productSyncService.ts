import { getDatabase } from '../../database/database';
import { PrestaShopClient, PrestaShopConfig } from './prestashopClient';
import { buildProductXml, findPrestaShopProductByRef, SyncOptions, DEFAULT_SYNC_OPTIONS } from './prestashopMapper';
import { validateProduct } from './prestashopValidator';

export interface SyncResult {
  success: boolean;
  reference?: string;
  prestashopId?: number | null;
  status: string;
  error?: string;
  details?: string;
}

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

function getResponseProductId(response: any): number | null {
  const rawId = response?.product?.id || (Array.isArray(response?.product) ? response.product[0]?.id : null);
  const id = Number(rawId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function summarizeResponse(response: any): string {
  if (!response) return 'PrestaShop 没有返回内容';
  const text = typeof response === 'string' ? response : JSON.stringify(response);
  return text.replace(/\s+/g, ' ').slice(0, 500);
}

export async function syncProductByRef(reference: string, options: SyncOptions = DEFAULT_SYNC_OPTIONS): Promise<SyncResult> {
  const db = getDatabase();

  const validation = validateProduct(reference);
  if (!validation.canSync) {
    return { success: false, reference, status: 'failed', error: validation.errors.join('; ') };
  }

  const product = validation.product;
  const content = validation.content;

  try {
    const config = loadPrestaShopConfig();
    if (!config.baseUrl || !config.apiKey) {
      throw new Error('PrestaShop API 未配置：请在设置里填写 Base URL 和 API Key，并先点击“测试连接”。');
    }

    const client = new PrestaShopClient(config);
    let prestashopId = product.prestashop_id ? Number(product.prestashop_id) : null;

    if (!prestashopId) {
      const found = await findPrestaShopProductByRef(reference, client);
      if (found.exists && found.id) {
        prestashopId = found.id;
        db.prepare('UPDATE products SET prestashop_id = ? WHERE id = ?').run(prestashopId, product.id);
      }
    }

    if (options.syncCategory && product.category) {
      try {
        const categories = await client.getCategories();
        const found = categories.find((c: any) => {
          const language = c.name?.language;
          const firstLanguage = Array.isArray(language) ? language[0] : language;
          const catName = firstLanguage?.['#text'] || firstLanguage || c.name || '';
          return String(catName).toLowerCase() === String(product.category).toLowerCase();
        });
        if (found && String(found.id) !== String(product.prestashop_category_id || '')) {
          product.prestashop_category_id = found.id;
          db.prepare('UPDATE products SET prestashop_category_id = ? WHERE id = ?').run(found.id, product.id);
        }
      } catch (err: any) {
        console.warn(`[PrestaShop] 分类自动匹配失败，使用默认分类: ${err.message}`);
      }
    }

    const productForXml = {
      ...product,
      prestashop_id: prestashopId || undefined,
      prestashop_category_id: product.prestashop_category_id || config.defaultCategoryId,
      prestashop_manufacturer_id: product.prestashop_manufacturer_id || config.defaultManufacturerId,
      prestashop_shop_id: product.prestashop_shop_id || config.defaultShopId,
      prestashop_lang_id: config.spanishLangId || config.defaultLangId,
    };
    const xml = buildProductXml(productForXml, content, options);

    let response: any;
    if (prestashopId) {
      response = await client.putXml('products', prestashopId, xml);
    } else {
      response = await client.postXml('products', xml);
      prestashopId = getResponseProductId(response);
      if (prestashopId) {
        db.prepare('UPDATE products SET prestashop_id = ? WHERE id = ?').run(prestashopId, product.id);
      }
    }

    if (!prestashopId) {
      const error = `PrestaShop 创建商品后没有返回商品 ID。请检查 API 权限、默认分类 ID、默认品牌 ID、语言 ID。响应摘要：${summarizeResponse(response)}`;
      db.prepare(`
        UPDATE products SET prestashop_sync_status = 'failed', prestashop_last_error = ?,
        prestashop_last_sync_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(error, product.id);
      db.prepare(`
        INSERT INTO prestashop_sync_logs (product_id, reference, sync_type, sync_mode, status, error_message, request_payload, created_at)
        VALUES (?, ?, 'product', 'api', 'failed', ?, ?, CURRENT_TIMESTAMP)
      `).run(product.id, reference, error, xml.substring(0, 1000));
      return { success: false, reference, prestashopId: null, status: 'failed', error };
    }

    let stockMessage = '';
    if (options.syncStock) {
      const stockResult = await client.updateProductStock(prestashopId, product.quantity ?? 0, config.defaultShopId);
      if (stockResult.success) {
        stockMessage = `，库存已同步: ${product.quantity ?? 0}`;
        db.prepare(`
          INSERT INTO prestashop_sync_logs (product_id, reference, sync_type, sync_mode, prestashop_id, status, request_payload, created_at)
          VALUES (?, ?, 'stock', 'api', ?, 'success', ?, CURRENT_TIMESTAMP)
        `).run(product.id, reference, prestashopId, String(product.quantity ?? 0));
      } else {
        stockMessage = `，库存同步失败: ${stockResult.error}`;
        db.prepare(`
          INSERT INTO prestashop_sync_logs (product_id, reference, sync_type, sync_mode, prestashop_id, status, error_message, created_at)
          VALUES (?, ?, 'stock', 'api', ?, 'failed', ?, CURRENT_TIMESTAMP)
        `).run(product.id, reference, prestashopId, stockResult.error || 'stock sync failed');
      }
    }

    db.prepare(`
      UPDATE products SET status = '已上传', prestashop_sync_status = 'synced', prestashop_last_sync_at = CURRENT_TIMESTAMP,
      prestashop_last_error = NULL WHERE id = ?
    `).run(product.id);

    db.prepare(`
      INSERT INTO prestashop_sync_logs (product_id, reference, sync_type, sync_mode, prestashop_id, status, request_payload, created_at)
      VALUES (?, ?, 'product', 'api', ?, 'success', ?, CURRENT_TIMESTAMP)
    `).run(product.id, reference, prestashopId, xml.substring(0, 1000));

    return {
      success: true,
      reference,
      prestashopId,
      status: 'synced',
      details: `已同步到 PrestaShop (ID: ${prestashopId})，价格/条形码已随商品主体同步${stockMessage}`,
    };
  } catch (err: any) {
    const message = err?.message || String(err);
    db.prepare(`
      UPDATE products SET prestashop_sync_status = 'failed', prestashop_last_error = ?,
      prestashop_last_sync_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(message, product.id);

    db.prepare(`
      INSERT INTO prestashop_sync_logs (product_id, reference, sync_type, sync_mode, status, error_message, created_at)
      VALUES (?, ?, 'product', 'api', 'failed', ?, CURRENT_TIMESTAMP)
    `).run(product.id, reference, message);

    return { success: false, reference, status: 'failed', error: message };
  }
}