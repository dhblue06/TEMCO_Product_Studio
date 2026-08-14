import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getDatabase } from '../../database/database';
import {
  normalizeProductImageFilename,
  extractSixDigitSerial,
  extractImageSequence,
  detectImageRole,
  SUPPORTED_EXTENSIONS,
} from './productImageNameParser';

function getSetting(key: string): string {
  const db = getDatabase();
  return (db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any)?.value || '';
}

export function scanProductImages(directory: string): { scanned: number; new: number; errors: string[] } {
  const db = getDatabase();
  const errors: string[] = [];
  const dir = directory || getSetting('product_image_dir') || path.join(__dirname, '../../../data/product-images');

  if (!fs.existsSync(dir)) return { scanned: 0, new: 0, errors: [`目录不存在: ${dir}`] };

  const files = collectImageFiles(dir);
  let newCount = 0;

  const upsert = db.prepare(`
    INSERT INTO product_scan_images (local_path, filename, extension, mime_type, file_size, sha256, normalized_filename, extracted_model, extracted_serial, extracted_sequence, detected_role, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(local_path) DO UPDATE SET
      filename = excluded.filename, file_size = excluded.file_size, sha256 = excluded.sha256,
      normalized_filename = excluded.normalized_filename, extracted_model = excluded.extracted_model,
      extracted_serial = excluded.extracted_serial, extracted_sequence = excluded.extracted_sequence,
      detected_role = excluded.detected_role, updated_at = datetime('now')
  `);

  const maxSize = parseInt(getSetting('product_image_max_file_size_mb') || '10') * 1024 * 1024;

  const batch = db.transaction(() => {
    for (const filePath of files) {
      try {
        const ext = path.extname(filePath).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

        const stat = fs.statSync(filePath);
        if (stat.size === 0 || stat.size > maxSize) continue;

        const filename = path.basename(filePath);
        const normalized = normalizeProductImageFilename(filename);
        const sha256 = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
        const mime = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';

        // 提取型号：取第一个看起来像型号的块（含字母+数字+连字符）
        const modelMatch = normalized.match(/\b([a-z]{2,5}[-_]?\d{2,5}(?:[-_][a-z]{2,6})?)\b/);
        const extractedModel = modelMatch?.[1] || null;

        const existing = db.prepare('SELECT id FROM product_scan_images WHERE local_path = ?').get(filePath) as any;
        upsert.run(filePath, filename, ext, mime, stat.size, sha256, normalized,
          extractedModel, extractSixDigitSerial(normalized), extractImageSequence(normalized), detectImageRole(normalized));
        if (!existing) newCount++;
      } catch (err: any) {
        errors.push(`${path.basename(filePath)}: ${err.message}`);
      }
    }
  });
  batch();

  return { scanned: files.length, new: newCount, errors };
}

function collectImageFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('_')) {
        results.push(...collectImageFiles(full));
      } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  } catch {}
  return results;
}
