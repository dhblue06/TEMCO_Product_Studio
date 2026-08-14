import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/database';
import { scanProductImages } from '../services/productImage/productImageScanner';
import { runProductImageMatching, confirmProductMapping, rejectProductMapping, manualProductMap } from '../services/productImage/productImageMatchingService';
import { createProductUploadBatch, startProductUploadBatch, retryProductFailedJobs, getProductBatchStatus } from '../services/productImage/productImageUploadService';

const router = Router();

// === 扫描 ===
router.post('/scan', (req, res) => {
  try {
    const { directory } = req.body || {};
    const r = scanProductImages(directory);
    res.json({ success: true, data: r, message: `扫描 ${r.scanned} 张（新增 ${r.new}）` });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { page = '1', pageSize = '100' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const total = (db.prepare('SELECT COUNT(*) as c FROM product_scan_images WHERE ignored = 0').get() as any)?.c || 0;
    const images = db.prepare(`SELECT si.*, m.product_id, m.status as mapping_status, p.reference FROM product_scan_images si LEFT JOIN product_scan_mappings m ON si.id = m.scan_image_id AND m.status IN ('confirmed','suggested') LEFT JOIN products p ON m.product_id = p.id WHERE si.ignored = 0 ORDER BY si.filename LIMIT ? OFFSET ?`).all(parseInt(pageSize as string), offset);
    res.json({ success: true, data: { images, pagination: { page: parseInt(page as string), pageSize: parseInt(pageSize as string), total, totalPages: Math.ceil(total / parseInt(pageSize as string)) } } });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/stats', (req, res) => {
  try {
    const db = getDatabase();
    const total = (db.prepare('SELECT COUNT(*) as c FROM product_scan_images WHERE ignored = 0').get() as any)?.c || 0;
    const matched = (db.prepare("SELECT COUNT(DISTINCT scan_image_id) as c FROM product_scan_mappings WHERE status IN ('confirmed','suggested')").get() as any)?.c || 0;
    res.json({ success: true, data: { total, matched, unmatched: total - matched } });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/clear', (req, res) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM product_scan_mappings').run();
    const r = db.prepare('DELETE FROM product_scan_images').run();
    res.json({ success: true, message: `已清空 ${r.changes} 张图片` });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// === 匹配 ===
router.post('/matching/run', (req, res) => {
  try {
    const r = runProductImageMatching();
    res.json({ success: true, data: r, message: `匹配 ${r.matched} 张，未匹配 ${r.unmatched}，冲突 ${r.conflicts}` });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/matching/results', (req, res) => {
  try {
    const db = getDatabase();
    const results = db.prepare(`SELECT m.*, p.reference, p.name as product_name, si.filename FROM product_scan_mappings m JOIN products p ON m.product_id = p.id JOIN product_scan_images si ON m.scan_image_id = si.id ORDER BY m.status, p.reference`).all();
    res.json({ success: true, data: { results } });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/matching/confirm', (req, res) => {
  try { confirmProductMapping(req.body.productId, req.body.scanImageId); res.json({ success: true }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/matching/reject', (req, res) => {
  try { rejectProductMapping(req.body.productId, req.body.scanImageId); res.json({ success: true }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/matching/manual-map', (req, res) => {
  try { manualProductMap(req.body.productId, req.body.scanImageId); res.json({ success: true }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// === 上传 ===
router.post('/uploads/preview', (req, res) => {
  try {
    const db = getDatabase();
    const count = (db.prepare("SELECT COUNT(*) as c FROM product_scan_mappings WHERE status = 'confirmed'").get() as any)?.c || 0;
    const products = (db.prepare("SELECT COUNT(DISTINCT product_id) as c FROM product_scan_mappings WHERE status = 'confirmed'").get() as any)?.c || 0;
    res.json({ success: true, data: { totalImages: count, productCount: products, canStart: count > 0 } });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/uploads/create', (req, res) => {
  try {
    const r = createProductUploadBatch(req.body?.productIds);
    res.json({ success: true, data: r, message: `批次 ${r.batchId}，${r.jobCount} 张图片` });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/uploads/:batchId/start', async (req, res) => {
  try {
    const r = await startProductUploadBatch(req.params.batchId);
    res.json({ success: r.started, message: r.message });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/uploads/:batchId/retry-failed', async (req, res) => {
  try {
    const r = retryProductFailedJobs(req.params.batchId);
    res.json({ success: true, message: `重试 ${r.retried} 个失败任务` });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/uploads/:batchId', (req, res) => {
  try { res.json({ success: true, data: getProductBatchStatus(req.params.batchId) }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;
