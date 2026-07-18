import { getDatabase } from '../../database/database';
import { PrestaShopClient } from './prestashopClient';
import { findPrestaShopProductByRef } from './prestashopMapper';
import { syncProductByRef } from './productSyncService';
import path from 'path';

const ROLE_ORDER: Record<string, number> = {
  main_product: 1,
  main: 1,
  packaging: 2,
  scene1: 3,
  scene2: 4,
  scene3: 5,
  scene4: 6,
  scene5: 7,
  scene6: 8,
  scene7: 9,
  scene8: 10,
};

function getConfig() {
  const db = getDatabase();
  const g = (key: string) => String((db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any)?.value || '').trim();
  return {
    baseUrl: g('prestashop_base_url') || 'https://www.temco.es',
    apiKey: g('prestashop_api_key') || '',
    defaultLangId: g('prestashop_default_lang_id') || g('prestashop_language_id') || '1',
    spanishLangId: g('prestashop_spanish_lang_id') || g('prestashop_default_lang_id') || g('prestashop_language_id') || '1',
    chineseLangId: g('prestashop_chinese_lang_id') || '',
    defaultCategoryId: g('prestashop_default_category_id') || '3',
    defaultManufacturerId: g('prestashop_default_manufacturer_id') || '1',
    defaultShopId: g('prestashop_default_shop_id') || '1',
  };
}

function normalizeId(value: any): number | null {
  const id = Number(String(value || '').trim());
  return Number.isFinite(id) && id > 0 ? id : null;
}

function getImageRole(image: any): string {
  return image.image_slot || image.role || 'gallery';
}

async function ensureProductPrestashopId(product: any, client: PrestaShopClient): Promise<number | null> {
  const db = getDatabase();
  let prestashopId = normalizeId(product.prestashop_id);
  if (prestashopId) return prestashopId;

  const found = await findPrestaShopProductByRef(product.reference, client);
  if (found.exists && found.id) {
    prestashopId = found.id;
    db.prepare('UPDATE products SET prestashop_id = ? WHERE id = ?').run(String(prestashopId), product.id);
    return prestashopId;
  }

  const syncResult = await syncProductByRef(product.reference, {
    syncContent: true,
    syncSeo: true,
    syncCategory: true,
    syncBrand: true,
    syncPrice: false,
    syncStock: false,
    syncImages: false,
    syncVideos: false,
    forceUpdate: true,
  });

  if (syncResult.success && syncResult.prestashopId) {
    prestashopId = normalizeId(syncResult.prestashopId);
    if (prestashopId) {
      db.prepare('UPDATE products SET prestashop_id = ? WHERE id = ?').run(String(prestashopId), product.id);
      return prestashopId;
    }
  }

  throw new Error(syncResult.error || '商品主体未同步到 PrestaShop，无法上传图片');
}

