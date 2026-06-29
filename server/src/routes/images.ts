import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getDatabase } from '../database/database';
import {
  processProductImages,
  getProcessedImages,
  createExportImageName,
  generateImageAlt,
  ImageProcessResult,
} from '../services/imageProcessor';

const router = Router();

// 处理商品的所有图片
router.post('/process/:reference', async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const db = getDatabase();

    const product = db.prepare('SELECT * FROM products WHERE reference = ?').get(reference) as any;
    if (!product) {
      return res.status(404).json({ success: false, error: '商品不存在' });
    }

    // 获取该商品的图片
    const images = db.prepare(`
      SELECT * FROM product_images 
      WHERE product_id = ? AND (status IS NULL OR status != 'processed')
      ORDER BY image_index ASC
    `).all(product.id) as any[];

    const category = product.category || 'producto';

    // 先尝试生成 SEO 文件名和 ALT（无论是否有物理图片文件）
    const processResults: any[] = [];
    const processImages = [];

    for (const img of (images.length > 0 ? images : [])) {
      const exportName = createExportImageName(reference, category, img.image_index);
      const alt = generateImageAlt(reference, category, img.image_index, images.length);

      // 检查是否有本地文件可处理
      const localPath = img.local_path || '';
      if (localPath && fs.existsSync(localPath)) {
        processImages.push({
          originalName: img.original_name,
          localPath,
          index: img.image_index,
        });
      } else {
        // 无本地文件，只更新 SEO 名和 ALT
        db.prepare(`
          UPDATE product_images SET export_name = ?, alt = ?, status = 'ok'
          WHERE id = ?
        `).run(exportName, alt, img.id);

        processResults.push({
          originalName: img.original_name,
          exportName,
          alt,
          index: img.image_index,
          processed: false,
        });
      }
    }

    // 对存在本地文件的图片进行 sharp 处理
    if (processImages.length > 0) {
      const sharpResults = await processProductImages(reference, processImages);
      for (const r of sharpResults) {
        processResults.push({
          originalName: r.originalName,
          exportName: r.exportName,
          alt: r.alt,
          processed: true,
          size: r.size,
        });
      }
    }

    // 如果完全没有图片，尝试查询已存在的
    if (images.length === 0 && processResults.length === 0) {
      const existingImages = db.prepare(`
        SELECT * FROM product_images WHERE product_id = ? ORDER BY image_index ASC
      `).all(product.id) as any[];

      if (existingImages.length === 0) {
        return res.json({ success: true, message: '没有需要处理的图片', data: [] });
      }

      for (const img of existingImages) {
        const exportName = createExportImageName(reference, category, img.image_index);
        const alt = generateImageAlt(reference, category, img.image_index, existingImages.length);

        db.prepare(`
          UPDATE product_images SET export_name = ?, alt = ?, status = 'ok'
          WHERE id = ?
        `).run(exportName, alt, img.id);

        processResults.push({
          originalName: img.original_name,
          exportName,
          alt,
          index: img.image_index,
          processed: false,
        });
      }
    }

    // 更新商品状态
    db.prepare(`
      UPDATE products SET status = CASE
        WHEN status = '双语文案已生成' OR status = '双语文案待生成' THEN '图片ALT待生成'
        WHEN status = '已匹配图片' THEN '图片ALT待生成'
        ELSE status
      END, updated_at = datetime('now')
      WHERE id = ?
    `).run(product.id);

    res.json({
      success: true,
      message: `处理完成：${processResults.length} 张图片`,
      data: processResults,
    });
  } catch (error: any) {
    console.error('Process error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量处理图片
router.post('/process-batch', async (req: Request, res: Response) => {
  try {
    const { references } = req.body;
    if (!Array.isArray(references) || references.length === 0) {
      return res.status(400).json({ success: false, error: '请提供商品编号列表' });
    }

    const results: Record<string, any> = {};

    for (const ref of references) {
      try {
        const db = getDatabase();
        const product = db.prepare('SELECT * FROM products WHERE reference = ?').get(ref) as any;
        if (!product) continue;

        const images = db.prepare(`
          SELECT * FROM product_images WHERE product_id = ? ORDER BY image_index ASC
        `).all(product.id) as any[];

        if (images.length === 0) {
          results[ref] = { status: 'no_images' };
          continue;
        }

        const category = product.category || 'producto';
        const imgResults: any[] = [];

        for (const img of images) {
          const exportName = createExportImageName(ref, category, img.image_index);
          const alt = generateImageAlt(ref, category, img.image_index, images.length);

          db.prepare(`
            UPDATE product_images SET export_name = ?, alt = ?, status = 'ok'
            WHERE id = ?
          `).run(exportName, alt, img.id);

          imgResults.push({ originalName: img.original_name, exportName, alt });
        }

        results[ref] = { status: 'ok', count: imgResults.length };
      } catch (err: any) {
        results[ref] = { status: 'error', error: err.message };
      }
    }

    res.json({ success: true, data: results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取处理后的图片信息
router.get('/processed/:reference', (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const images = getProcessedImages(reference);

    res.json({ success: true, data: images });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 预览 SEO 文件名和 ALT（不处理图片）
router.get('/preview/:reference', (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const db = getDatabase();

    const product = db.prepare('SELECT * FROM products WHERE reference = ?').get(reference) as any;
    if (!product) {
      return res.status(404).json({ success: false, error: '商品不存在' });
    }

    const images = db.prepare(`
      SELECT * FROM product_images WHERE product_id = ? ORDER BY image_index ASC
    `).all(product.id) as any[];

    const category = product.category || 'producto';
    const previews = images.map((img, idx) => ({
      originalName: img.original_name,
      exportName: createExportImageName(reference, category, img.image_index),
      alt: generateImageAlt(reference, category, img.image_index, images.length),
      role: img.role,
      index: img.image_index,
    }));

    res.json({ success: true, data: previews });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 提供处理后图片的静态文件访问
router.get('/file/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, '../../data/processed', filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '文件不存在' });
  }

  res.sendFile(filePath);
});

export default router;
