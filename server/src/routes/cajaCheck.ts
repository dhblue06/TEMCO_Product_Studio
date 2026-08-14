// CAJA 新品检查路由（v1.6 文档 §30-37）
import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  previewCheck, runCheck, listBatches, getBatch, deleteBatch, getItems,
  uploadItemsToWebsite, syncPricesToWebsite,
} from '../services/cajaCheck/cajaCheckService';
import { exportItemsCsv } from '../services/cajaCheck/exportService';
import { InvalidCajaFileError } from '../services/cajaCheck/excelParser';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) cb(null, true);
    else cb(new Error('仅支持 Excel 文件（.xlsx / .xls）'));
  },
});

function getFile(req: Request): { buffer: Buffer; filename: string } {
  if (!req.file) throw new Error('请先选择 CAJA Products.xlsx 文件');
  return { buffer: req.file.buffer, filename: req.file.originalname || 'Products.xlsx' };
}

// POST /api/caja-check/preview — 上传 Excel 预览（不比对网站）
router.post('/preview', upload.single('file'), (req: Request, res: Response) => {
  try {
    const { buffer, filename } = getFile(req);
    const result = previewCheck(buffer, filename);
    res.json({ success: true, data: result });
  } catch (e: any) {
    if (e instanceof InvalidCajaFileError) {
      return res.status(400).json({ success: false, error: 'INVALID_CAJA_FILE', missingColumns: e.missingColumns });
    }
    res.status(400).json({ success: false, error: e.message });
  }
});

// POST /api/caja-check/run — 正式检查（网站失败 → 整批失败，禁止全部误判新品）
router.post('/run', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { buffer, filename } = getFile(req);
    const summary = await runCheck(buffer, filename);
    res.json({ success: true, data: summary });
  } catch (e: any) {
    if (e instanceof InvalidCajaFileError) {
      return res.status(400).json({ success: false, error: 'INVALID_CAJA_FILE', missingColumns: e.missingColumns });
    }
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/caja-check/batches — 最近检查批次（20 个）
router.get('/batches', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: listBatches() });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/caja-check/batches/:id — 批次详情
router.get('/batches/:id', (req: Request, res: Response) => {
  try {
    const batch = getBatch(Number(req.params.id));
    if (!batch) return res.status(404).json({ success: false, error: '批次不存在' });
    res.json({ success: true, data: batch });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/caja-check/batches/:id/items — 批次明细（默认 status=new）
router.get('/batches/:id/items', (req: Request, res: Response) => {
  try {
    const batchId = Number(req.params.id);
    const result = getItems(batchId, {
      status: String(req.query.status || 'new'),
      search: String(req.query.search || ''),
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 50,
      sort: String(req.query.sort || ''),
      order: String(req.query.order || ''),
    });
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/caja-check/batches/:id/upload-to-website — 勾选新品批量创建到网站（基础信息）
router.post('/batches/:id/upload-to-website', async (req: Request, res: Response) => {
  try {
    const itemIds = (req.body?.itemIds || []).map(Number).filter((n: number) => Number.isFinite(n) && n > 0);
    if (itemIds.length === 0) return res.status(400).json({ success: false, error: '未选择要上传的商品' });
    const result = await uploadItemsToWebsite(Number(req.params.id), itemIds);
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/caja-check/batches/:id/sync-prices — 勾选商品：网站价格更新为文件售价（以文件为准）
router.post('/batches/:id/sync-prices', async (req: Request, res: Response) => {
  try {
    const itemIds = (req.body?.itemIds || []).map(Number).filter((n: number) => Number.isFinite(n) && n > 0);
    if (itemIds.length === 0) return res.status(400).json({ success: false, error: '未选择要同步价格的商品' });
    const result = await syncPricesToWebsite(Number(req.params.id), itemIds);
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/caja-check/batches/:id/export — 导出 CSV（默认 status=new）
router.get('/batches/:id/export', (req: Request, res: Response) => {
  try {
    const { csv, filename } = exportItemsCsv(Number(req.params.id), String(req.query.status || 'new'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/caja-check/batches/:id — 删除批次（级联删除明细）
router.delete('/batches/:id', (req: Request, res: Response) => {
  try {
    const ok = deleteBatch(Number(req.params.id));
    if (!ok) return res.status(404).json({ success: false, error: '批次不存在' });
    res.json({ success: true, message: '批次已删除' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
