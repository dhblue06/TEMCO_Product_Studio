import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/database';
import {
  scanProductFolder,
  scanDriveImages,
  scanDriveVideos,
  saveScanResultsToDb,
  ScanResult,
} from '../services/driveScanner';

const router = Router();

/**
 * 模拟扫描：根据数据库中已导入的 reference 列表，生成虚拟文件列表
 * 实际使用时应从 Google Drive API 或本地目录读取
 */
router.post('/scan', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { imageFolderMap, videoFileList } = req.body;

    // 如果前端传了实际的文件夹文件列表，用传的
    if (imageFolderMap && typeof imageFolderMap === 'object') {
      const result = scanDriveImages(imageFolderMap);
      saveScanResultsToDb(result);

      return res.json({
        success: true,
        message: `扫描完成：发现 ${result.totalImages} 张图片，${result.folders.length} 个文件夹`,
        data: result,
      });
    }

    // 否则从数据库已有的 reference 中模拟（用于演示/测试）
    const products = db.prepare('SELECT reference FROM products').all() as any[];
    const imageFolderMapFromDb: Record<string, string[]> = {};

    for (const p of products) {
      // 模拟每个商品有 3-7 张图片
      const imageCount = 3 + (p.reference.length % 5);
      const files: string[] = [];
      for (let i = 1; i <= imageCount; i++) {
        files.push(`${p.reference}_${i}.jpg`);
      }
      // 偶尔添加一些异常文件
      if (p.reference.length % 7 === 0) {
        files.push(`${p.reference}_extra.png`); // 命名不规范
      }
      if (p.reference.length % 5 === 0) {
        files.push(`${p.reference}_1.jpg`); // 重复主图
      }
      imageFolderMapFromDb[p.reference] = files;
    }

    const result = scanDriveImages(imageFolderMapFromDb);
    saveScanResultsToDb(result);

    // 更新状态
    const updateStatus = db.prepare(`
      UPDATE products SET status = CASE
        WHEN status = '待处理' AND reference IN (
          SELECT DISTINCT d.reference FROM (
            SELECT reference FROM products WHERE reference IN (
              SELECT name FROM drive_assets WHERE asset_type = 'image' AND match_status = 'matched'
            )
          ) d
        ) THEN '已匹配图片'
        WHEN status = '待处理' AND reference IN (
          SELECT reference FROM products WHERE reference NOT IN (
            SELECT reference FROM (
              SELECT p.reference FROM products p
              INNER JOIN drive_assets da ON p.reference = da.name
              WHERE da.asset_type = 'image'
            )
          )
        ) THEN '缺图片文件夹'
        ELSE status
      END,
      updated_at = datetime('now')
    `);
    updateStatus.run();

    res.json({
      success: true,
      message: `扫描完成：发现 ${result.totalImages} 张图片，${result.folders.length} 个文件夹`,
      data: result,
    });
  } catch (error: any) {
    console.error('Drive scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 手动为单个商品匹配素材
 */
router.post('/match/:reference', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { reference } = req.params;
    const { images, video } = req.body;

    const product = db.prepare('SELECT id FROM products WHERE reference = ?').get(reference) as any;
    if (!product) {
      return res.status(404).json({ success: false, error: '商品不存在' });
    }

    // 清除旧匹配记录
    db.prepare('DELETE FROM product_images WHERE product_id = ?').run(product.id);
    db.prepare('DELETE FROM product_videos WHERE product_id = ?').run(product.id);

    // 插入新图片
    if (images && Array.isArray(images)) {
      const insertImage = db.prepare(`
        INSERT INTO product_images 
          (product_id, drive_id, original_name, export_name, image_index, role, mime_type, web_view_link, alt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        insertImage.run(
          product.id,
          img.driveId || '',
          img.originalName || `${reference}_${i + 1}.jpg`,
          img.exportName || '',
          i + 1,
          i === 0 ? 'main' : 'gallery',
          img.mimeType || 'image/jpeg',
          img.webViewLink || '',
          img.alt || '',
          img.status || 'ok'
        );
      }
    }

    // 插入视频
    if (video) {
      db.prepare(`
        INSERT INTO product_videos (product_id, drive_id, name, web_view_link)
        VALUES (?, ?, ?, ?)
      `).run(product.id, video.driveId || '', video.name || `${reference}.mp4`, video.webViewLink || '');
    }

    res.json({ success: true, message: '素材匹配成功' });
  } catch (error: any) {
    console.error('Match error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取商品的当前素材匹配状态
 */
router.get('/status/:reference', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { reference } = req.params;

    const product = db.prepare('SELECT id FROM products WHERE reference = ?').get(reference) as any;
    if (!product) {
      return res.status(404).json({ success: false, error: '商品不存在' });
    }

    const images = db.prepare(`
      SELECT * FROM product_images WHERE product_id = ? ORDER BY image_index ASC
    `).all(product.id);

    const video = db.prepare(`
      SELECT * FROM product_videos WHERE product_id = ?
    `).get(product.id) || null;

    const driveAssets = db.prepare(`
      SELECT * FROM drive_assets WHERE product_id = ? ORDER BY created_at DESC
    `).all(product.id);

    res.json({
      success: true,
      data: {
        reference,
        productId: product.id,
        images,
        video,
        driveAssets,
        imageCount: images.length,
        hasMainImage: images.some((i: any) => i.role === 'main'),
        hasVideo: !!video,
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取素材扫描摘要（所有商品的素材匹配概况）
 */
router.get('/summary', (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    // 各类统计
    const matchedImages = db.prepare(`
      SELECT COUNT(DISTINCT p.reference) as count FROM products p
      INNER JOIN product_images pi ON p.id = pi.product_id
      WHERE pi.role = 'main'
    `).get() as any;

    const missingFolders = db.prepare(`
      SELECT COUNT(*) as count FROM products
      WHERE status = '缺图片文件夹' OR (
        status = '待处理' AND id NOT IN (
          SELECT DISTINCT product_id FROM product_images
        )
      )
    `).get() as any;

    const orphanAssets = db.prepare(`
      SELECT COUNT(*) as count FROM drive_assets
      WHERE match_status = 'orphan'
    `).get() as any;

    const abnormalImages = db.prepare(`
      SELECT COUNT(*) as count FROM product_images
      WHERE status = '异常'
    `).get() as any;

    const totalImages = db.prepare(`
      SELECT COUNT(*) as count FROM product_images
    `).get() as any;

    const totalVideos = db.prepare(`
      SELECT COUNT(*) as count FROM product_videos
    `).get() as any;

    res.json({
      success: true,
      data: {
        matchedProducts: matchedImages.count,
        missingFolders: missingFolders.count,
        orphanAssets: orphanAssets.count,
        abnormalImages: abnormalImages.count,
        totalImages: totalImages.count,
        totalVideos: totalVideos.count,
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
