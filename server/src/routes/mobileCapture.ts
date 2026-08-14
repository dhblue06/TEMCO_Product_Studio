// Mobile Capture API 路由（文档 24）
import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getDatabase } from '../database/database';
import { authRouter, requireMobileAuth } from '../middleware/mobileAccessAuth';
import { mobileUpload, mobileAudioUpload } from '../middleware/mobileUpload';

import {
  createSession, listSessions, getSession, completeSession, cancelSession, deleteSession,
  createCapture, reopenCaptureInSession, listCaptures, getCaptureDetail,
  updateCaptureDraft, submitCapture, cancelCapture, reopenCapture,
  saveInventory, getInventory, approveInventory,
  startReview, approveCapture, rejectCapture, markReady,
  getReviewStats, getMobileCaptureDir, ensureDir, logMobileEvent, deleteCaptures,
  createMobileProduct,
} from '../services/mobileCapture/mobileCaptureService';
import {
  matchProduct, searchProductsByName, getProductCaptureStatus,
} from '../services/mobileCapture/mobileCaptureMatchingService';
import {
  uploadImage, setImageColors, updateImage, deleteImage,
  approveImage, rejectImage, getImageFilePath,
  uploadProcessedImage, listProcessedImages, getProcessedImageFilePath,
  deleteProcessedImage, updateProcessedImage,
} from '../services/mobileCapture/mobileCaptureImageService';
import {
  reviewImage, editImage, editImageColors, listPendingColors, mapColor,
} from '../services/mobileCapture/mobileCaptureReviewService';
import { pushCaptureToProductImages, promoteCaptureImagesToProductImages } from '../services/mobileCapture/mobileCapturePushService';
import { createVariantDraftsFromCapture, listVariantDrafts, updateVariantDraft } from '../services/mobileCapture/variantDraftService';
import { cleanupExpiredCaptureFiles } from '../services/mobileCapture/mobileCaptureCleanupService';
import { syncImagesByProductRef } from '../services/prestashop/imageSyncService';
import { fetchCombinations, fetchOptionValues, createCombination, updateCombination } from '../services/prestashop/combinationService';
import { syncProductFromWebsite, fetchWebsiteProductExtras, fetchProductsActiveMap } from '../services/mobileCapture/websiteProductSyncService';
import { getPhoneModelGroups, maybeSyncPhoneModelCatalog, saveCapturePhoneModels } from '../services/mobileCapture/phoneModelService';
import { normalizeColorName } from '../services/mobileCapture/types';

const router = Router();

// 认证（手机端 PIN 登录）
router.use('/auth', authRouter);

