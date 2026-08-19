// 缺货上报路由：手机扫码上报 + 网站红标汇总 + 一键同步库存
import { Router, Request, Response } from 'express';
import {
  createStockReport, getStockReportSummary, listStockReports, findProductByQuery, fetchWebsiteQuantity,
  syncReportToWebsite, syncAllReportsToWebsite, resolveStockReport, deleteStockReport,
} from '../services/stockReportService';

const router = Router();

// GET /api/stock-report/find?query=xxx — 只读查产品（扫码/输条码用，不创建记录）
router.get('/find', async (req: Request, res: Response) => {
  try {
    const product = findProductByQuery(String(req.query.query || ''));
    if (!product) return res.status(404).json({ success: false, error: '未找到该产品，请检查条码或编号' });
    const websiteQuantity = await fetchWebsiteQuantity(product.prestashopProductId);
    res.json({ success: true, data: { ...product, websiteQuantity } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/stock-report — 上报缺货（手机扫码/输条码）
router.post('/', async (req: Request, res: Response) => {
  try {
    const report = await createStockReport(req.body || {});
    res.json({ success: true, data: report, message: '缺货已记录' });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// GET /api/stock-report/summary — 缺货数量（网站红标用，只统计 active 未解决）
router.get('/summary', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: getStockReportSummary() });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/stock-report/list?status=active|synced|resolved|all
router.get('/list', (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: listStockReports(String(req.query.status || 'all')) });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/stock-report/:id/sync — 同步单条库存到网站
router.post('/:id/sync', async (req: Request, res: Response) => {
  try {
    const result = await syncReportToWebsite(Number(req.params.id));
    if (!result.success) return res.status(400).json({ success: false, error: result.error });
    res.json({ success: true, message: '已同步到网站' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/stock-report/sync-all — 一键同步全部
router.post('/sync-all', async (_req: Request, res: Response) => {
  try {
    const result = await syncAllReportsToWebsite();
    res.json({ success: true, data: result, message: `同步完成：成功 ${result.synced}，失败 ${result.failed}` });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/stock-report/:id/resolve — 补货后标记已解决
router.post('/:id/resolve', (req: Request, res: Response) => {
  try {
    resolveStockReport(Number(req.params.id));
    res.json({ success: true, message: '已标记为解决' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/stock-report/:id — 删除上报
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const ok = deleteStockReport(Number(req.params.id));
    if (!ok) return res.status(404).json({ success: false, error: '记录不存在' });
    res.json({ success: true, message: '已删除' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
