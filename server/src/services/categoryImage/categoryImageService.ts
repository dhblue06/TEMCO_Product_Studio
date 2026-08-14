import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { getDatabase } from '../../database/database';
import {
  CategoryRecord,
  CategoryImageAsset,
  CategoryImageMapping,
  CategoryImageMatchType,
  CategoryImageMatchStatus,
  UploadPreview,
  UploadPreviewItem,
  CategoryImageSettings,
} from './types';

// ============================================================
// 工具函数
// ============================================================

export function normalizeCategoryImageName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^imgi[_-]\d+[_-]/, '')
    .replace(/\.(webp|png|jpe?g)$/i, '')
    .replace(/[_/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSetting(key: string): string {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any;
  return row?.value || '';
}

export function loadCategoryImageSettings(): CategoryImageSettings {
  return {
    categoryImageUploadEnabled: getSetting('category_image_upload_enabled') === 'true',
    categoryImageApiPath: getSetting('category_image_api_path') || '/api/images/categories',
    categoryImageMethodOverride: getSetting('category_image_method_override') !== 'false',
    categoryImageConcurrency: Math.min(5, Math.max(1, parseInt(getSetting('category_image_concurrency') || '2'))),
    categoryImageTimeoutSeconds: parseInt(getSetting('category_image_timeout_seconds') || '60'),
    categoryImageRetryLimit: parseInt(getSetting('category_image_retry_limit') || '2'),
    categoryImageJpegQuality: parseInt(getSetting('category_image_jpeg_quality') || '92'),
    categoryImageMaxSize: parseInt(getSetting('category_image_max_size') || '1600'),
    categoryImageDir: getSetting('category_image_dir') || '',
    categoryUploadBatchLimit: parseInt(getSetting('category_upload_batch_limit') || '200'),
    categoryImageMaxFileSizeMb: parseInt(getSetting('category_image_max_file_size_mb') || '10'),
  };
}

// ============================================================
// 分类数据导入与同步
// ============================================================

export async function importCategoriesFromCsv(csvContent: string): Promise<{ imported: number; updated: number; errors: string[] }> {
  const db = getDatabase();
  const errors: string[] = [];
  let imported = 0;
  let updated = 0;

  // 解析 CSV — 支持 UTF-8 BOM、分号/逗号分隔
  let content = csvContent;
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    return { imported: 0, updated: 0, errors: ['CSV 文件为空或只有表头'] };
  }

  // 自动检测分隔符
  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';

  // 解析表头
  const headers = parseCsvLine(firstLine, delimiter).map(h => h.trim().toLowerCase());
  const idIdx = headers.findIndex(h => h === 'id');
  const nameIdx = headers.findIndex(h => ['nombre', 'name', 'category name', '分类名'].includes(h));

  if (idIdx === -1 || nameIdx === -1) {
    return { imported: 0, updated: 0, errors: [`CSV 缺少必要列。需要 'ID' 和 'Nombre' 列。当前列: ${headers.join(', ')}`] };
  }

  const parentIdx = headers.findIndex(h => ['id categoría padre', 'parent_id', 'id_parent', '父分类'].includes(h));

  const upsertStmt = db.prepare(`
    INSERT INTO categories (prestashop_category_id, parent_id, name, normalized_name, raw_data, synced_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(prestashop_category_id) DO UPDATE SET
      name = excluded.name,
      normalized_name = excluded.normalized_name,
      parent_id = excluded.parent_id,
      raw_data = excluded.raw_data,
      synced_at = datetime('now'),
      updated_at = datetime('now')
  `);

  const batch = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i], delimiter);
      const idVal = cols[idIdx]?.trim();
      const nameVal = cols[nameIdx]?.trim();

      if (!idVal || !nameVal) {
        errors.push(`第 ${i + 1} 行: ID 或名称为空`);
        continue;
      }

      const psId = parseInt(idVal, 10);
      if (isNaN(psId)) {
        errors.push(`第 ${i + 1} 行: ID "${idVal}" 不是数字`);
        continue;
      }

      const raw = parentIdx >= 0 ? (cols[parentIdx]?.trim() || '') : '';
      const val = parseInt(raw, 10);
      const parentId = (raw === '' || isNaN(val)) ? null : val;
      const normalized = normalizeCategoryImageName(nameVal);
      const rawData = JSON.stringify({ row: i + 1, headers, values: cols });

      const existing = db.prepare('SELECT id FROM categories WHERE prestashop_category_id = ?').get(psId) as any;
      if (existing) {
        upsertStmt.run(psId, parentId, nameVal, normalized, rawData);
        updated++;
      } else {
        upsertStmt.run(psId, parentId, nameVal, normalized, rawData);
        imported++;
      }
    }
  });

  batch();

  // 更新 full_path
  updateCategoryPaths();

  return { imported, updated, errors };
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

