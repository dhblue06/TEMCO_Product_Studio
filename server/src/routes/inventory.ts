// v1.5 仓库快速盘点 API
import { Router, Request, Response } from 'express';
import {
  createInventorySession, listInventorySessions, getInventorySession, setInventorySessionStatus,
  addInventoryProduct, listInventoryProducts, getInventoryProduct,
  saveInventoryModel, batchSaveInventoryModels, getInventorySummary, getInventoryDifferences,
  createStockFlag, listStockFlags, getPhoneModelGroups,
} from '../services/inventoryService';


const router = Router();

// ===== 批次 =====
router.post('/sessions', (req: Request, res: Response) => {
  try {
    const s = createInventorySession(req.body || {});
    res.json({ success: true, data: s, message: `盘点批次 ${s.session_code} 已创建` });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/sessions', (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    res.json({ success: true, data: listInventorySessions(status) });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/sessions/:id', (req: Request, res: Response) => {
  try {
    const s = getInventorySession(parseInt(req.params.id, 10));
    if (!s) return res.status(404).json({ success: false, error: '盘点批次不存在' });
    res.json({ success: true, data: s });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/sessions/:id/complete', (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: setInventorySessionStatus(parseInt(req.params.id, 10), 'completed'), message: '盘点已完成' });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/sessions/:id/cancel', (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: setInventorySessionStatus(parseInt(req.params.id, 10), 'cancelled'), message: '盘点已取消' });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// ===== 产品 =====
router.post('/sessions/:id/products', (req: Request, res: Response) => {
  try {
    const p = addInventoryProduct(parseInt(req.params.id, 10), req.body || {});
    res.json({ success: true, data: p, message: '产品已加入盘点' });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/sessions/:id/products', (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: listInventoryProducts(parseInt(req.params.id, 10)) });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const p = getInventoryProduct(parseInt(req.params.id, 10));
    if (!p) return res.status(404).json({ success: false, error: '盘点产品不存在' });
    // 型号目录（品牌分组）一并返回
    const groups = await getPhoneModelGroups();
    res.json({ success: true, data: { ...p, modelGroups: groups } });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/products/:id/refresh-snapshot', async (req: Request, res: Response) => {
  try {
    const { refreshInventorySnapshot } = require('../services/inventoryService');
    await refreshInventorySnapshot(parseInt(req.params.id, 10));
    res.json({ success: true, message: '网站库存快照已刷新' });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// ===== 型号 × 颜色 × 数量 =====
router.put('/products/:id/models/:model', (req: Request, res: Response) => {
  try {
    const saved = saveInventoryModel(parseInt(req.params.id, 10), { ...req.body, model: req.params.model });
    res.json({ success: true, data: saved, message: '已保存' });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/products/:id/batch', (req: Request, res: Response) => {
  try {
    const saved = batchSaveInventoryModels(parseInt(req.params.id, 10), req.body?.models || []);
    res.json({ success: true, data: saved, message: `已保存 ${saved.length} 个型号` });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// ===== 汇总 / 差异 =====
router.get('/products/:id/summary', (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: getInventorySummary(parseInt(req.params.id, 10)) });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/products/:id/differences', (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: getInventoryDifferences(parseInt(req.params.id, 10)) });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// ===== 缺货巡视 =====
router.post('/stock-flags', (req: Request, res: Response) => {
  try {
    const f = createStockFlag(req.body || {});
    res.json({ success: true, data: f, message: '缺货记录已保存' });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/stock-flags', (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: listStockFlags(req.query.productId ? parseInt(String(req.query.productId), 10) : undefined) });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

export { router as inventoryRouter };
