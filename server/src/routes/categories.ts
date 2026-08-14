import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDatabase } from '../database/database';
import {
  importCategoriesFromCsv,
  syncCategoriesFromPrestaShop,
  scanCategoryImages,
  runMatching,
  confirmMapping,
  rejectMapping,
  manualMap,
  runDryRun,
  loadCategoryImageSettings,
  normalizeCategoryImageName,
} from '../services/categoryImage/categoryImageService';
import {
  createUploadBatch,
  startUploadBatch,
  cancelBatch,
  retryFailedJobs,
  getBatchStatus,
  getAllBatches,
  exportBatchLogsCsv,
} from '../services/categoryImage/categoryImageUploadService';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ============================================================
// 分类数据
// ============================================================

// POST /api/categories/import-csv - 导入分类 CSV
router.post('/import-csv', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请上传 CSV 文件' });
    }
    const content = req.file.buffer.toString('utf-8');
    const result = await importCategoriesFromCsv(content);
    res.json({ success: true, data: result, message: `导入 ${result.imported} 个新分类，更新 ${result.updated} 个分类` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/categories/sync-prestashop - 从 PrestaShop 同步分类
router.post('/sync-prestashop', async (req: Request, res: Response) => {
  try {
    const result = await syncCategoriesFromPrestaShop();
    res.json({
      success: result.errors.length === 0,
      data: result,
      message: `同步 ${result.synced} 个分类${result.errors.length > 0 ? `，${result.errors.length} 个错误` : ''}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/categories - 获取分类列表
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { search, matchStatus, uploadStatus, parentId, page = '1', pageSize = '50' } = req.query;

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (search) {
      where += ` AND (c.name LIKE ? OR CAST(c.prestashop_category_id AS TEXT) LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (parentId) {
      // parentId=root 表示只看根分类(parent_id IS NULL); 具体数字则只显示该父分类下的子项
      if (parentId === 'root') {
        where += ` AND c.parent_id IS NULL`;
      } else {
        const num = parseInt(parentId as string, 10);
        if (!isNaN(num)) {
          where += ` AND c.parent_id = ?`;
          params.push(num);
        }
      }
    }

    if (matchStatus) {
      if (matchStatus === 'matched') {
        where += ` AND m.id IS NOT NULL AND m.status IN ('confirmed','suggested')`;
      } else if (matchStatus === 'unmatched') {
        where += ` AND m.id IS NULL`;
      } else if (matchStatus === 'conflict') {
        where += ` AND m.status = 'conflict'`;
      }
    }

    const offset = (parseInt(page as string) - 1) * parseInt(pageSize as string);

    const countSql = `
      SELECT COUNT(DISTINCT c.id) as total FROM categories c
      LEFT JOIN category_image_mappings m ON c.id = m.category_id AND m.status IN ('confirmed','suggested','conflict')
      ${where}
    `;
    const total = (db.prepare(countSql).get(...params) as any)?.total || 0;

    const sql = `
      SELECT c.*, p.name as parent_name,
             m.id as mapping_id, m.match_type, m.status as mapping_status, m.confidence,
             ci.filename as image_filename, ci.local_path as image_path,
             (SELECT COUNT(*) FROM category_image_upload_jobs j WHERE j.category_id = c.id AND j.status = 'success') as upload_success_count,
             (SELECT MAX(j.finished_at) FROM category_image_upload_jobs j WHERE j.category_id = c.id AND j.status = 'success') as last_upload_at
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.prestashop_category_id
      LEFT JOIN (
        SELECT category_id, id, match_type, status, confidence, category_image_id,
               ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY CASE status WHEN 'confirmed' THEN 1 WHEN 'suggested' THEN 2 WHEN 'conflict' THEN 3 ELSE 4 END) as rn
        FROM category_image_mappings
      ) m ON c.id = m.category_id AND m.rn = 1 AND m.status IN ('confirmed','suggested','conflict')
      LEFT JOIN category_images ci ON m.category_image_id = ci.id
      ${where}
      ORDER BY c.prestashop_category_id ASC
      LIMIT ? OFFSET ?
    `;

    const categories = db.prepare(sql).all(...params, parseInt(pageSize as string), offset) as any[];

    res.json({
      success: true,
      data: {
        categories,
        pagination: {
          page: parseInt(page as string),
          pageSize: parseInt(pageSize as string),
          total,
          totalPages: Math.ceil(total / parseInt(pageSize as string)),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/categories/stats - 获取统计信息
router.get('/stats', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const total = (db.prepare('SELECT COUNT(*) as c FROM categories').get() as any)?.c || 0;
    const matched = (db.prepare(`SELECT COUNT(DISTINCT category_id) as c FROM category_image_mappings WHERE status IN ('confirmed','suggested')`).get() as any)?.c || 0;
    const confirmed = (db.prepare(`SELECT COUNT(DISTINCT category_id) as c FROM category_image_mappings WHERE status = 'confirmed'`).get() as any)?.c || 0;
    const conflict = (db.prepare(`SELECT COUNT(DISTINCT category_id) as c FROM category_image_mappings WHERE status = 'conflict'`).get() as any)?.c || 0;
    const totalImages = (db.prepare('SELECT COUNT(*) as c FROM category_images WHERE ignored = 0').get() as any)?.c || 0;
    const uploaded = (db.prepare(`SELECT COUNT(DISTINCT category_id) as c FROM category_image_upload_jobs WHERE status = 'success'`).get() as any)?.c || 0;

    res.json({
      success: true,
      data: { total, matched, confirmed, unmatched: total - matched, conflict, totalImages, uploaded },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/categories/parents - 获取可作为父分类筛选的分类列表（有子分类的 + 根级）
router.get('/parents', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    // 找出有子分类的父分类，以及用 0 表示的根级
    const parents = db.prepare(`
      SELECT c.prestashop_category_id, c.name, COUNT(ch.id) as child_count
      FROM categories c
      JOIN categories ch ON ch.parent_id = c.prestashop_category_id
      WHERE ch.active = 1
      GROUP BY c.prestashop_category_id
      ORDER BY c.name ASC
    `).all() as any[];
    res.json({ success: true, data: parents });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 图片扫描
// ============================================================

// POST /api/categories/scan-images - 扫描分类图片目录
router.post('/scan-images', async (req: Request, res: Response) => {
  try {
    const { dirPath } = req.body || {};
    const result = await scanCategoryImages(dirPath);
    res.json({
      success: true,
      data: result,
      message: `扫描 ${result.scanned} 张图片（新增 ${result.new}，更新 ${result.updated}）`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/categories/images - 获取分类图片列表
router.get('/images', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { search, ignored = '0', page = '1', pageSize = '100' } = req.query;

    let where = 'WHERE ci.ignored = ?';
    const params: any[] = [ignored === '1' ? 1 : 0];

    if (search) {
      where += ` AND ci.filename LIKE ?`;
      params.push(`%${search}%`);
    }

    const offset = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const total = (db.prepare(`SELECT COUNT(*) as c FROM category_images ci ${where}`).get(...params) as any)?.c || 0;

    const images = db.prepare(`
      SELECT ci.*,
             m.category_id, m.status as mapping_status,
             c.name as category_name, c.prestashop_category_id
      FROM category_images ci
      LEFT JOIN category_image_mappings m ON ci.id = m.category_image_id AND m.status IN ('confirmed','suggested','conflict')
      LEFT JOIN categories c ON m.category_id = c.id
      ${where}
      ORDER BY ci.filename ASC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(pageSize as string), offset) as any[];

    res.json({
      success: true,
      data: {
        images,
        pagination: { page: parseInt(page as string), pageSize: parseInt(pageSize as string), total, totalPages: Math.ceil(total / parseInt(pageSize as string)) },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/categories/images/clear - 清空图片库（必须在 :id 路由之前）
router.post('/images/clear', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    // 先删除关联的映射
    db.prepare('DELETE FROM category_image_mappings WHERE category_image_id IN (SELECT id FROM category_images)').run();
    // 再删除所有图片记录
    const r = db.prepare('DELETE FROM category_images').run();
    res.json({ success: true, message: `已清空 ${r.changes} 张图片` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/categories/images/:id/ignore - 忽略/取消忽略图片
router.post('/images/:id/ignore', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { ignored } = req.body;
    db.prepare('UPDATE category_images SET ignored = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(ignored ? 1 : 0, req.params.id);
    res.json({ success: true, message: ignored ? '图片已忽略' : '图片已恢复' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/categories/images/:id/preview - 获取图片预览
router.get('/images/:id/preview', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const img = db.prepare('SELECT local_path FROM category_images WHERE id = ?').get(req.params.id) as any;
    if (!img || !fs.existsSync(img.local_path)) {
      return res.status(404).json({ success: false, error: '图片不存在' });
    }
    res.sendFile(path.resolve(img.local_path));
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 匹配
// ============================================================

// POST /api/categories/matching/run - 执行自动匹配
router.post('/matching/run', (req: Request, res: Response) => {
  try {
    const { categoryIds } = req.body || {};
    const result = runMatching(categoryIds?.length ? categoryIds : undefined);
    res.json({
      success: true,
      data: result,
      message: `匹配完成：${result.matched} 个已匹配，${result.unmatched} 个未匹配，${result.conflicts} 个冲突`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/categories/matching/results - 获取匹配结果
router.get('/matching/results', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { status, page = '1', pageSize = '100' } = req.query;

    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (status) {
      where += ' AND m.status = ?';
      params.push(status);
    }

    const offset = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const total = (db.prepare(`SELECT COUNT(*) as c FROM category_image_mappings m ${where}`).get(...params) as any)?.c || 0;

    const results = db.prepare(`
      SELECT m.*, c.prestashop_category_id, c.name as category_name, c.full_path,
             ci.filename as image_filename, ci.local_path as image_path, ci.file_size
      FROM category_image_mappings m
      JOIN categories c ON m.category_id = c.id
      JOIN category_images ci ON m.category_image_id = ci.id
      ${where}
      ORDER BY m.status ASC, c.prestashop_category_id ASC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(pageSize as string), offset) as any[];

    res.json({
      success: true,
      data: {
        results,
        pagination: { page: parseInt(page as string), pageSize: parseInt(pageSize as string), total, totalPages: Math.ceil(total / parseInt(pageSize as string)) },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/categories/matching/confirm - 确认映射
router.post('/matching/confirm', (req: Request, res: Response) => {
  try {
    const { categoryId, categoryImageId } = req.body;
    confirmMapping(categoryId, categoryImageId);
    res.json({ success: true, message: '映射已确认' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/categories/matching/reject - 拒绝映射
router.post('/matching/reject', (req: Request, res: Response) => {
  try {
    const { categoryId, categoryImageId } = req.body;
    rejectMapping(categoryId, categoryImageId);
    res.json({ success: true, message: '映射已拒绝' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/categories/matching/manual-map - 人工映射
router.post('/matching/manual-map', (req: Request, res: Response) => {
  try {
    const { categoryId, categoryImageId } = req.body;
    manualMap(categoryId, categoryImageId);
    res.json({ success: true, message: '人工映射已保存' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 上传任务
// ============================================================

// POST /api/categories/uploads/preview - Dry Run 预检
router.post('/uploads/preview', (req: Request, res: Response) => {
  try {
    const { categoryIds } = req.body || {};
    const preview = runDryRun(categoryIds);
    res.json({ success: true, data: preview });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/categories/uploads/create - 创建上传批次
router.post('/uploads/create', (req: Request, res: Response) => {
  try {
    const { categoryIds } = req.body || {};
    const result = createUploadBatch(categoryIds);
    res.json({ success: true, data: result, message: `已创建批次 ${result.batchId}，包含 ${result.jobCount} 个任务` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/categories/uploads/:batchId/start - 开始上传
router.post('/uploads/:batchId/start', async (req: Request, res: Response) => {
  try {
    const result = await startUploadBatch(req.params.batchId);
    res.json({ success: result.started, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/categories/uploads/:batchId/cancel - 取消上传
router.post('/uploads/:batchId/cancel', (req: Request, res: Response) => {
  try {
    const result = cancelBatch(req.params.batchId);
    res.json({ success: true, message: `已取消 ${result.cancelled} 个任务` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/categories/uploads/:batchId/retry-failed - 重试失败项
router.post('/uploads/:batchId/retry-failed', async (req: Request, res: Response) => {
  try {
    const result = await retryFailedJobs(req.params.batchId);
    res.json({ success: true, message: `已重试 ${result.retried} 个失败任务` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/categories/uploads/:batchId - 获取批次状态
router.get('/uploads/:batchId', (req: Request, res: Response) => {
  try {
    const status = getBatchStatus(req.params.batchId);
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/categories/uploads - 获取所有批次
router.get('/uploads', (req: Request, res: Response) => {
  try {
    const batches = getAllBatches();
    res.json({ success: true, data: batches });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/categories/uploads/:batchId/logs - 导出批次日志 CSV
router.get('/uploads/:batchId/logs', (req: Request, res: Response) => {
  try {
    const csv = exportBatchLogsCsv(req.params.batchId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="category-upload-${req.params.batchId}.csv"`);
    res.send('﻿' + csv);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
