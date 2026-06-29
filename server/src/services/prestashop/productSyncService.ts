import { getDatabase } from '../../database/database';
import { PrestaShopClient } from './prestashopClient';
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

/**
 * 同步单个商品到 PrestaShop
 */
export async function syncProductByRef(reference: string, options: SyncOptions = DEFAULT_SYNC_OPTIONS): Promise<SyncResult> {
  const db = getDatabase();

  // 1. 校验
  const validation = validateProduct(reference);
  if (!validation.canSync) {
    return { success: false, reference, status: 'failed', error: validation.errors.join('; ') };
  }

  const product = validation.product;
  const content = validation.content;

  try {
    // 加载配置
    const baseUrl = (db.prepare("SELECT value FROM api_settings WHERE key = 'prestashop_base_url'").get() as any)?.value || 'https://temcostar.com';
    const apiKey = (db.prepare("SELECT value FROM api_settings WHERE key = 'prestashop_api_key'").get() as any)?.value || '';
    const client = new PrestaShopClient({
      baseUrl, apiKey, defaultLangId: '1', spanishLangId: '1',
      chineseLangId: '', defaultCategoryId: '3', defaultManufacturerId: '1', defaultShopId: '1',
    });

    // 2. 如果在 PrestaShop 中已存在
    let prestashopId = product.prestashop_id;

    if (!prestashopId) {
      const found = await findPrestaShopProductByRef(reference, client);
      if (found.exists && found.id) {
        prestashopId = found.id;
        // 保存到本地
        db.prepare('UPDATE products SET prestashop_id = ? WHERE id = ?').run(prestashopId, product.id);
      }
    }

    // 3. 构建 XML（包含价格字段）
    const xml = buildProductXml({ ...product, prestashop_id: prestashopId }, content, options);

    // 4. 创建或更新
    let response: any;
    if (prestashopId) {
      response = await client.putXml('products', prestashopId, xml);
    } else {
      response = await client.postXml('products', xml);
      prestashopId = response?.product?.id;
      if (prestashopId) {
        db.prepare('UPDATE products SET prestashop_id = ? WHERE id = ?').run(prestashopId, product.id);
      }
    }

    // 5. 更新同步状态
    const syncStatus = prestashopId ? 'synced' : 'failed';
    db.prepare(`
      UPDATE products SET prestashop_sync_status = ?, prestashop_last_sync_at = CURRENT_TIMESTAMP,
      prestashop_last_error = NULL WHERE id = ?
    `).run(syncStatus, product.id);

    // 6. 记录日志
    db.prepare(`
      INSERT INTO prestashop_sync_logs (product_id, reference, sync_type, sync_mode, prestashop_id, status, request_payload, created_at)
      VALUES (?, ?, 'product', 'api', ?, 'success', ?, CURRENT_TIMESTAMP)
    `).run(product.id, reference, prestashopId || 0, xml.substring(0, 500));

    return {
      success: true,
      reference,
      prestashopId,
      status: 'synced',
      details: prestashopId ? `已同步到 PrestaShop (ID: ${prestashopId})` : '同步完成',
    };
  } catch (err: any) {
    // 失败处理
    db.prepare(`
      UPDATE products SET prestashop_sync_status = 'failed', prestashop_last_error = ?,
      prestashop_last_sync_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(err.message, product.id);

    db.prepare(`
      INSERT INTO prestashop_sync_logs (product_id, reference, sync_type, sync_mode, status, error_message, created_at)
      VALUES (?, ?, 'product', 'api', 'failed', ?, CURRENT_TIMESTAMP)
    `).run(product.id, reference, err.message);

    return { success: false, reference, status: 'failed', error: err.message };
  }
}
