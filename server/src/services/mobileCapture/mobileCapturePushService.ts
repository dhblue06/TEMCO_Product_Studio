// 手机采集 → 现有产品图片模块推送服务（文档 18）
import path from 'path';
import fs from 'fs';
import { getDatabase } from '../../database/database';
import { getMobileCaptureDir, ensureDir, logMobileEvent } from './mobileCaptureService';
import { createProductUploadBatch } from '../productImage/productImageUploadService';

export interface PushResult {
  pushed: number;
  pushedProcessed: number;
  skippedDuplicates: number;
  batchId: string | null;
  message: string;
}

/**
 * 推送到产品图片模块（文档 18.1）：
 * 1. 检查产品绑定
 * 2. 检查图片审核状态（approved）
 * 3. 检查 SHA-256 重复
 * 4. 写入 product_scan_images
 * 5. 写入 product_scan_mappings（status=confirmed）
 * 6. 设置 image_position / is_cover
 * 7. 标记 capture image 为 pushed
 * 8. 创建 product_image_upload_jobs 批次（复用现有上传模块）
 */
export function pushCaptureToProductImages(captureId: number): PushResult {
  const db = getDatabase();
  const capture = db.prepare(`
    SELECT c.*, s.operator_name, s.device_name FROM mobile_captures c
    JOIN mobile_capture_sessions s ON c.session_id = s.id
    WHERE c.id = ?
  `).get(captureId) as any;
  if (!capture) throw new Error('采集任务不存在');

  if (!capture.prestashop_product_id && !capture.prestashop_id) {
    throw new Error('产品未绑定 PrestaShop 产品，无法推送（请先确认产品绑定）');
  }
  const prestashopProductId = parseInt(capture.prestashop_product_id || capture.prestashop_id || '0', 10) || 0;
  if (!prestashopProductId) {
    throw new Error('产品未绑定 PrestaShop 产品，无法推送');
  }

  const images = db.prepare(`
    SELECT * FROM mobile_capture_images WHERE capture_id = ? AND status = 'approved' ORDER BY sequence, id
  `).all(captureId) as any[];
  if (images.length === 0) {
    throw new Error('没有已审核通过的图片，无法推送');
  }

  let pushed = 0;
  let skippedDuplicates = 0;
  let pushedProcessed = 0;

  const insertImage = db.prepare(`
    INSERT INTO product_scan_images (local_path, filename, extension, mime_type, file_size, width, height,
      sha256, normalized_filename, extracted_model, extracted_serial, detected_role, ignored, scan_batch_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))
  `);

  const insertMapping = db.prepare(`
    INSERT INTO product_scan_mappings (product_id, scan_image_id, match_type, matched_value, confidence,
      image_position, is_cover, status, created_at, updated_at)
    VALUES (?, ?, 'mobile', ?, 1.0, ?, ?, 'confirmed', datetime('now'), datetime('now'))
  `);

  /** 推送一张图到 product_scan_images + confirmed mapping；返回 true=已推送, false=重复跳过 */
  const pushOne = (img: any): boolean => {
    if (img.sha256) {
      const dup = db.prepare(`
        SELECT 1 FROM product_scan_images si
        JOIN product_scan_mappings m ON si.id = m.scan_image_id
        WHERE m.product_id = ? AND si.sha256 = ?
      `).get(capture.product_id, img.sha256);
      if (dup) return false;
    }
    let scanImageId: number | null = null;
    const existing = db.prepare('SELECT id FROM product_scan_images WHERE local_path = ?').get(img.local_path) as any;
    if (existing) {
      scanImageId = existing.id;
    } else {
      const r = insertImage.run(
        img.local_path,
        img.filename,
        path.extname(img.filename).toLowerCase(),
        img.mime_type,
        img.file_size,
        img.width,
        img.height,
        img.sha256,
        img.filename.replace(/\.(jpg|jpeg|png|webp)$/i, '').replace(/[\s_]+/g, '-').toLowerCase(),
        capture.model || null,
        capture.serial_number || null,
        img.role,
        `MOBILE-CAP-${captureId}`,
      );
      scanImageId = Number(r.lastInsertRowid);
    }
    insertMapping.run(capture.product_id, scanImageId, capture.reference, pushed + pushedProcessed + 1, img.is_cover_candidate || img.is_cover ? 1 : 0);
    return true;
  };

  const batch = db.transaction(() => {
    for (const img of images) {
      // 该原图的处理图（AI 精修电商图）优先推送
      const processed = db.prepare(`
        SELECT * FROM mobile_capture_processed_images
        WHERE capture_id = ? AND source_image_id = ?
        ORDER BY id
      `).all(captureId, img.id) as any[];

      if (processed.length > 0) {
        for (const p of processed) {
          if (pushOne(p)) { pushedProcessed++; }
          else { skippedDuplicates++; }
          db.prepare(`UPDATE mobile_capture_processed_images SET status = 'pushed' WHERE id = ?`).run(p.id);
        }
      } else {
        if (pushOne(img)) { pushed++; }
        else { skippedDuplicates++; }
      }
      db.prepare(`UPDATE mobile_capture_images SET status = 'pushed' WHERE id = ?`).run(img.id);
    }

    // 全部已审核图推送完成 → sync_status
    const remaining = db.prepare(`
      SELECT COUNT(*) as c FROM mobile_capture_images WHERE capture_id = ? AND status = 'approved'
    `).get(captureId) as any;
    if ((remaining?.c || 0) === 0) {
      db.prepare(`UPDATE mobile_captures SET sync_status = 'pushed' WHERE id = ?`).run(captureId);
    }
  });
  batch();

  // 创建上传批次（复用现有 product_image_upload_jobs）
  let batchId: string | null = null;
  try {
    const r = createProductUploadBatch([capture.product_id]);
    batchId = r.batchId;
  } catch (e: any) {
    console.error('[MobileCapture] create upload batch failed:', e.message);
  }

  logMobileEvent('mobile_capture_pushed', captureId, capture.product_id, capture.operator_name, capture.device_name,
    `pushed=${pushed};processed=${pushedProcessed};dup=${skippedDuplicates};batch=${batchId || 'none'}`);

  return {
    pushed,
    pushedProcessed,
    skippedDuplicates,
    batchId,
    message: `已推送 ${pushed + pushedProcessed} 张图片到产品图片模块（处理图 ${pushedProcessed} 张）${skippedDuplicates > 0 ? `，跳过重复 ${skippedDuplicates} 张` : ''}${batchId ? `，上传批次 ${batchId}` : ''}`,
  };
}

