import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/database';
import multer from 'multer';
import { previewImport, commitImport } from '../services/websiteCatalog/importService';
import { lookupProducts } from '../services/websiteCatalog/lookupService';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// POST /api/website-import/preview - 预览导入文件
router.post('/preview', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: '请选择文件' });
    const csvText = req.file.buffer.toString('utf-8');
    const result = previewImport(csvText, req.file.originalname);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/website-import/commit - 正式导入
router.post('/commit', (req: Request, res: Response) => {
  try {
    const { csvContent, sourceName, importMode, activationAssumption, updateWebsiteStatus } = req.body;
    if (!csvContent) return res.status(400).json({ success: false, error: '缺少 CSV 内容' });

    const result = commitImport(csvContent, sourceName || 'website_export.csv', {
      importMode: importMode || 'replace',
      activationAssumption: activationAssumption || 'active_only',
      updateWebsiteStatus: updateWebsiteStatus !== false,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/website-import/current - 当前导入批次
router.get('/current', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const batch = db.prepare(
      "SELECT * FROM prestashop_import_batches WHERE is_current = 1 AND status = 'completed' ORDER BY id DESC LIMIT 1"
    ).get() as any;

    if (!batch) return res.json({ success: true, data: null });

    const stats = db.prepare(`
      SELECT
        match_status, COUNT(*) as count
      FROM product_website_matches WHERE batch_id = ?
      GROUP BY match_status
    `).all(batch.id) as any[];

    res.json({ success: true, data: { batch, stats } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/website-import/batches/:batchId - 批次详情
router.get('/batches/:batchId', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { batchId } = req.params;
    const { status, search, page = '1', pageSize = '50' } = req.query;

    let where = 'WHERE pwm.batch_id = ?';
    const params: any[] = [batchId];

    if (status && status !== 'all') {
      where += ' AND pwm.match_status = ?';
      params.push(status);
    }
    if (search) {
      where += " AND (pps.reference LIKE ? OR pps.website_name LIKE ? OR pps.prestashop_id LIKE ?)";
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    const limit = Math.min(200, Math.max(1, parseInt(pageSize as string, 10) || 50));
    const offset = (Math.max(1, parseInt(page as string, 10) || 1) - 1) * limit;

    const total = (db.prepare(`
      SELECT COUNT(*) as count FROM product_website_matches pwm
      JOIN prestashop_product_snapshots pps ON pwm.snapshot_id = pps.id
      ${where}
    `).get(...params) as any).count;

    const rows = db.prepare(`
      SELECT pwm.*, pps.*, pr.reference as local_reference_val, pr.name as local_name
      FROM product_website_matches pwm
      JOIN prestashop_product_snapshots pps ON pwm.snapshot_id = pps.id
      LEFT JOIN products pr ON pwm.product_id = pr.id
      ${where}
      ORDER BY pps.row_number ASC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      success: true,
      data: { rows, pagination: { total, page: Number(page), pageSize: limit, totalPages: Math.ceil(total / limit) } },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/website-import/rematch/:batchId - 重新匹配
router.post('/rematch/:batchId', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { batchId } = req.params;

    const { buildLocalIndex, matchSnapshot } = require('../services/websiteCatalog/importService');

    const snapshots = db.prepare(
      'SELECT id, normalized_reference, prestashop_id FROM prestashop_product_snapshots WHERE batch_id = ?'
    ).all(batchId) as any[];

    const localProducts = db.prepare('SELECT id, reference, prestashop_id FROM products').all() as any[];
    const localIndex = buildLocalIndex(localProducts);

    let matched = 0, unmatched = 0, conflicts = 0;

    const updateMatch = db.prepare(`
      UPDATE product_website_matches SET
        product_id = ?, match_status = ?, match_method = ?, confidence = ?,
        is_on_website = ?, matched_at = datetime('now')
      WHERE batch_id = ? AND snapshot_id = ?
    `);

    for (const snap of snapshots) {
      const result = matchSnapshot(
        { normalized_reference: snap.normalized_reference, prestashop_id: snap.prestashop_id },
        localIndex, snap.id
      );

      updateMatch.run(
        result.productId, result.matchStatus, result.matchMethod,
        result.confidence, result.isOnWebsite ? 1 : 0,
        batchId, snap.id
      );

      if (result.matchStatus === 'matched') matched++;
      else if (result.matchStatus === 'conflict') conflicts++;
      else unmatched++;
    }

    db.prepare(`
      UPDATE prestashop_import_batches SET
        matched_rows = ?, unmatched_rows = ?, conflict_rows = ?,
        completed_at = datetime('now')
      WHERE id = ?
    `).run(matched, unmatched, conflicts, batchId);

    res.json({ success: true, data: { total: snapshots.length, matched, unmatched, conflicts } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/product-lookup/query - 批量编号查询
router.post('/product-lookup/query', (req: Request, res: Response) => {
  try {
    const { input, matchFields, deduplicateProducts } = req.body;
    if (!input || !input.trim()) {
      return res.status(400).json({ success: false, error: '请输入查询内容' });
    }

    const result = lookupProducts({
      input,
      matchFields: matchFields || ['reference', 'ean13', 'upc'],
      deduplicateProducts: deduplicateProducts !== false,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
