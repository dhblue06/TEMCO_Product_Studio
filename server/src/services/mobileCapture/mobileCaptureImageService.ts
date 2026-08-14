// 手机采集图片服务（文档 9 拍照 / 9.4 存储 / 9.5 压缩 / 9.6 去重）
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { getDatabase } from '../../database/database';
import { getMobileCaptureDir, ensureDir, getSession, logMobileEvent } from './mobileCaptureService';
import { normalizeColorName, ColorInput, IMAGE_ROLES } from './types';

const ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/heic', '.heic'],
  ['image/heif', '.heif'],
]);

const VALID_ROLES = new Set<string>(IMAGE_ROLES.map(r => r.role));

function getSetting(key: string): string {
  return (getDatabase().prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any)?.value || '';
}

export interface UploadImageInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  role: string;
  colors?: string[];
  sequence?: number;
  isCoverCandidate?: boolean;
}

export interface UploadImageResult {
  image: any;
  duplicate: boolean;
  message: string;
}

/** 压缩手机原图（文档 9.5） */
export async function compressImage(buffer: Buffer): Promise<{ buffer: Buffer; width: number; height: number; mimeType: string }> {
  const maxDim = parseInt(getSetting('mobile_capture_max_dimension') || '2400', 10) || 2400;
  const quality = parseInt(getSetting('mobile_capture_jpeg_quality') || '88', 10) || 88;

  const image = sharp(buffer);
  const meta = await image.metadata();

  const out = await image
    .rotate()
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return { buffer: out.data, width: out.info.width, height: out.info.height, mimeType: 'image/jpeg' };
}

/**
 * 上传一张图片（文档 9）
 * - 检查重复（同一 capture_id + 同一 SHA-256）
 * - 压缩、命名、存储
 * - 写入数据库 + 颜色绑定
 */
export async function uploadImage(captureId: number, input: UploadImageInput): Promise<UploadImageResult> {
  const db = getDatabase();
  const capture = db.prepare(`
    SELECT c.*, s.session_code, s.operator_name, s.device_name FROM mobile_captures c
    JOIN mobile_capture_sessions s ON c.session_id = s.id
    WHERE c.id = ?
  `).get(captureId) as any;
  if (!capture) throw new Error('采集任务不存在');

  const ext = ALLOWED_MIME.get(input.mimeType.toLowerCase());
  if (!ext) throw new Error('不支持的图片格式');

  const role = input.role || 'other';
  if (!VALID_ROLES.has(role)) {
    throw new Error(`无效的图片用途: ${role}`);
  }

  // 单产品图片数限制
  const maxImages = parseInt(getSetting('mobile_capture_max_images_per_product') || '20', 10) || 20;
  const existingCount = (db.prepare('SELECT COUNT(*) as c FROM mobile_capture_images WHERE capture_id = ?').get(captureId) as any)?.c || 0;
  if (existingCount >= maxImages) {
    throw new Error(`每个产品最多上传 ${maxImages} 张图片`);
  }

  // 压缩（HEIC 也走 sharp 转换）
  const { buffer, width, height, mimeType } = await compressImage(input.buffer);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // SHA-256 去重（文档 9.6）
  const duplicateCheck = getSetting('mobile_capture_duplicate_check') !== 'false';
  if (duplicateCheck) {
    const dup = db.prepare('SELECT id FROM mobile_capture_images WHERE capture_id = ? AND sha256 = ?').get(captureId, sha256) as any;
    if (dup) {
      logMobileEvent('mobile_image_duplicate', captureId, capture.product_id, capture.operator_name, capture.device_name, `sha256=${sha256.slice(0, 12)}`);
      const image = db.prepare('SELECT * FROM mobile_capture_images WHERE id = ?').get(dup.id);
      return { image, duplicate: true, message: '这张照片已上传' };
    }
  }

  const sequence = input.sequence ?? existingCount + 1;
  // 文件名安全：serial/reference 仅保留安全字符、拒绝 '.'/'..'、basename 兜底（防路径穿越）
  const baseNameRaw = (capture.serial_number || capture.reference || `product-${capture.product_id}`).replace(/[^\w.-]+/g, '_') || `product-${capture.product_id}`;
  const baseName = baseNameRaw === '.' || baseNameRaw === '..' ? `product-${capture.product_id}` : path.basename(baseNameRaw);
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
  const filename = `${baseName}_${role}_${String(sequence).padStart(3, '0')}_${timestamp}.jpg`;

  const dir = path.join(getMobileCaptureDir(), capture.session_code, baseName, 'original');
  ensureDir(dir);
  const localPath = path.join(dir, filename);
  fs.writeFileSync(localPath, buffer);

  const info = db.prepare(`
    INSERT INTO mobile_capture_images (capture_id, local_path, processed_path, filename, sha256, mime_type,
      file_size, width, height, role, sequence, is_cover_candidate, status, created_at)
    VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', datetime('now'))
  `).run(captureId, localPath, filename, sha256, mimeType, buffer.length, width, height, role, sequence, input.isCoverCandidate ? 1 : 0);

  const imageId = Number(info.lastInsertRowid);

  // 颜色绑定（文档 10.2 / 10.3）
  if (input.colors && input.colors.length > 0) {
    setImageColors(imageId, input.colors.map((c, idx) => ({ colorName: c, isPrimary: idx === 0 })));
  } else if (role === 'single_color' && getSetting('mobile_capture_require_color_for_single') !== 'false') {
    // 单色图必须标色——交给前端约束，这里仅提示
  }

  const image = db.prepare('SELECT * FROM mobile_capture_images WHERE id = ?').get(imageId);
  logMobileEvent('mobile_image_uploaded', captureId, capture.product_id, capture.operator_name, capture.device_name, `${filename} ${width}x${height}`);
  return { image, duplicate: false, message: '上传成功' };
}