export { getMobileCaptureDir };

// ==================== 采集图片 → 产品图片提升（文档 18 对接） ====================

const ROLE_TO_SLOT: Record<string, string> = {
  front: 'main_product', all_colors: 'main_product', single_color: 'main_product',
  package: 'packaging', side: 'scene1', detail: 'scene1', other: 'scene1',
};
const SKIP_ROLES = new Set(['barcode', 'damaged']);

/**
 * 把采集任务审核通过的图片（处理图优先，其次原图）提升为产品槽位图（product_images）。
 * 文件复制到 data/uploads/{reference}/，仅写本地库，不直接上传网站。
 */
export function promoteCaptureImagesToProductImages(captureId: number): { promoted: number; skipped: number; sceneUsed: string[] } {
  const db = getDatabase();
  const capture = db.prepare(`
    SELECT c.*, p.id AS product_pk FROM mobile_captures c JOIN products p ON c.product_id = p.id WHERE c.id = ?
  `).get(captureId) as any;
  if (!capture) throw new Error('采集任务不存在');

  const processed = db.prepare(`
    SELECT * FROM mobile_capture_processed_images WHERE capture_id = ? AND status IN ('uploaded','approved','pushed')
    ORDER BY is_cover DESC, id ASC
  `).all(captureId) as any[];

  // 同步到网站只用「处理后照片」（AI 精修电商图）；原始照片仅用于审核，不上网站
  const sources = processed.map(p => ({ path: p.local_path, filename: p.filename, role: p.role, isCover: p.is_cover === 1, mimeType: p.mime_type || 'image/jpeg' }));

  if (sources.length === 0) {
    throw new Error('该采集任务没有「处理后照片」（原始照片不会同步到网站，请先上传 AI 精修的处理后照片）');
  }

  const uploadsDir = path.join(__dirname, '../../../data/uploads', capture.reference || `ref-${capture.product_id}`);
  ensureDir(uploadsDir);

  let nextIndex = ((db.prepare('SELECT COALESCE(MAX(image_index), 0) + 1 AS m FROM product_images WHERE product_id = ?').get(capture.product_pk) as any)?.m || 1);
  let promoted = 0, skipped = 0;
  const sceneUsed: string[] = [];
  let sceneCount = 0;
  let mainAssigned = false;

  const insert = db.prepare(`
    INSERT INTO product_images (product_id, image_slot, image_index, role, mime_type, local_path, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'ok', datetime('now'))
  `);

  const tx = db.transaction(() => {
    for (const src of sources) {
      if (SKIP_ROLES.has(src.role)) { skipped++; continue; }
      if (!src.path || !fs.existsSync(src.path)) { skipped++; continue; }

      let slot = ROLE_TO_SLOT[src.role] || 'scene1';
      if (slot === 'main_product') {
        // 主图槽位：第一张主图用 main_product，其余主图顺延到场景图
        if (!mainAssigned) { mainAssigned = true; }
        else { slot = `scene${Math.min(++sceneCount, 8)}`; }
      } else if (slot === 'scene1') {
        slot = `scene${Math.min(++sceneCount, 8)}`;
      }

      // 复制文件到 uploads/{reference}/
      let destName = src.filename;
      const destPath = path.join(uploadsDir, destName);
      if (fs.existsSync(destPath)) {
        const dot = destName.lastIndexOf('.');
        destName = `${destName.slice(0, dot)}_${Date.now()}${destName.slice(dot)}`;
      }
      fs.copyFileSync(src.path, path.join(uploadsDir, destName));

      const mime = src.mimeType || 'image/jpeg';
      insert.run(capture.product_pk, slot, nextIndex++, slot === 'main_product' ? 'main' : 'gallery', mime, path.join(uploadsDir, destName));
      if (!sceneUsed.includes(slot)) sceneUsed.push(slot);
      promoted++;
    }
  });
  tx();
  return { promoted, skipped, sceneUsed };
}