function resolveImagePath(image: any): string {
  const fs = require('fs');
  let filePath = image.local_path || '';
  if (filePath && fs.existsSync(filePath)) return filePath;

  const productFolder = path.join(__dirname, '../../data/uploads', image.reference);
  if (!fs.existsSync(productFolder)) {
    throw new Error(`图片文件不存在：${filePath || '本地路径为空'}，并且产品文件夹不存在`);
  }

  const files = fs.readdirSync(productFolder).filter((f: string) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
  if (!files.length) {
    throw new Error(`图片文件不存在：${filePath || '本地路径为空'}，并且产品文件夹为空`);
  }

  if (filePath) {
    const fileName = path.basename(filePath);
    const baseName = path.parse(fileName).name;
    const match = files.find((f: string) => f.includes(baseName) || baseName.includes(path.parse(f).name));
    if (match) return path.join(productFolder, match);
  }

  return path.join(productFolder, files[0]);
}

export async function syncSingleImage(
  imageId: number,
  imageMode: 'skipExists' | 'append' = 'skipExists',
  knownPrestashopProductId?: number | string
): Promise<any> {
  const db = getDatabase();
  const image = db.prepare(`
    SELECT pi.*, p.id as product_id, p.reference, p.prestashop_id as product_prestashop_id
    FROM product_images pi
    JOIN products p ON pi.product_id = p.id
    WHERE pi.id = ?
  `).get(imageId) as any;

  if (!image) return { imageId, status: 'failed', error: '图片不存在' };

  const prestashopProductId = normalizeId(knownPrestashopProductId) || normalizeId(image.product_prestashop_id);
  if (!prestashopProductId) {
    return {
      imageId,
      role: getImageRole(image),
      status: 'failed',
      error: `找不到产品主体：本地商品 ${image.reference} 没有 PrestaShop ID。请先同步商品主体，或检查 products.prestashop_id 是否已写回。`,
    };
  }

  if (imageMode === 'skipExists' && image.prestashop_image_id) {
    return { imageId, role: getImageRole(image), status: 'skipped', prestashopImageId: image.prestashop_image_id };
  }

  try {
    const filePath = resolveImagePath(image);
    const client = new PrestaShopClient(getConfig());
    const result = await client.uploadProductImage(prestashopProductId, filePath);

    if (result.success) {
      db.prepare(`
        UPDATE product_images SET prestashop_image_id = ?, prestashop_sync_status = 'synced',
        prestashop_last_sync_at = CURRENT_TIMESTAMP, prestashop_last_error = NULL WHERE id = ?
      `).run(result.imageId, imageId);

      db.prepare(`
        INSERT INTO prestashop_sync_logs (product_id, reference, sync_type, sync_mode, prestashop_id, status, created_at)
        VALUES (?, ?, 'image', 'api', ?, 'success', CURRENT_TIMESTAMP)
      `).run(image.product_id, image.reference, String(prestashopProductId));
    } else {
      throw new Error(result.error || 'PrestaShop 图片上传失败');
    }

    return {
      imageId,
      role: getImageRole(image),
      status: 'synced',
      prestashopImageId: result.imageId,
    };
  } catch (err: any) {
    const message = err?.message || String(err);
    db.prepare(`
      UPDATE product_images SET prestashop_sync_status = 'failed',
      prestashop_last_sync_at = CURRENT_TIMESTAMP, prestashop_last_error = ? WHERE id = ?
    `).run(message, imageId);

    db.prepare(`
      INSERT INTO prestashop_sync_logs (product_id, reference, sync_type, sync_mode, status, error_message, created_at)
      VALUES (?, ?, 'image', 'api', 'failed', ?, CURRENT_TIMESTAMP)
    `).run(image.product_id, image.reference, message);

    return {
      imageId,
      role: getImageRole(image),
      status: 'failed',
      error: message,
    };
  }
}

export async function syncImagesByProductRef(reference: string, imageMode: 'skipExists' | 'append' = 'skipExists'): Promise<any> {
  const db = getDatabase();
  const product = db.prepare('SELECT * FROM products WHERE reference = ?').get(reference) as any;
  if (!product) return { success: false, reference, error: '商品不存在', results: [] };

  const client = new PrestaShopClient(getConfig());
  let prestashopProductId: number;
  try {
    const ensuredId = await ensureProductPrestashopId(product, client);
    if (!ensuredId) throw new Error('商品主体未同步到 PrestaShop，无法上传图片');
    prestashopProductId = ensuredId;
  } catch (err: any) {
    return { success: false, reference, error: `找不到产品主体：${err.message}`, results: [] };
  }

  const images = db.prepare(`
    SELECT * FROM product_images
    WHERE product_id = ?
      AND (
        image_slot IN ('main_product','packaging','scene1','scene2','scene3','scene4','scene5','scene6','scene7','scene8')
        OR role IN ('main_product','packaging','scene1','scene2','scene3','scene4','scene5','scene6','scene7','scene8','main','gallery')
      )
    ORDER BY
      CASE COALESCE(NULLIF(image_slot, ''), role)
        WHEN 'main_product' THEN 1
        WHEN 'main' THEN 1
        WHEN 'packaging' THEN 2
        WHEN 'scene1' THEN 3
        WHEN 'scene2' THEN 4
        WHEN 'scene3' THEN 5
        WHEN 'scene4' THEN 6
        WHEN 'scene5' THEN 7
        WHEN 'scene6' THEN 8
        WHEN 'scene7' THEN 9
        WHEN 'scene8' THEN 10
        ELSE 99
      END, image_index ASC
  `).all(product.id) as any[];

  const uploadImages = images.length
    ? images
    : db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY image_index ASC').all(product.id) as any[];

  if (!uploadImages.length) {
    return {
      success: true,
      reference,
      prestashopId: prestashopProductId,
      total: 0,
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
      results: [],
      note: '没有找到可同步的图片，请先上传或生成图片',
    };
  }

  const sorted = [...uploadImages].sort((a, b) => {
    const aOrder = ROLE_ORDER[getImageRole(a)] || 99;
    const bOrder = ROLE_ORDER[getImageRole(b)] || 99;
    return aOrder - bOrder || (a.image_index || 0) - (b.image_index || 0);
  });

  const results: any[] = [];
  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const img of sorted) {
    const r = await syncSingleImage(img.id, imageMode, prestashopProductId);
    results.push(r);
    if (r.status === 'synced') successCount++;
    else if (r.status === 'skipped') skippedCount++;
    else failedCount++;
  }

  const firstSynced = results.find(r => r.status === 'synced' && r.prestashopImageId);
  if (firstSynced?.prestashopImageId) {
    try {
      await client.updateProductImageCover(prestashopProductId, firstSynced.prestashopImageId, 1);
      console.log(`[Cover] Set image ${firstSynced.prestashopImageId} as cover for product ${prestashopProductId}`);
    } catch (err: any) {
      console.log('[Cover] Failed to set cover:', err.message);
    }
  }

  return {
    success: failedCount === 0 || successCount > 0 || skippedCount > 0,
    reference,
    prestashopId: prestashopProductId,
    total: sorted.length,
    successCount,
    skippedCount,
    failedCount,
    results,
    error: failedCount > 0 && successCount === 0 && skippedCount === 0 ? '所有图片同步失败，请查看 results 中的失败原因' : undefined,
  };
}