function updateCategoryPaths(): void {
  const db = getDatabase();
  const cats = db.prepare('SELECT id, prestashop_category_id, parent_id, name FROM categories').all() as any[];
  const byId = new Map<number, any>();
  for (const c of cats) byId.set(c.prestashop_category_id, c);

  const getPath = (cat: any): string => {
    const parts: string[] = [cat.name];
    let current = cat;
    let depth = 0;
    while (current.parent_id && depth < 10) {
      const parent = byId.get(current.parent_id);
      if (!parent) break;
      parts.unshift(parent.name);
      current = parent;
      depth++;
    }
    return parts.join(' > ');
  };

  const updateStmt = db.prepare('UPDATE categories SET full_path = ? WHERE id = ?');
  const batch = db.transaction(() => {
    for (const c of cats) {
      updateStmt.run(getPath(c), c.id);
    }
  });
  batch();
}

export async function syncCategoriesFromPrestaShop(): Promise<{ synced: number; errors: string[] }> {
  const { PrestaShopClient } = require('../prestashop/prestashopClient');
  const db = getDatabase();

  const config = {
    baseUrl: getSetting('prestashop_base_url') || 'https://temcostar.com',
    apiKey: getSetting('prestashop_api_key') || '',
    defaultLangId: getSetting('prestashop_default_lang_id') || '1',
    spanishLangId: getSetting('prestashop_spanish_lang_id') || '1',
    chineseLangId: getSetting('prestashop_chinese_lang_id') || '',
    defaultCategoryId: getSetting('prestashop_default_category_id') || '3',
    defaultManufacturerId: getSetting('prestashop_default_manufacturer_id') || '1',
    defaultShopId: getSetting('prestashop_default_shop_id') || '1',
  };

  if (!config.apiKey) {
    return { synced: 0, errors: ['请先配置 PrestaShop API Key'] };
  }

  try {
    const client = new PrestaShopClient(config);
    const psCategories = await client.getCategories();
    const errors: string[] = [];
    let synced = 0;

    const upsertStmt = db.prepare(`
      INSERT INTO categories (prestashop_category_id, parent_id, name, normalized_name, active, raw_data, synced_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(prestashop_category_id) DO UPDATE SET
        name = excluded.name,
        normalized_name = excluded.normalized_name,
        parent_id = excluded.parent_id,
        active = excluded.active,
        raw_data = excluded.raw_data,
        synced_at = datetime('now'),
        updated_at = datetime('now')
    `);

    const batch = db.transaction(() => {
      for (const cat of psCategories) {
        try {
          const psId = parseInt(cat.id, 10);
          if (isNaN(psId)) continue;
          const name = typeof cat.name === 'object' ? (cat.name?.language?.[0]?.['#text'] || cat.name?.language || cat.name) : cat.name;
          const rawParent = cat.idParent || '';
          const parentVal = parseInt(rawParent, 10);
          const parentId = (rawParent === '' || isNaN(parentVal)) ? null : parentVal;
          const normalized = normalizeCategoryImageName(String(name));
          const active = cat.active === '1' || cat.active === 1 ? 1 : 0;

          upsertStmt.run(psId, parentId, String(name), normalized, active, JSON.stringify(cat));
          synced++;
        } catch (err: any) {
          errors.push(`分类 ${cat.id}: ${err.message}`);
        }
      }
    });
    batch();

    updateCategoryPaths();
    return { synced, errors };
  } catch (err: any) {
    return { synced: 0, errors: [err.message] };
  }
}

