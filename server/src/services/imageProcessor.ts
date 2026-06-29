import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { getDatabase } from '../database/database';

const CACHE_DIR = path.join(__dirname, '../../data/cache/images');
const OUTPUT_DIR = path.join(__dirname, '../../data/processed');

// 确保目录存在
[CACHE_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export interface ProcessOptions {
  width: number;
  height: number;
  background: string;
  quality: number;
}

export const DEFAULT_OPTIONS: ProcessOptions = {
  width: 1000,
  height: 1000,
  background: 'white',
  quality: 85,
};

export interface ImageProcessResult {
  reference: string;
  originalName: string;
  exportName: string;
  localPath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  format: string;
  size: number;
  alt: string;
}

/**
 * 生成 SEO 图片导出名
 * 规则：bpt1753-n-accesorio-movil-temco-1.jpg
 */
export function createExportImageName(
  reference: string,
  category: string,
  index: number
): string {
  const friendly = reference
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  // 尝试将中文分类转成西语，兜底用 "producto"
  const categorySlug = category
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);

  const catPart = categorySlug || 'producto';

  return `${friendly}-${catPart}-temco-${index}.jpg`;
}

/**
 * 生成图片 ALT
 * 主图：BPT1753-N accesorio móvil TEMCO
 * 附图：BPT1753-N detalle del producto TEMCO
 */
export function generateImageAlt(
  reference: string,
  category: string,
  index: number,
  totalCount: number
): string {
  const categoryEs = category; // 假设已为西语
  if (index === 1) {
    return `${reference} ${categoryEs} TEMCO`.slice(0, 100);
  }
  
  const altTemplates = [
    `${reference} detalle del producto ${categoryEs} TEMCO`,
    `${reference} vista adicional del ${categoryEs} TEMCO`,
    `${reference} presentación del producto ${categoryEs} TEMCO`,
    `${reference} imagen complementaria ${categoryEs} TEMCO`,
    `${reference} ángulo adicional ${categoryEs} TEMCO`,
    `${reference} detalle técnico ${categoryEs} TEMCO`,
    `${reference} vista completa ${categoryEs} TEMCO`,
  ];

  const idx = Math.min(index - 2, altTemplates.length - 1);
  return altTemplates[idx].slice(0, 100);
}

/**
 * 处理单张图片：裁切、白底、居中、压缩
 */
export async function processImage(
  inputPath: string,
  reference: string,
  category: string,
  index: number,
  options: ProcessOptions = DEFAULT_OPTIONS
): Promise<ImageProcessResult> {
  const exportName = createExportImageName(reference, category, index);
  const outputPath = path.join(OUTPUT_DIR, exportName);
  const thumbnailName = `thumb_${exportName}`;
  const thumbnailPath = path.join(OUTPUT_DIR, thumbnailName);

  const image = sharp(inputPath);
  const metadata = await image.metadata();

  // 处理：resize 并填充白底
  await image
    .resize(options.width, options.height, {
      fit: 'contain',
      background: options.background,
    })
    .jpeg({ quality: options.quality })
    .toFile(outputPath);

  // 生成缩略图
  await sharp(inputPath)
    .resize(200, 200, {
      fit: 'cover',
      background: options.background,
    })
    .jpeg({ quality: 60 })
    .toFile(thumbnailPath);

  const outStats = fs.statSync(outputPath);

  return {
    reference,
    originalName: path.basename(inputPath),
    exportName,
    localPath: outputPath,
    thumbnailPath,
    width: options.width,
    height: options.height,
    format: 'jpeg',
    size: outStats.size,
    alt: generateImageAlt(reference, category, index, 0),
  };
}

/**
 * 处理商品的所有图片
 */
export async function processProductImages(
  reference: string,
  images: Array<{ originalName: string; localPath?: string; index: number }>
): Promise<ImageProcessResult[]> {
  const db = getDatabase();
  const product = db.prepare('SELECT category FROM products WHERE reference = ?').get(reference) as any;
  const category = product?.category || 'producto';

  const results: ImageProcessResult[] = [];

  for (const img of images) {
    try {
      // 如果已有本地缓存路径则使用，否则尝试从 cache 目录找
      const inputPath = img.localPath || path.join(CACHE_DIR, img.originalName);
      
      if (!fs.existsSync(inputPath)) {
        console.warn(`[ImageProcess] File not found: ${inputPath}`);
        continue;
      }

      const result = await processImage(inputPath, reference, category, img.index);
      results.push(result);

      // 更新数据库中的图片记录
      const existing = db.prepare(`
        SELECT id FROM product_images 
        WHERE product_id = (SELECT id FROM products WHERE reference = ?) 
        AND image_index = ?
      `).get(reference, img.index) as any;

      if (existing) {
        db.prepare(`
          UPDATE product_images SET 
            export_name = ?, local_path = ?, alt = ?, 
            status = 'processed', mime_type = 'image/jpeg'
          WHERE id = ?
        `).run(result.exportName, result.localPath, result.alt, existing.id);
      }

    } catch (err: any) {
      console.error(`[ImageProcess] Error processing ${img.originalName}:`, err.message);
    }
  }

  return results;
}

/**
 * 获取处理后的图片信息
 */
export function getProcessedImages(reference: string): ImageProcessResult[] {
  const db = getDatabase();
  const images = db.prepare(`
    SELECT * FROM product_images 
    WHERE product_id = (SELECT id FROM products WHERE reference = ?)
    AND status = 'processed'
    ORDER BY image_index ASC
  `).all(reference) as any[];

  return images.map(img => ({
    reference,
    originalName: img.original_name,
    exportName: img.export_name,
    localPath: img.local_path,
    thumbnailPath: img.local_path?.replace('.jpg', '_thumb.jpg') || '',
    width: 1000,
    height: 1000,
    format: 'jpeg',
    size: 0,
    alt: img.alt,
  }));
}
