import { getDatabase } from '../../database/database';
import { PrestaShopClient } from './prestashopClient';

const ROLE_ORDER: Record<string, number> = {
  main_product: 1,
  packaging: 2,
  scene1: 3,
  scene2: 4,
  scene3: 5,
};

/**
 * 获取配置
 */
function getConfig() {
  const db = getDatabase();
  const g = (key: string) => (db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any)?.value || '';
  return {
    baseUrl: g('prestashop_base_url') || 'https://temcostar.com',
    apiKey: g('prestashop_api_key') || '',
    defaultLangId: g('prestashop_default_lang_id') || '1',
    spanishLangId: g('prestashop_spanish_lang_id') || '1',
    chineseLangId: g('prestashop_chinese_lang_id') || '',
    defaultCategoryId: g('prestashop_default_category_id') || '3',
    defaultManufacturerId: g('prestashop_default_manufacturer_id') || '1',
    defaultShopId: g('prestashop_default_shop_id') || '1',
  };
}

/**
 * 同步单张图片到 PrestaShop
 */
export async function syncSingleImage(imageId: number, imageMode: 'skipExists' | 'append' = 'skipExists'): Promise<any> {
  const db = getDatabase();
  const image = db.prepare(`
    SELECT pi.*, p.reference, p.prestashop_id FROM product_images pi
    JOIN products p ON pi.product_id = p.id
    WHERE pi.id = ?
  `).get(imageId) as any;

  if (!image) return { imageId, status: 'failed', error: '图片不存在' };
  if (!image.prestashop_id) return { imageId, status: 'failed', error: '商品未同步到 PrestaShop，请先同步商品主体' };

  // skipExists 模式
  if (imageMode === 'skipExists' && image.prestashop_image_id) {
    return { imageId, role: image.role, status: 'skipped', prestashopImageId: image.prestashop_image_id };
  }

  if (!image.local_path) return { imageId, status: 'failed', error: '本地图片路径为空' };

  const fs = require('fs');
  if (!fs.existsSync(image.local_path)) return { imageId, status: 'failed', error: `图片文件不存在: ${image.local_path}` };

  const client = new PrestaShopClient(getConfig());
  const result = await client.uploadProductImage(image.prestashop_id, image.local_path);

  if (result.success) {
    db.prepare(`
      UPDATE product_images SET prestashop_image_id = ?, prestashop_sync_status = 'synced',
      prestashop_last_sync_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(result.imageId, imageId);

    db.prepare(`
      INSERT INTO prestashop_sync_logs (product_id, reference, sync_type, sync_mode, prestashop_id, status, created_at)
      VALUES (?, ?, 'image', 'api', ?, 'success', CURRENT_TIMESTAMP)
    `).run(image.product_id, image.reference, image.prestashop_id);
  } else {
    db.prepare(`
      UPDATE product_images SET prestashop_sync_status = 'failed',
      prestashop_last_sync_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(imageId);

    db.prepare(`
      INSERT INTO prestashop_sync_logs (product_id, reference, sync_type, sync_mode, status, error_message, created_at)
      VALUES (?, ?, 'image', 'api', 'failed', ?, CURRENT_TIMESTAMP)
    `).run(image.product_id, image.reference, result.error || '');
  }

  return {
    imageId,
    role: image.role,
    status: result.success ? 'synced' : 'failed',
    prestashopImageId: result.imageId,
    error: result.error,
  };
}

/**
 * 同步商品全部图片
 */
export async function syncImagesByProductRef(reference: string, imageMode: 'skipExists' | 'append' = 'skipExists'): Promise<any> {
  const db = getDatabase();
  const product = db.prepare('SELECT * FROM products WHERE reference = ?').get(reference) as any;
  if (!product) return { success: false, error: '商品不存在' };
  if (!product.prestashop_id) return { success: false, error: '商品未同步到 PrestaShop，请先同步商品主体' };

  const images = db.prepare(`
    SELECT * FROM product_images 
    WHERE product_id = ? AND role IN ('main_product','packaging','scene1','scene2','scene3')
    ORDER BY 
      CASE role 
        WHEN 'main_product' THEN 1
        WHEN 'packaging' THEN 2
        WHEN 'scene1' THEN 3
        WHEN 'scene2' THEN 4
        WHEN 'scene3' THEN 5
        ELSE 99
      END
  `).all(product.id) as any[];

  // 如果没有槽位图片，尝试所有图片
  if (images.length === 0) {
    const allImages = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY image_index ASC').all(product.id) as any[];
    if (allImages.length > 0) {
      return {
        success: true,
        reference,
        prestashopId: product.prestashop_id,
        total: 0,
        successCount: 0,
        skippedCount: 0,
        failedCount: 0,
        results: [],
        note: '没有找到槽位图片（main_product/packaging/scene1/scene2/scene3），请在图片管理中上传图片到对应槽位',
      };
    }
  }

  // 按角色排序
  const sorted = [...images].sort((a, b) => {
    const aOrder = ROLE_ORDER[a.role as string] || 99;
    const bOrder = ROLE_ORDER[b.role as string] || 99;
    return aOrder - bOrder;
  });

  const results: any[] = [];
  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const img of sorted) {
    const r = await syncSingleImage(img.id, imageMode);
    results.push(r);
    if (r.status === 'synced') successCount++;
    else if (r.status === 'skipped') skippedCount++;
    else failedCount++;
  }

  // 设置第一张成功上传的图片为 cover
  const firstSynced = results.find(r => r.status === 'synced' && r.prestashopImageId);
  if (firstSynced && firstSynced.prestashopImageId) {
    try {
      const client = new PrestaShopClient(getConfig());
      await client.updateProductImageCover(product.prestashop_id, firstSynced.prestashopImageId, 1);
      console.log(`[Cover] Set image ${firstSynced.prestashopImageId} as cover for product ${product.prestashop_id}`);
    } catch (err: any) {
      console.log('[Cover] Failed to set cover:', err.message);
    }
  }

  return {
    success: true,
    reference,
    prestashopId: product.prestashop_id,
    total: sorted.length,
    successCount,
    skippedCount,
    failedCount,
    results,
  };
}