// ============================================================
// 图片扫描
// ============================================================

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export async function scanCategoryImages(rootDir: string): Promise<{ scanned: number; new: number; updated: number; errors: string[] }> {
  const db = getDatabase();
  const settings = loadCategoryImageSettings();
  const scanDir = rootDir || settings.categoryImageDir || path.join(__dirname, '../../../data/category-images');

  if (!fs.existsSync(scanDir)) {
    return { scanned: 0, new: 0, updated: 0, errors: [`目录不存在: ${scanDir}`] };
  }

  const errors: string[] = [];
  let scanned = 0, newCount = 0, updatedCount = 0;

  const files = collectImageFiles(scanDir);

  const upsertStmt = db.prepare(`
    INSERT INTO category_images (local_path, filename, normalized_filename, mime_type, extension, file_size, width, height, sha256, scanned_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(local_path) DO UPDATE SET
      filename = excluded.filename,
      normalized_filename = excluded.normalized_filename,
      mime_type = excluded.mime_type,
      extension = excluded.extension,
      file_size = excluded.file_size,
      width = excluded.width,
      height = excluded.height,
      sha256 = excluded.sha256,
      scanned_at = datetime('now'),
      updated_at = datetime('now')
  `);

  const batch = db.transaction(() => {
    for (const filePath of files) {
      try {
        const filename = path.basename(filePath);
        const ext = path.extname(filename).toLowerCase();

        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

        const stat = fs.statSync(filePath);
        if (stat.size === 0) continue;
        if (stat.size > settings.categoryImageMaxFileSizeMb * 1024 * 1024) {
          errors.push(`${filename}: 文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
          continue;
        }

        const normalized = normalizeCategoryImageName(filename);
        const sha256 = computeSha256(filePath);
        const mimeType = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';

        // 获取图片尺寸
        let width = 0, height = 0;
        try {
          const metadata = sharp(filePath);
          // 异步获取尺寸，这里先存 0，后续处理时更新
        } catch {}

        const existing = db.prepare('SELECT id FROM category_images WHERE local_path = ?').get(filePath) as any;
        if (existing) {
          upsertStmt.run(filePath, filename, normalized, mimeType, ext, stat.size, width, height, sha256);
          updatedCount++;
        } else {
          upsertStmt.run(filePath, filename, normalized, mimeType, ext, stat.size, width, height, sha256);
          newCount++;
        }
        scanned++;
      } catch (err: any) {
        errors.push(`${path.basename(filePath)}: ${err.message}`);
      }
    }
  });
  batch();

  // 异步更新图片尺寸
  updateImageDimensions();

  return { scanned, new: newCount, updated: updatedCount, errors };
}

function collectImageFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('_')) {
        results.push(...collectImageFiles(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch {}
  return results;
}

function computeSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

async function updateImageDimensions(): Promise<void> {
  const db = getDatabase();
  const images = db.prepare('SELECT id, local_path FROM category_images WHERE width = 0 OR width IS NULL').all() as any[];
  for (const img of images) {
    try {
      const metadata = await sharp(img.local_path).metadata();
      db.prepare('UPDATE category_images SET width = ?, height = ? WHERE id = ?')
        .run(metadata.width || 0, metadata.height || 0, img.id);
    } catch {}
  }
}

// ============================================================
// 匹配算法
// ============================================================

const ALIAS_MAP: Record<string, string> = {
  'pocophone': 'poco',
  'mi note': 'note',
  'pro plus': 'pro+',
  '5 g': '5g',
  '4 g': '4g',
};

export function runMatching(categoryIds?: number[]): { matched: number; unmatched: number; conflicts: number } {
  const db = getDatabase();

  // 清除旧的非人工映射（如果指定了分类，只清除那些分类的；否则全部清除）
  if (categoryIds && categoryIds.length > 0) {
    const placeholders = categoryIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM category_image_mappings WHERE match_type != 'manual' AND category_id IN (${placeholders})`).run(...categoryIds);
  } else {
    db.prepare(`DELETE FROM category_image_mappings WHERE match_type != 'manual'`).run();
  }

  let whereActive = 'WHERE active = 1';
  const params: any[] = [];
  if (categoryIds && categoryIds.length > 0) {
    const placeholders = categoryIds.map(() => '?').join(',');
    whereActive += ` AND id IN (${placeholders})`;
    params.push(...categoryIds);
  }

  const categories = db.prepare(`SELECT * FROM categories ${whereActive}`).all(...params) as any[];
  const images = db.prepare('SELECT * FROM category_images WHERE ignored = 0').all() as any[];

  let matched = 0, unmatched = 0, conflicts = 0;

  // 构建标准化名称索引
  const imageByNormalized = new Map<string, any[]>();
  for (const img of images) {
    const key = img.normalized_filename;
    if (!imageByNormalized.has(key)) imageByNormalized.set(key, []);
    imageByNormalized.get(key)!.push(img);
  }

  const insertMapping = db.prepare(`
    INSERT OR IGNORE INTO category_image_mappings (category_id, category_image_id, match_type, confidence, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const batch = db.transaction(() => {
    for (const cat of categories) {
      const normalized = cat.normalized_name;
      const exactMatches = imageByNormalized.get(normalized) || [];

      if (exactMatches.length === 1) {
        // 精确匹配
        insertMapping.run(cat.id, exactMatches[0].id, 'exact', 1.0, 'suggested');
        matched++;
      } else if (exactMatches.length > 1) {
        // 多图冲突
        for (const img of exactMatches) {
          insertMapping.run(cat.id, img.id, 'exact', 1.0, 'conflict');
        }
        conflicts++;
      } else {
        // 尝试别名匹配
        let aliasMatched = false;
        for (const [alias, target] of Object.entries(ALIAS_MAP)) {
          if (normalized.includes(alias)) {
            const replacedName = normalized.replace(alias, target);
            const aliasMatches = imageByNormalized.get(replacedName) || [];
            if (aliasMatches.length === 1) {
              insertMapping.run(cat.id, aliasMatches[0].id, 'alias', 0.85, 'suggested');
              aliasMatched = true;
              matched++;
              break;
            }
          }
        }
        if (!aliasMatched) {
          // 第三层：令牌子集匹配 — 图片名所有令牌都在分类名中（或反过来）
          const catTokens: Set<string> = new Set(normalized.split(' ').filter((s: string) => s.length > 0));
          let tokenMatched = false;
          for (const [imgNorm, imgList] of imageByNormalized.entries()) {
            if (imgList.length !== 1) continue;
            const imgTokens: string[] = imgNorm.split(' ').filter((s: string) => s.length > 0);
            if (imgTokens.length === 0) continue;
            // 检查一方令牌是否完全包含另一方
            const imgAllInCat = imgTokens.every((t: string) => catTokens.has(t));
            const catAllInImg = catTokens.size > 0 && Array.from(catTokens).every((t: string) => imgTokens.includes(t));
            if (imgAllInCat || catAllInImg) {
              insertMapping.run(cat.id, imgList[0].id, 'fuzzy', 0.85, 'suggested');
              tokenMatched = true;
              matched++;
              break;
            }
          }
          if (!tokenMatched) {
            unmatched++;
          }
        }
      }
    }
  });
  batch();

  // 检测一图多分类冲突
  detectSharedImageConflicts();

  return { matched, unmatched, conflicts };
}

function detectSharedImageConflicts(): void {
  const db = getDatabase();
  // 查找同一图片被映射到多个分类的情况
  const shared = db.prepare(`
    SELECT category_image_id, COUNT(DISTINCT category_id) as cnt
    FROM category_image_mappings
    WHERE status IN ('suggested', 'confirmed')
    GROUP BY category_image_id
    HAVING cnt > 1
  `).all() as any[];

  const updateStmt = db.prepare(`
    UPDATE category_image_mappings SET status = 'conflict', updated_at = datetime('now')
    WHERE category_image_id = ? AND status = 'suggested'
  `);

  for (const row of shared) {
    updateStmt.run(row.category_image_id);
  }
}

// ============================================================
// 人工映射操作
// ============================================================

export function confirmMapping(categoryId: number, categoryImageId: number): void {
  const db = getDatabase();
  // 将指定映射确认
  db.prepare(`
    UPDATE category_image_mappings
    SET status = 'confirmed', confirmed_by_user = 1, updated_at = datetime('now')
    WHERE category_id = ? AND category_image_id = ?
  `).run(categoryId, categoryImageId);
  // 同一分类的其他冲突/建议映射自动拒绝
  db.prepare(`
    UPDATE category_image_mappings
    SET status = 'rejected', updated_at = datetime('now')
    WHERE category_id = ? AND category_image_id != ? AND status IN ('suggested', 'conflict')
  `).run(categoryId, categoryImageId);
}

export function rejectMapping(categoryId: number, categoryImageId: number): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE category_image_mappings
    SET status = 'rejected', updated_at = datetime('now')
    WHERE category_id = ? AND category_image_id = ?
  `).run(categoryId, categoryImageId);
}

export function manualMap(categoryId: number, categoryImageId: number): void {
  const db = getDatabase();
  // 先删除该分类的其他 suggested 映射
  db.prepare(`
    UPDATE category_image_mappings SET status = 'rejected', updated_at = datetime('now')
    WHERE category_id = ? AND status = 'suggested' AND category_image_id != ?
  `).run(categoryId, categoryImageId);

  db.prepare(`
    INSERT INTO category_image_mappings (category_id, category_image_id, match_type, confidence, status, confirmed_by_user, created_at, updated_at)
    VALUES (?, ?, 'manual', 1.0, 'confirmed', 1, datetime('now'), datetime('now'))
    ON CONFLICT(category_id, category_image_id) DO UPDATE SET
      status = 'confirmed', confirmed_by_user = 1, match_type = 'manual', updated_at = datetime('now')
  `).run(categoryId, categoryImageId);
}

// ============================================================
// 图片预处理
// ============================================================

export async function prepareImageForUpload(inputPath: string, isThumb = false): Promise<Buffer> {
  const settings = loadCategoryImageSettings();
  const maxSize = isThumb ? 350 : settings.categoryImageMaxSize;
  const quality = isThumb ? 90 : settings.categoryImageJpegQuality;
  const fit = isThumb ? 'cover' as const : 'inside' as const;

  return await sharp(inputPath)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({
      width: maxSize,
      height: maxSize,
      fit,
      withoutEnlargement: !isThumb,
    })
    .jpeg({
      quality,
      mozjpeg: true,
    })
    .toBuffer();
}

// ============================================================
// Dry Run 预检
// ============================================================

export function runDryRun(categoryIds?: number[]): UploadPreview {
  const db = getDatabase();
  const settings = loadCategoryImageSettings();

  let whereClause = `WHERE m.status = 'confirmed'`;
  const params: any[] = [];
  if (categoryIds && categoryIds.length > 0) {
    whereClause += ` AND m.category_id IN (${categoryIds.map(() => '?').join(',')})`;
    params.push(...categoryIds);
  }

  const mappings = db.prepare(`
    SELECT m.*, c.prestashop_category_id, c.name as category_name,
           ci.local_path as image_path, ci.filename as image_filename, ci.file_size
    FROM category_image_mappings m
    JOIN categories c ON m.category_id = c.id
    JOIN category_images ci ON m.category_image_id = ci.id
    ${whereClause}
  `).all(...params) as any[];

  const items: UploadPreviewItem[] = [];
  let ready = 0, unmatched = 0, conflict = 0, invalidFile = 0, missingCategory = 0;

  for (const m of mappings) {
    const item: UploadPreviewItem = {
      categoryId: m.category_id,
      prestashopCategoryId: m.prestashop_category_id,
      categoryName: m.category_name,
      imageFilename: m.image_filename,
      imageLocalPath: m.image_path,
      mappingStatus: m.status,
    };

    // 检查图片文件
    if (!fs.existsSync(m.image_path)) {
      item.issue = 'IMAGE_NOT_FOUND';
      invalidFile++;
    } else if (m.file_size === 0) {
      item.issue = 'IMAGE_INVALID';
      invalidFile++;
    } else if (m.file_size > settings.categoryImageMaxFileSizeMb * 1024 * 1024) {
      item.issue = 'IMAGE_TOO_LARGE';
      invalidFile++;
    } else {
      ready++;
    }

    items.push(item);
  }

  // 检查未匹配的分类
  let unmatchedWhere = 'WHERE c.active = 1';
  const unmatchedParams: any[] = [];
  if (categoryIds && categoryIds.length > 0) {
    unmatchedWhere += ` AND c.id IN (${categoryIds.map(() => '?').join(',')})`;
    unmatchedParams.push(...categoryIds);
  }

  const unmatchedCats = db.prepare(`
    SELECT c.* FROM categories c
    LEFT JOIN category_image_mappings m ON c.id = m.category_id AND m.status IN ('confirmed', 'suggested')
    ${unmatchedWhere} AND m.id IS NULL
  `).all(...unmatchedParams) as any[];

  for (const cat of unmatchedCats) {
    items.push({
      categoryId: cat.id,
      prestashopCategoryId: cat.prestashop_category_id,
      categoryName: cat.name,
      issue: 'MATCH_NOT_CONFIRMED',
    });
    unmatched++;
  }

  // 检查冲突
  const conflictMappings = db.prepare(`
    SELECT m.*, c.prestashop_category_id, c.name as category_name, ci.filename as image_filename
    FROM category_image_mappings m
    JOIN categories c ON m.category_id = c.id
    JOIN category_images ci ON m.category_image_id = ci.id
    WHERE m.status = 'conflict'
  `).all() as any[];

  for (const m of conflictMappings) {
    items.push({
      categoryId: m.category_id,
      prestashopCategoryId: m.prestashop_category_id,
      categoryName: m.category_name,
      imageFilename: m.image_filename,
      mappingStatus: 'conflict',
      issue: 'MATCH_CONFLICT',
    });
    conflict++;
  }

  return {
    total: items.length,
    ready,
    unmatched,
    conflict,
    invalidFile,
    missingCategory,
    canStart: invalidFile === 0 && ready > 0,
    items,
  };
}