/** 绑定图片颜色（文档 10） */
export function setImageColors(imageId: number, colors: ColorInput[]): void {
  const db = getDatabase();
  const img = db.prepare('SELECT * FROM mobile_capture_images WHERE id = ?').get(imageId) as any;
  if (!img) throw new Error('图片不存在');

  db.prepare('DELETE FROM mobile_capture_image_colors WHERE capture_image_id = ?').run(imageId);
  const ins = db.prepare(`
    INSERT INTO mobile_capture_image_colors (capture_image_id, color_name, normalized_color, mapping_status, is_primary)
    VALUES (?, ?, ?, 'pending', ?)
  `);
  const tx = db.transaction(() => {
    colors.forEach((c, idx) => {
      const name = (c.colorName || '').trim();
      if (!name) return;
      ins.run(imageId, name, normalizeColorName(name), c.isPrimary || idx === 0 ? 1 : 0);
    });
  });
  tx();
}

export function updateImage(imageId: number, data: { role?: string; sequence?: number; isCoverCandidate?: boolean; rejectionReason?: string }): void {
  const db = getDatabase();
  const sets: string[] = [];
  const params: any[] = [];
  if (data.role !== undefined) { sets.push('role = ?'); params.push(data.role); }
  if (data.sequence !== undefined) { sets.push('sequence = ?'); params.push(data.sequence); }
  if (data.isCoverCandidate !== undefined) { sets.push('is_cover_candidate = ?'); params.push(data.isCoverCandidate ? 1 : 0); }
  if (data.rejectionReason !== undefined) { sets.push('rejection_reason = ?'); params.push(data.rejectionReason); }
  if (sets.length === 0) return;
  params.push(imageId);
  db.prepare(`UPDATE mobile_capture_images SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function deleteImage(imageId: number): void {
  const db = getDatabase();
  const img = db.prepare('SELECT * FROM mobile_capture_images WHERE id = ?').get(imageId) as any;
  if (!img) return;
  db.prepare('DELETE FROM mobile_capture_image_colors WHERE capture_image_id = ?').run(imageId);
  db.prepare('DELETE FROM mobile_capture_images WHERE id = ?').run(imageId);
  try { if (img.local_path && fs.existsSync(img.local_path)) fs.unlinkSync(img.local_path); } catch {}
}

export function approveImage(imageId: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE mobile_capture_images SET status = 'approved', rejection_reason = '' WHERE id = ?`).run(imageId);
}

export function rejectImage(imageId: number, reason: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE mobile_capture_images SET status = 'rejected', rejection_reason = ? WHERE id = ?`).run(reason || '', imageId);
}

export function listImages(captureId: number): any[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT i.*, (SELECT GROUP_CONCAT(ic.color_name) FROM mobile_capture_image_colors ic WHERE ic.capture_image_id = i.id) as color_names
    FROM mobile_capture_images i WHERE i.capture_id = ? ORDER BY i.sequence, i.id
  `).all(captureId);
}

/** 获取图片文件路径（供文件下载） */
export function getImageFilePath(imageId: number): string | null {
  const db = getDatabase();
  const img = db.prepare('SELECT local_path FROM mobile_capture_images WHERE id = ?').get(imageId) as any;
  if (!img || !img.local_path) return null;
  return fs.existsSync(img.local_path) ? img.local_path : null;
}

/** 图片实际所在目录（会话/产品） */
export function getCaptureImageDir(sessionCode: string, baseName: string): string {
  return path.join(getMobileCaptureDir(), sessionCode, baseName, 'original');
}

// ==================== 处理后照片（AI 精修电商图） ====================

export interface UploadProcessedInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  sourceImageId?: number;
  role?: string;
  isCover?: boolean;
}

const PROCESSED_ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

