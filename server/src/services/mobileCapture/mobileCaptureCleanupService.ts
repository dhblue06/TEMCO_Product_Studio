// 手机采集数据清理服务（文档 34）
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../../database/database';
import { getMobileCaptureDir } from './mobileCaptureService';

function getSetting(key: string): string {
  return (getDatabase().prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any)?.value || '';
}

/**
 * 清理满足条件的原始图片文件（文档 34.2）：
 * 已同步 + 保留超过设定天数 + 无失败任务 + 无未完成草稿
 * 仅删除文件，保留数据库记录与日志。
 */
export function cleanupExpiredCaptureFiles(): { cleaned: number; checked: number; message: string } {
  const db = getDatabase();
  const days = parseInt(getSetting('mobile_capture_retention_days') || '180', 10) || 180;
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);

  // 已同步的采集
  const captures = db.prepare(`
    SELECT id, product_id, reference, synced_at FROM mobile_captures
    WHERE sync_status = 'synced' AND synced_at IS NOT NULL AND synced_at < ?
  `).all(cutoff) as any[];

  let cleaned = 0;
  let checked = 0;

  for (const c of captures) {
    // 有未完成变体草稿 → 跳过
    const draftCount = (db.prepare(`SELECT COUNT(*) as c FROM variant_drafts WHERE capture_id = ? AND status NOT IN ('synced','ignored')`).get(c.id) as any)?.c || 0;
    if (draftCount > 0) continue;
    // 有失败上传任务 → 跳过
    const failedJobs = (db.prepare(`
      SELECT COUNT(*) as c FROM product_image_upload_jobs j
      JOIN product_scan_mappings m ON j.scan_image_id = m.scan_image_id
      WHERE m.product_id = ? AND j.status = 'failed'
    `).get(c.product_id) as any)?.c || 0;
    if (failedJobs > 0) continue;

    const images = db.prepare('SELECT local_path FROM mobile_capture_images WHERE capture_id = ?').all(c.id) as any[];
    for (const img of images) {
      checked++;
      if (!img.local_path || !img.local_path.startsWith(getMobileCaptureDir()) || !fs.existsSync(img.local_path)) continue;
      // 被 product_scan_images 引用的原图不能删（推送/上传任务依赖它）
      const referenced = db.prepare('SELECT 1 FROM product_scan_images WHERE local_path = ?').get(img.local_path);
      if (referenced) continue;
      try {
        fs.unlinkSync(img.local_path);
        cleaned++;
      } catch (e) {
        console.error('[MobileCaptureCleanup] delete failed:', e);
      }
    }
  }

  return { cleaned, checked, message: `清理了 ${cleaned} 个原始图片文件（检查 ${checked} 个，保留期 ${days} 天）` };
}

/** 删除孤立空目录 */
export function cleanupEmptyDirs(): number {
  const root = getMobileCaptureDir();
  if (!fs.existsSync(root)) return 0;
  let removed = 0;
  const walk = (dir: string): boolean => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let isEmpty = true;
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!walk(full)) isEmpty = false;
      } else {
        isEmpty = false;
      }
    }
    if (isEmpty) {
      try { fs.rmdirSync(dir); removed++; } catch {}
    }
    return isEmpty;
  };
  walk(root);
  return removed;
}