// 电脑端访问信息（文档 29/30：局域网 IP + PIN 状态 + 二维码内容）
router.get('/access-info', (req: Request, res: Response) => {
  try {
    const ifaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
      }
    }
    const db = getDatabase();
    const pin = (db.prepare('SELECT value FROM api_settings WHERE key = ?').get('mobile_capture_pin') as any)?.value || '';
    // 只返回是否配置了 PIN，不返回明文（明文仅通过设置页修改）
    res.json({ success: true, data: { ips, pinConfigured: !!pin } });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ==================== 手机端（需 Bearer token） ====================

// --- 会话（24.1） ---
router.post('/sessions', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    body.operatorName = (req as any).mobileOperator;
    body.deviceName = (req as any).mobileDevice;
    const session = createSession(body);
    res.json({ success: true, data: session, message: `会话 ${session.session_code} 已创建` });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/sessions', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || undefined;
    res.json({ success: true, data: listSessions(status) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/sessions/:id', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const session = getSession(parseInt(req.params.id, 10));
    if (!session) return res.status(404).json({ success: false, error: '会话不存在' });
    res.json({ success: true, data: session });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/sessions/:id/complete', requireMobileAuth, (req: Request, res: Response) => {
  try { completeSession(parseInt(req.params.id, 10)); res.json({ success: true, message: '会话已完成' }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/sessions/:id/cancel', requireMobileAuth, (req: Request, res: Response) => {
  try { cancelSession(parseInt(req.params.id, 10)); res.json({ success: true, message: '会话已取消' }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 手机端删除会话（级联删除其下所有任务，删除后不可恢复）
router.delete('/sessions/:id', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const r = deleteSession(parseInt(req.params.id, 10));
    res.json({ success: true, data: r, message: `已删除会话${r.deletedCaptures ? `（连带删除 ${r.deletedCaptures} 个任务${r.keptFiles ? `，保留 ${r.keptFiles} 个已被推送引用的文件` : ''}）` : ''}` });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// --- 产品搜索（24.2） ---
// 手机端新增产品（扫码/搜索无匹配时）
router.post('/products', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const product = createMobileProduct(req.body || {});
    res.json({ success: true, data: product, message: `产品 ${product.reference} 已新增` });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 手机壳点货：手机型号目录（按品牌分组，仅统计不同步网站）
router.get('/phone-models', requireMobileAuth, async (req: Request, res: Response) => {
  try {
    await maybeSyncPhoneModelCatalog(); // 节流同步网站分类（10 分钟内不重复拉取）
    const groups = getPhoneModelGroups();
    res.json({ success: true, data: groups });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 手机端手动刷新：强制与网站同步手机型号目录（新加分类立即生效）
router.post('/phone-models/sync', requireMobileAuth, async (req: Request, res: Response) => {
  try {
    const r = await maybeSyncPhoneModelCatalog(true);
    res.json({ success: true, data: r });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 保存任务勾选的手机型号（点货统计）
router.put('/captures/:id/phone-models', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const captureId = parseInt(req.params.id, 10);
    const models = Array.isArray(req.body?.models) ? req.body.models : [];
    saveCapturePhoneModels(captureId, models);
    res.json({ success: true, message: `已保存 ${models.length} 个手机型号` });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 标记产品已卖完（巡视发现断货时）
router.post('/products/:id/sold-out', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const soldOut = req.body?.soldOut ? 1 : 0;
    const db = getDatabase();
    const p = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if (!p) return res.status(404).json({ success: false, error: '产品不存在' });
    db.prepare(`UPDATE products SET sold_out = ?, sold_out_at = ? WHERE id = ?`)
      .run(soldOut, soldOut ? new Date().toISOString() : '', productId);
    res.json({ success: true, data: { id: productId, soldOut: !!soldOut }, message: soldOut ? '已标记为已卖完' : '已取消已卖完标记' });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 设置产品固定颜色（手机壳点货：选定型号时自动勾选这些颜色）
router.put('/products/:id/fixed-colors', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const colors = Array.isArray(req.body?.colors)
      ? (req.body.colors as any[]).filter(c => typeof c === 'string' && c.trim())
      : [];
    const db = getDatabase();
    const p = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if (!p) return res.status(404).json({ success: false, error: '产品不存在' });
    db.prepare('UPDATE products SET fixed_colors = ? WHERE id = ?').run(JSON.stringify(colors), productId);
    res.json({ success: true, data: { id: productId, colors } });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/products/search', requireMobileAuth, async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    const result = matchProduct(q);
    // 实时读写 PrestaShop 网站：无匹配 → 网站查询并同步到本地；有匹配 → 刷新网站最新价格等
    const shouldSync = result && !result.match && (!result.candidates || result.candidates.length === 0);
    const refreshMatch = result?.match && !result.candidates?.length;
    if ((shouldSync || refreshMatch) && q) {
      try {
        const synced = await syncProductFromWebsite(q);
        if (synced) {
          result.match = {
            productId: synced.id,
            reference: synced.reference || '',
            name: synced.name || '',
            model: synced.model || '',
            ean13: synced.ean13 || '',
            serialNumber: synced.serial_number || '',
            brand: synced.brand || '',
            category: synced.category || '',
            prestashopId: synced.prestashop_id || '',
            price: synced.price ?? null,
            soldOut: synced.sold_out ? true : false,
            matchMethod: shouldSync ? 'website_sync' : result.match!.matchMethod,
            matchedValue: q,
            confidence: shouldSync ? 1.0 : result.match!.confidence,
          };
          result.candidates = [];
          result.message = shouldSync ? '网站实时匹配（已同步到本地）' : `已实时刷新网站数据（€${synced.price ?? '-'}）`;
          // 实时读取网站图片数量 / 库存（stock_availables 真实库存）/ 变体
          const psId = Number(synced.prestashop_id || 0);
          if (psId) {
            const extras = await fetchWebsiteProductExtras(psId);
            if (extras) {
              result.match.website = {
                imageCount: extras.imageCount,
                quantity: extras.stockQuantity || Number(synced.quantity ?? 0),
                variants: extras.variants,
              };
            }
          }
        }
      } catch { /* 网站不可用时静默回退本地数据 */ }
    }
    // 候选列表：实时查询各产品在网站的启用状态（active）
    if (result.candidates?.length) {
      try {
        const psIds = result.candidates.map((c: any) => Number(c.prestashopId)).filter(Boolean);
        const activeMap = psIds.length ? await fetchProductsActiveMap(psIds) : {};
        result.candidates = result.candidates.map((c: any) => ({
          ...c,
          websiteActive: c.prestashopId ? (activeMap[Number(c.prestashopId)] ?? null) : null,
        }));
      } catch { /* 网站不可用时静默 */ }
    }
    res.json({ success: true, data: result });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/products/fuzzy', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    res.json({ success: true, data: searchProductsByName(q) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/products/by-ean/:ean', requireMobileAuth, (req: Request, res: Response) => {
  try { res.json({ success: true, data: matchProduct(req.params.ean) }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/products/by-serial/:serial', requireMobileAuth, (req: Request, res: Response) => {
  try { res.json({ success: true, data: matchProduct(req.params.serial) }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/products/by-reference/:reference', requireMobileAuth, (req: Request, res: Response) => {
  try { res.json({ success: true, data: matchProduct(req.params.reference) }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/products/by-model/:model', requireMobileAuth, (req: Request, res: Response) => {
  try { res.json({ success: true, data: matchProduct(req.params.model) }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/products/:id/capture-status', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const data = getProductCaptureStatus(parseInt(req.params.id, 10));
    if (!data) return res.status(404).json({ success: false, error: '产品不存在' });
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// --- 采集任务（24.3） ---
router.post('/captures', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const { sessionId, productId, prestashopProductId, serialNumber, reference, ean13, model, colors } = req.body || {};
    const result = createCapture({ sessionId, productId, prestashopProductId, serialNumber, reference, ean13, model, colors });
    if (result.existing) {
      return res.json({ success: false, error: 'duplicate', data: result.existing, message: '该产品已有未审核采集任务' });
    }
    res.json({ success: true, data: result.capture, message: '采集任务已创建' });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/captures', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string, 10) : undefined;
    const operator = req.query.operator ? String(req.query.operator) : undefined;
    const { captures } = listCaptures({ sessionId, operator, captureStatus: (req.query.captureStatus as string) || undefined });
    res.json({ success: true, data: captures });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/captures/:id', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const detail = getCaptureDetail(parseInt(req.params.id, 10));
    if (!detail) return res.status(404).json({ success: false, error: '采集任务不存在' });
    res.json({ success: true, data: detail });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.patch('/captures/:id', requireMobileAuth, (req: Request, res: Response) => {
  try {
    updateCaptureDraft(parseInt(req.params.id, 10), req.body || {});
    res.json({ success: true, message: '已保存草稿' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/captures/:id/submit', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const r = submitCapture(parseInt(req.params.id, 10));
    res.json({ success: r.success, message: r.message });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/captures/:id/cancel', requireMobileAuth, (req: Request, res: Response) => {
  try { cancelCapture(parseInt(req.params.id, 10)); res.json({ success: true, message: '已取消' }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/captures/:id/reopen', requireMobileAuth, (req: Request, res: Response) => {
  try {
    if (req.body?.sessionId) reopenCaptureInSession(parseInt(req.params.id, 10), parseInt(req.body.sessionId, 10));
    else reopenCapture(parseInt(req.params.id, 10));
    res.json({ success: true, message: '已重新打开' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 手机端删除任务（草稿/已提交/退回可删，删除后不可恢复；级联清理图片/库存/音频）
router.delete('/captures/:id', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const db = getDatabase();
    const cap = db.prepare('SELECT * FROM mobile_captures WHERE id = ?').get(id) as any;
    if (!cap) return res.status(404).json({ success: false, error: '任务不存在' });
    if (!['draft', 'submitted', 'rejected'].includes(cap.capture_status)) {
      return res.status(400).json({ success: false, error: '该任务已审核通过，请到电脑端审核处理（批量删除）' });
    }
    const r = deleteCaptures([id]);
    res.json({ success: true, data: r, message: `已删除采集任务${r.keptFiles ? `（保留 ${r.keptFiles} 个已被推送引用的文件）` : ''}` });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// --- 图片（24.4） ---
router.post('/captures/:id/images', requireMobileAuth, mobileUpload, async (req: Request, res: Response) => {
  try {
    const captureId = parseInt(req.params.id, 10);
    const { role, colors, sequence, isCoverCandidate } = req.body || {};
    const result = await uploadImage(captureId, {
      buffer: (req as any).file.buffer,
      originalName: (req as any).file.originalname || 'photo.jpg',
      mimeType: (req as any).file.mimetype || 'image/jpeg',
      role: role || 'other',
      colors: colors ? (Array.isArray(colors) ? colors : JSON.parse(colors)) : undefined,
      sequence: sequence ? parseInt(sequence, 10) : undefined,
      isCoverCandidate: isCoverCandidate === 'true' || isCoverCandidate === true,
    });
    res.json({ success: true, duplicate: result.duplicate, data: result.image, message: result.message });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/captures/:id/images', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const { listImages } = require('../services/mobileCapture/mobileCaptureImageService');
    res.json({ success: true, data: listImages(parseInt(req.params.id, 10)) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.patch('/images/:imageId', requireMobileAuth, (req: Request, res: Response) => {
  try {
    updateImage(parseInt(req.params.imageId, 10), req.body || {});
    res.json({ success: true, message: '已更新' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/images/:imageId', requireMobileAuth, (req: Request, res: Response) => {
  try { deleteImage(parseInt(req.params.imageId, 10)); res.json({ success: true, message: '已删除' }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/images/:imageId/colors', requireMobileAuth, (req: Request, res: Response) => {
  try {
    setImageColors(parseInt(req.params.imageId, 10), (req.body?.colors || []) as any[]);
    res.json({ success: true, message: '颜色已保存' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 手机端查看原图
router.get('/images/:imageId/file', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const p = getImageFilePath(parseInt(req.params.imageId, 10));
    if (!p) return res.status(404).json({ success: false, error: '图片不存在' });
    res.sendFile(p);
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// --- 库存（24.5） ---
router.put('/captures/:id/inventory', requireMobileAuth, (req: Request, res: Response) => {
  try {
    saveInventory(parseInt(req.params.id, 10), (req.body?.items || []) as any[]);
    res.json({ success: true, message: '库存已保存' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/captures/:id/inventory', requireMobileAuth, (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: getInventory(parseInt(req.params.id, 10)) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// --- 语音备注（24.6） ---
router.post('/captures/:id/audio-note', requireMobileAuth, mobileAudioUpload, (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const captureId = parseInt(req.params.id, 10);
    const capture = db.prepare('SELECT * FROM mobile_captures WHERE id = ?').get(captureId) as any;
    if (!capture) return res.status(404).json({ success: false, error: '采集任务不存在' });

    const file = (req as any).file;
    const ext = path.extname(file.originalname) || (file.mimetype === 'audio/mp4' ? '.m4a' : '.webm');
    const dir = path.join(getMobileCaptureDir(), 'notes', `cap-${captureId}`);
    ensureDir(dir);
    const filename = `note_${Date.now()}${ext}`;
    const localPath = path.join(dir, filename);
    fs.writeFileSync(localPath, file.buffer);

    const duration = Math.min(parseInt(req.body?.durationSeconds || '0', 10) || 0, 99999);
    db.prepare(`INSERT INTO mobile_capture_audio_notes (capture_id, local_path, mime_type, duration_seconds, created_at) VALUES (?, ?, ?, ?, datetime('now'))`)
      .run(captureId, localPath, file.mimetype, duration);
    res.json({ success: true, message: '语音备注已保存' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/captures/:id/audio-notes', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const notes = db.prepare('SELECT * FROM mobile_capture_audio_notes WHERE capture_id = ? ORDER BY id').all(parseInt(req.params.id, 10));
    res.json({ success: true, data: notes });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/audio-notes/:id', requireMobileAuth, (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const note = db.prepare('SELECT * FROM mobile_capture_audio_notes WHERE id = ?').get(parseInt(req.params.id, 10)) as any;
    if (note) {
      db.prepare('DELETE FROM mobile_capture_audio_notes WHERE id = ?').run(note.id);
      try { if (note.local_path && fs.existsSync(note.local_path)) fs.unlinkSync(note.local_path); } catch {}
    }
    res.json({ success: true, message: '已删除' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ==================== 电脑审核端（局域网可信，无需 token） ====================

// 顶部统计（15.1）
router.get('/stats', (req: Request, res: Response) => {
  try { res.json({ success: true, data: getReviewStats() }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 采集列表（15.3）
router.get('/review/captures', (req: Request, res: Response) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;
    const result = listCaptures({
      date: (req.query.date as string) || undefined,
      operator: (req.query.operator as string) || undefined,
      sessionId: req.query.sessionId ? parseInt(req.query.sessionId as string, 10) : undefined,
      search: (req.query.search as string) || undefined,
      captureStatus: (req.query.captureStatus as string) || undefined,
      syncStatus: (req.query.syncStatus as string) || undefined,
      page, pageSize,
    });
    res.json({ success: true, data: result });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 审核端修改采集任务（颜色/备注等，无需手机 token）
router.patch('/review/captures/:id', (req: Request, res: Response) => {
  try {
    updateCaptureDraft(parseInt(req.params.id, 10), req.body || {});
    res.json({ success: true, message: '已保存' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 采集详情（16 节）
router.get('/review/captures/:id', (req: Request, res: Response) => {
  try {
    const detail = getCaptureDetail(parseInt(req.params.id, 10));
    if (!detail) return res.status(404).json({ success: false, error: '采集任务不存在' });
    res.json({ success: true, data: detail });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 批量删除采集任务
router.post('/review/captures/batch-delete', (req: Request, res: Response) => {
  try {
    const ids = (req.body?.ids || []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return res.status(400).json({ success: false, error: '请选择要删除的任务' });
    const r = deleteCaptures(ids);
    res.json({ success: true, data: r, message: `已删除 ${r.deleted} 个采集任务${r.keptFiles ? `（保留 ${r.keptFiles} 个已被推送引用的文件）` : ''}` });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 审核端补传原图（手机相册导出到电脑后直接补回任务；复用原图上传逻辑）
router.post('/review/captures/:id/images/reupload', mobileUpload, async (req: Request, res: Response) => {
  try {
    const captureId = parseInt(req.params.id, 10);
    const { role, colors, isCoverCandidate } = req.body || {};
    const result = await uploadImage(captureId, {
      buffer: (req as any).file.buffer,
      originalName: (req as any).file.originalname || 'reupload.jpg',
      mimeType: (req as any).file.mimetype || 'image/jpeg',
      role: role || 'other',
      colors: colors ? (Array.isArray(colors) ? colors : JSON.parse(colors)) : undefined,
      isCoverCandidate: isCoverCandidate === 'true' || isCoverCandidate === true,
    });
    res.json({ success: true, duplicate: result.duplicate, data: result.image, message: result.message });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 审核端查看原图
router.get('/review/images/:imageId/file', (req: Request, res: Response) => {
  try {
    const p = getImageFilePath(parseInt(req.params.imageId, 10));
    if (!p) return res.status(404).json({ success: false, error: '图片不存在' });
    if (req.query.download) {
      // 下载到本地（供 AI 精修），带原始文件名
      res.download(p, String(req.query.download));
      return;
    }
    res.sendFile(p);
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// === 处理后照片（AI 精修电商图，文档 17） ===

// 上传处理图（multer 单张 image；sourceImageId/role/isCover 为 multipart 字段）
router.post('/review/captures/:id/processed-images', mobileUpload, async (req: Request, res: Response) => {
  try {
    const captureId = parseInt(req.params.id, 10);
    const { sourceImageId, role, isCover } = req.body || {};
    const result = await uploadProcessedImage(captureId, {
      buffer: (req as any).file.buffer,
      originalName: (req as any).file.originalname || 'processed.jpg',
      mimeType: (req as any).file.mimetype || 'image/jpeg',
      sourceImageId: sourceImageId ? parseInt(sourceImageId, 10) : undefined,
      role: role || 'other',
      isCover: isCover === 'true' || isCover === true,
    });
    res.json({ success: true, duplicate: result.duplicate, data: result.image, message: result.message });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/review/captures/:id/processed-images', (req: Request, res: Response) => {
  try { res.json({ success: true, data: listProcessedImages(parseInt(req.params.id, 10)) }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 查看处理图
router.get('/review/processed-images/:imageId/file', (req: Request, res: Response) => {
  try {
    const p = getProcessedImageFilePath(parseInt(req.params.imageId, 10));
    if (!p) return res.status(404).json({ success: false, error: '处理图不存在' });
    res.sendFile(p);
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 修改处理图（role / 主图 / 关联原图 / 状态）
router.patch('/review/processed-images/:imageId', (req: Request, res: Response) => {
  try {
    updateProcessedImage(parseInt(req.params.imageId, 10), req.body || {});
    res.json({ success: true, message: '已更新' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 删除处理图
router.delete('/review/processed-images/:imageId', (req: Request, res: Response) => {
  try { deleteProcessedImage(parseInt(req.params.imageId, 10)); res.json({ success: true, message: '已删除' }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 审核操作（24.7）
router.post('/review/captures/:id/start-review', (req: Request, res: Response) => {
  try { startReview(parseInt(req.params.id, 10)); res.json({ success: true, message: '已开始审核' }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/review/captures/:id/approve', (req: Request, res: Response) => {
  try { approveCapture(parseInt(req.params.id, 10)); res.json({ success: true, message: '审核通过' }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/review/captures/:id/reject', (req: Request, res: Response) => {
  try { rejectCapture(parseInt(req.params.id, 10), req.body?.reason || ''); res.json({ success: true, message: '已退回补采' }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/review/captures/:id/mark-ready', (req: Request, res: Response) => {
  try { markReady(parseInt(req.params.id, 10)); res.json({ success: true, message: '已标记可同步' }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 一键：把采集任务标注的颜色+库存同步为网站变体
router.post('/review/captures/:id/sync-variants-to-website', async (req: Request, res: Response) => {
  try {
    const captureId = parseInt(req.params.id, 10);
    const detail = getCaptureDetail(captureId);
    if (!detail) return res.status(404).json({ success: false, error: '采集任务不存在' });
    const psId = Number(detail.prestashop_product_id || detail.prestashop_id || 0);
    if (!psId) return res.status(400).json({ success: false, error: '产品未绑定 PrestaShop ID，无法同步变体' });

    // 采集的颜色：任务 colors + 库存记录颜色
    let captureColors: string[] = [];
    try { const v = JSON.parse(detail.colors || ''); if (Array.isArray(v)) captureColors = v; } catch {}
    for (const inv of (detail.inventory || [])) {
      if (inv.color_name && !captureColors.includes(inv.color_name)) captureColors.push(inv.color_name);
    }
    if (captureColors.length === 0) {
      return res.status(400).json({ success: false, error: '该采集任务没有标注颜色（请在手机端勾选颜色或审核端修改颜色）' });
    }

    const [ov, combos] = await Promise.all([fetchOptionValues(), fetchCombinations(psId)]);
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

    let created = 0, updated = 0;
    const skipped: string[] = [];
    for (const color of captureColors) {
      const colorNorm = norm(color);
      const attr = ov.find(v => norm(v.name) === colorNorm);
      if (!attr) { skipped.push(`${color}（网站无此颜色属性值）`); continue; }
      const inv = (detail.inventory || []).find((i: any) => norm(i.color_name) === colorNorm);
      const qty = inv && (inv.count_type === 'exact' || inv.count_type === 'estimated') ? inv.quantity : null;
      const existing = combos.find(cm => cm.attributeValueIds.includes(attr.id));
      if (existing) {
        if (qty !== null && qty !== undefined) {
          await updateCombination(existing.id, { quantity: qty }, psId);
        }
        updated++;
      } else {
        await createCombination(psId, { attributeValueIds: [attr.id], reference: detail.reference, quantity: qty });
        created++;
      }
    }
    res.json({
      success: true,
      data: { created, updated, skipped },
      message: `变体同步完成：新建 ${created} 个，更新库存 ${updated} 个${skipped.length ? `，跳过 ${skipped.join('、')}` : ''}`,
    });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 推送现有产品图片模块（18 节）
router.post('/review/captures/:id/push-to-product-images', (req: Request, res: Response) => {
  try {
    const r = pushCaptureToProductImages(parseInt(req.params.id, 10));
    res.json({ success: true, data: r, message: r.message });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 提升为产品图片（仅本地，写 product_images；不上传网站）
router.post('/review/captures/:id/promote-images', (req: Request, res: Response) => {
  try {
    const r = promoteCaptureImagesToProductImages(parseInt(req.params.id, 10));
    res.json({ success: true, data: r, message: `已提升 ${r.promoted} 张为产品图片（跳过 ${r.skipped}）` });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 一键：同步产品图片到网站
router.post('/review/captures/:id/sync-images-to-website', async (req: Request, res: Response) => {
  try {
    const captureId = parseInt(req.params.id, 10);
    const detail = getCaptureDetail(captureId);
    if (!detail) return res.status(404).json({ success: false, error: '采集任务不存在' });
    if (!detail.prestashop_product_id && !detail.prestashop_id) {
      return res.status(400).json({ success: false, error: '产品未绑定 PrestaShop ID，无法同步图片' });
    }
    // 1) 有「处理后照片」时提升为产品槽位图（补齐）；没有则跳过（用户可能已直接传到产品图片槽位）
    let promotedMsg = '';
    try {
      const promoted = promoteCaptureImagesToProductImages(captureId);
      promotedMsg = `已提升 ${promoted.promoted} 张处理后照片；`;
    } catch (e: any) {
      promotedMsg = ''; // 无处理后照片 → 不阻塞，直接上传现有产品图片
    }
    // 2) 上传产品槽位图（product_images）到网站
    const syncRes = await syncImagesByProductRef(detail.reference, 'append');
    const total = syncRes.total ?? 0;
    if (total === 0 && !promotedMsg) {
      return res.status(400).json({
        success: false,
        error: '没有可同步的图片：既没有「处理后照片」，产品图片槽位也为空。请在「处理后照片」区上传精修图，或在产品属性编辑的图片槽位上图。',
      });
    }
    res.json({
      success: true,
      data: { promoted: promotedMsg || '', sync: syncRes },
      message: `${promotedMsg}已上传网站：成功 ${syncRes.successCount ?? 0} 张${(syncRes.failedCount ?? 0) > 0 ? `，失败 ${syncRes.failedCount}` : ''}${syncRes.error ? `（${syncRes.error}）` : ''}`,
    });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 生成变体草稿（19 节基础版）
router.post('/review/captures/:id/create-variant-drafts', (req: Request, res: Response) => {
  try {
    const r = createVariantDraftsFromCapture(parseInt(req.params.id, 10));
    res.json({ success: true, data: r, message: `已生成 ${r.created} 条变体草稿` });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 图片审核（16.2）
router.post('/review/images/:imageId/approve', (req: Request, res: Response) => {
  try { reviewImage(parseInt(req.params.imageId, 10), 'approve'); res.json({ success: true, message: '图片已通过' }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/review/images/:imageId/reject', (req: Request, res: Response) => {
  try { reviewImage(parseInt(req.params.imageId, 10), 'reject', req.body?.reason || ''); res.json({ success: true, message: '图片已拒绝' }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.patch('/review/images/:imageId', (req: Request, res: Response) => {
  try {
    editImage(parseInt(req.params.imageId, 10), req.body || {});
    res.json({ success: true, message: '已更新' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/review/images/:imageId/colors', (req: Request, res: Response) => {
  try {
    editImageColors(parseInt(req.params.imageId, 10), (req.body?.colors || []) as any[]);
    res.json({ success: true, message: '颜色已更新' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 库存审核（16.4）
router.post('/review/captures/:id/inventory/approve', (req: Request, res: Response) => {
  try {
    approveInventory(parseInt(req.params.id, 10), (req.body?.items || []) as any[]);
    res.json({ success: true, message: '库存已审核' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 待确认颜色（16.3）
router.get('/review/colors', (req: Request, res: Response) => {
  try { res.json({ success: true, data: listPendingColors() }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/review/colors/:colorId/map', (req: Request, res: Response) => {
  try {
    mapColor(parseInt(req.params.colorId, 10), req.body?.status || 'ignored', req.body?.prestashopAttributeId);
    res.json({ success: true, message: '颜色映射已保存' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 变体草稿（24.8 基础）
router.get('/variant-drafts', (req: Request, res: Response) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;
    const r = listVariantDrafts({ status: (req.query.status as string) || undefined, captureId: req.query.captureId ? parseInt(req.query.captureId as string, 10) : undefined, page, pageSize });
    res.json({ success: true, data: r });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.patch('/variant-drafts/:id', (req: Request, res: Response) => {
  try {
    updateVariantDraft(parseInt(req.params.id, 10), req.body || {});
    res.json({ success: true, message: '草稿已更新' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 清理（34 节）
router.post('/cleanup', (req: Request, res: Response) => {
  try {
    const r = cleanupExpiredCaptureFiles();
    res.json({ success: true, data: r, message: r.message });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;