/**
 * 上传处理后照片（文档 17：AI 精修电商图上传）。
 * - 保留原格式与画质（不重编码，仅存原文件）
 * - SHA-256 去重（同一采集内）
 * - 存储到 {session}/{product}/processed/
 */
export async function uploadProcessedImage(captureId: number, input: UploadProcessedInput): Promise<{ image: any; duplicate: boolean; message: string }> {
  const db = getDatabase();
  const capture = db.prepare(`
    SELECT c.*, s.session_code, s.operator_name, s.device_name FROM mobile_captures c
    JOIN mobile_capture_sessions s ON c.session_id = s.id
    WHERE c.id = ?
  `).get(captureId) as any;
  if (!capture) throw new Error('采集任务不存在');

  const ext = PROCESSED_ALLOWED_MIME.get(input.mimeType.toLowerCase());
  if (!ext) throw new Error('处理图仅支持 JPG / PNG / WebP');

  const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');
  if (getSetting('mobile_capture_duplicate_check') !== 'false') {
    const dup = db.prepare('SELECT id FROM mobile_capture_processed_images WHERE capture_id = ? AND sha256 = ?').get(captureId, sha256) as any;
    if (dup) {
      const image = db.prepare('SELECT * FROM mobile_capture_processed_images WHERE id = ?').get(dup.id);
      return { image, duplicate: true, message: '这张处理图已上传' };
    }
  }

  let width = 0, height = 0;
  try {
    const meta = await sharp(input.buffer).metadata();
    width = meta.width || 0;
    height = meta.height || 0;
  } catch { /* 忽略，保持 0 */ }

  const role = input.role && VALID_ROLES.has(input.role) ? input.role : 'other';
  const baseNameRaw = (capture.serial_number || capture.reference || `product-${capture.product_id}`).replace(/[^\w.-]+/g, '_') || `product-${capture.product_id}`;
  const baseName = baseNameRaw === '.' || baseNameRaw === '..' ? `product-${capture.product_id}` : path.basename(baseNameRaw);
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
  const filename = `${baseName}_${role}_processed_${timestamp}${ext}`;

  const dir = path.join(getMobileCaptureDir(), capture.session_code, baseName, 'processed');
  ensureDir(dir);
  const localPath = path.join(dir, filename);
  fs.writeFileSync(localPath, input.buffer);

  const info = db.prepare(`
    INSERT INTO mobile_capture_processed_images (capture_id, source_image_id, product_id, local_path, filename,
      sha256, mime_type, file_size, width, height, role, is_cover, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', datetime('now'))
  `).run(
    captureId,
    input.sourceImageId || 0,
    capture.product_id,
    localPath,
    filename,
    sha256,
    input.mimeType,
    input.buffer.length,
    width,
    height,
    role,
    input.isCover ? 1 : 0,
  );

  const image = db.prepare('SELECT * FROM mobile_capture_processed_images WHERE id = ?').get(info.lastInsertRowid);
  logMobileEvent('mobile_image_processed', captureId, capture.product_id, capture.operator_name, capture.device_name, `processed:${filename} ${width}x${height}`);
  return { image, duplicate: false, message: '处理图上传成功' };
}

export function listProcessedImages(captureId: number): any[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM mobile_capture_processed_images WHERE capture_id = ? ORDER BY id DESC').all(captureId);
}

export function getProcessedImageFilePath(imageId: number): string | null {
  const db = getDatabase();
  const img = db.prepare('SELECT local_path FROM mobile_capture_processed_images WHERE id = ?').get(imageId) as any;
  if (!img || !img.local_path) return null;
  return fs.existsSync(img.local_path) ? img.local_path : null;
}

export function deleteProcessedImage(imageId: number): void {
  const db = getDatabase();
  const img = db.prepare('SELECT * FROM mobile_capture_processed_images WHERE id = ?').get(imageId) as any;
  if (!img) return;
  db.prepare('DELETE FROM mobile_capture_processed_images WHERE id = ?').run(imageId);
  try { if (img.local_path && fs.existsSync(img.local_path)) fs.unlinkSync(img.local_path); } catch {}
}

export function updateProcessedImage(imageId: number, data: { role?: string; isCover?: boolean; sourceImageId?: number; status?: string }): void {
  const db = getDatabase();
  const sets: string[] = [];
  const params: any[] = [];
  if (data.role !== undefined && VALID_ROLES.has(data.role)) { sets.push('role = ?'); params.push(data.role); }
  if (data.isCover !== undefined) { sets.push('is_cover = ?'); params.push(data.isCover ? 1 : 0); }
  if (data.sourceImageId !== undefined) { sets.push('source_image_id = ?'); params.push(data.sourceImageId || 0); }
  if (data.status !== undefined && ['uploaded', 'approved', 'pushed'].includes(data.status)) { sets.push('status = ?'); params.push(data.status); }
  if (sets.length === 0) return;
  params.push(imageId);
  db.prepare(`UPDATE mobile_capture_processed_images SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}
