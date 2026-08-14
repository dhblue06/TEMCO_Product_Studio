// 手机采集会话与任务服务（文档 8 / 11 / 13 / 14 / 15）
import path from 'path';
import fs from 'fs';
import { getDatabase } from '../../database/database';
import { CreateSessionInput, CreateCaptureInput, InventoryItemInput, normalizeColorName, MobileCapture, MobileCaptureInventory } from './types';

function getSetting(key: string): string {
  return (getDatabase().prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any)?.value || '';
}

export function getMobileCaptureDir(): string {
  const custom = getSetting('mobile_capture_dir');
  return custom || path.join(__dirname, '../../../data/mobile-captures');
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** 生成会话编号 CAP-YYYYMMDD-XXX */
export function generateSessionCode(): string {
  const db = getDatabase();
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const prefix = `CAP-${ymd}-`;
  const row = db.prepare(`SELECT COUNT(*) as c FROM mobile_capture_sessions WHERE session_code LIKE ?`).get(`${prefix}%`) as any;
  const seq = String((row?.c || 0) + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

// === 会话 ===

export function createSession(input: CreateSessionInput): any {
  const db = getDatabase();
  const operatorName = (input.operatorName || '').trim();
  const deviceName = (input.deviceName || '').trim();
  if (!operatorName || !deviceName) {
    throw new Error('操作员和设备名称不能为空');
  }
  const code = generateSessionCode();
  const info = db.prepare(`
    INSERT INTO mobile_capture_sessions (session_code, operator_name, device_name, area_code, status, notes, created_at)
    VALUES (?, ?, ?, ?, 'active', ?, datetime('now'))
  `).run(code, operatorName, deviceName, input.areaCode || '', input.notes || '');
  const session = db.prepare('SELECT * FROM mobile_capture_sessions WHERE id = ?').get(info.lastInsertRowid);
  logMobileEvent('mobile_session_created', null, null, operatorName, deviceName, `session_id=${info.lastInsertRowid}`);
  return session as any;
}

export function listSessions(status?: string): any[] {
  const db = getDatabase();
  const where = status ? 'WHERE status = ?' : '';
  return db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM mobile_captures c WHERE c.session_id = s.id) as capture_count
    FROM mobile_capture_sessions s ${where}
    ORDER BY s.id DESC LIMIT 100
  `).all(...(status ? [status] : []));
}

export function getSession(id: number): any {
  const db = getDatabase();
  const session = db.prepare('SELECT * FROM mobile_capture_sessions WHERE id = ?').get(id);
  if (!session) return null;
  const captures = db.prepare(`
    SELECT c.*, p.name as product_name, p.brand, p.category,
      (SELECT COUNT(*) FROM mobile_capture_images i WHERE i.capture_id = c.id) as image_count
    FROM mobile_captures c JOIN products p ON c.product_id = p.id
    WHERE c.session_id = ? ORDER BY c.id
  `).all(id);
  return { ...session, captures };
}

export function completeSession(id: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE mobile_capture_sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).run(id);
}

export function cancelSession(id: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE mobile_capture_sessions SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?`).run(id);
}

/** 删除会话：级联删除其下所有采集任务（照片/库存/点货一并清理），删除后不可恢复 */
export function deleteSession(id: number): { deletedCaptures: number; keptFiles: number } {
  const db = getDatabase();
  const session = db.prepare('SELECT * FROM mobile_capture_sessions WHERE id = ?').get(id) as any;
  if (!session) throw new Error('会话不存在');
  const captureIds = (db.prepare('SELECT id FROM mobile_captures WHERE session_id = ?').all(id) as any[]).map(r => r.id);
  let keptFiles = 0;
  if (captureIds.length > 0) {
    keptFiles = deleteCaptures(captureIds).keptFiles;
  }
  db.prepare('DELETE FROM mobile_capture_sessions WHERE id = ?').run(id);
  logMobileEvent('mobile_session_deleted', null, null, session.operator_name, session.device_name, `session_id=${id}, captures=${captureIds.length}`);
  return { deletedCaptures: captureIds.length, keptFiles };
}

// === 采集任务 ===

/** 创建采集任务；若产品已有未完成采集任务则返回冲突提示（8.5） */
export function createCapture(input: CreateCaptureInput): { capture: any; existing: any | null } {
  const db = getDatabase();
  const session = db.prepare('SELECT * FROM mobile_capture_sessions WHERE id = ? AND status = ?').get(input.sessionId, 'active') as any;
  if (!session) throw new Error('采集会话不存在或未激活');

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(input.productId) as any;
  if (!product) throw new Error('产品不存在');

  // 防止重复采集（8.5）
  const existing = db.prepare(`
    SELECT id, capture_status, created_at,
      (SELECT COUNT(*) FROM mobile_capture_images i WHERE i.capture_id = c.id) as image_count,
      (SELECT GROUP_CONCAT(ic.color_name) FROM mobile_capture_image_colors ic
        JOIN mobile_capture_images mi ON mi.id = ic.capture_image_id WHERE mi.capture_id = c.id) as colors
    FROM mobile_captures c
    WHERE c.product_id = ? AND c.capture_status IN ('draft','submitted','reviewing','processing','ready')
    ORDER BY c.id DESC LIMIT 1
  `).get(input.productId) as any;
  if (existing) {
    return { capture: null, existing };
  }

  const info = db.prepare(`
    INSERT INTO mobile_captures (session_id, product_id, prestashop_product_id, serial_number, reference, ean13, model, colors,
      capture_status, review_status, processing_status, sync_status, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'pending', 'none', 'none', '', datetime('now'))
  `).run(
    input.sessionId,
    input.productId,
    input.prestashopProductId || (product.prestashop_id ? parseInt(product.prestashop_id, 10) || 0 : 0),
    input.serialNumber || product.serial_number || '',
    input.reference || product.reference || '',
    input.ean13 || product.ean13 || '',
    input.model || product.model || '',
    input.colors && input.colors.length ? JSON.stringify(input.colors) : '',
  );

  const capture = db.prepare('SELECT * FROM mobile_captures WHERE id = ?').get(info.lastInsertRowid);
  logMobileEvent('mobile_capture_created', Number(info.lastInsertRowid), input.productId, session.operator_name, session.device_name, '');
  return { capture, existing: null };
}

/** 继续原任务：切换 session（8.5 选项） */
export function reopenCaptureInSession(captureId: number, sessionId: number): void {
  const db = getDatabase();
  const session = db.prepare('SELECT id FROM mobile_capture_sessions WHERE id = ? AND status = ?').get(sessionId, 'active') as any;
  if (!session) throw new Error('目标会话不存在或未激活');
  db.prepare(`UPDATE mobile_captures SET session_id = ?, capture_status = 'draft', review_status = 'pending' WHERE id = ?`).run(sessionId, captureId);
}

export function listCaptures(filters: {
  date?: string; operator?: string; sessionId?: number; search?: string;
  captureStatus?: string; syncStatus?: string; page?: number; pageSize?: number;
}): { captures: any[]; pagination: any } {
  const db = getDatabase();
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 20));
  const where: string[] = ['1=1'];
  const params: any[] = [];

  if (filters.date) { where.push('date(c.created_at) = ?'); params.push(filters.date); }
  if (filters.operator) {
    // 不区分大小写 + 去空格：登录填写的操作员名可能与建会话时大小写/空格不一致
    where.push('LOWER(TRIM(s.operator_name)) = LOWER(TRIM(?))');
    params.push(filters.operator);
  }
  if (filters.sessionId) { where.push('c.session_id = ?'); params.push(filters.sessionId); }
  if (filters.captureStatus) {
    // 支持逗号分隔多状态：如 "draft,submitted,rejected" → IN (...)
    const statuses = filters.captureStatus.split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      where.push('c.capture_status = ?'); params.push(statuses[0]);
    } else if (statuses.length > 1) {
      where.push(`c.capture_status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }
  if (filters.syncStatus) { where.push('c.sync_status = ?'); params.push(filters.syncStatus); }
  if (filters.search) {
    where.push('(p.name LIKE ? OR p.reference LIKE ? OR p.serial_number LIKE ?)');
    const like = `%${filters.search}%`;
    params.push(like, like, like);
  }

  const whereSQL = where.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) as c FROM mobile_captures c JOIN products p ON c.product_id = p.id JOIN mobile_capture_sessions s ON c.session_id = s.id WHERE ${whereSQL}`).get(...params) as any)?.c || 0;

  const captures = db.prepare(`
    SELECT c.*, p.name as product_name, p.brand, p.category,
      s.session_code, s.operator_name, s.device_name,
      (SELECT COUNT(*) FROM mobile_capture_images i WHERE i.capture_id = c.id) as image_count,
      (SELECT COUNT(*) FROM mobile_capture_images i WHERE i.capture_id = c.id AND i.status = 'approved') as approved_image_count,
      (SELECT GROUP_CONCAT(DISTINCT ic.color_name) FROM mobile_capture_image_colors ic
        JOIN mobile_capture_images mi ON mi.id = ic.capture_image_id WHERE mi.capture_id = c.id) as colors,
      (SELECT COUNT(*) FROM mobile_capture_inventory inv WHERE inv.capture_id = c.id) as inventory_count,
      (CASE WHEN c.notes IS NOT NULL AND c.notes != '' THEN 1 ELSE 0 END) as has_notes,
      (SELECT i.id FROM mobile_capture_images i WHERE i.capture_id = c.id ORDER BY i.sequence, i.id LIMIT 1) as thumbnail_image_id,
      (SELECT COUNT(*) FROM mobile_capture_processed_images pi WHERE pi.capture_id = c.id) as processed_image_count,
      p.sold_out as product_sold_out, p.sold_out_at as product_sold_out_at
    FROM mobile_captures c
    JOIN products p ON c.product_id = p.id
    JOIN mobile_capture_sessions s ON c.session_id = s.id
    WHERE ${whereSQL}
    ORDER BY c.id DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize);

  return { captures, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export function getCaptureDetail(captureId: number): any | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT c.*, p.name as product_name, p.brand, p.category, p.model as product_model,
      p.price, p.quantity as product_quantity, p.prestashop_id, p.sold_out as product_sold_out, p.sold_out_at as product_sold_out_at,
      p.fixed_colors as product_fixed_colors,
      s.session_code, s.operator_name, s.device_name, s.area_code
    FROM mobile_captures c
    JOIN products p ON c.product_id = p.id
    JOIN mobile_capture_sessions s ON c.session_id = s.id
    WHERE c.id = ?
  `).get(captureId) as any;
  if (!row) return null;

  const images = db.prepare(`
    SELECT i.*, (SELECT GROUP_CONCAT(ic.color_name) FROM mobile_capture_image_colors ic WHERE ic.capture_image_id = i.id) as color_names
    FROM mobile_capture_images i WHERE i.capture_id = ? ORDER BY i.sequence, i.id
  `).all(captureId) as any[];
  // 标记文件是否实际存在（文件缺失时前端显示占位而非破图）
  for (const img of images) {
    img.fileExists = img.local_path ? fs.existsSync(img.local_path) : false;
  }
  const processedImages = db.prepare(`
    SELECT pi.*, si.filename as source_filename
    FROM mobile_capture_processed_images pi
    LEFT JOIN mobile_capture_images si ON pi.source_image_id = si.id
    WHERE pi.capture_id = ? ORDER BY pi.id DESC
  `).all(captureId);
  const inventory = db.prepare('SELECT * FROM mobile_capture_inventory WHERE capture_id = ? ORDER BY id').all(captureId);
  const audioNotes = db.prepare('SELECT * FROM mobile_capture_audio_notes WHERE capture_id = ? ORDER BY id').all(captureId);

  // 网站当前图片数
  const websiteImageCount = (db.prepare('SELECT COUNT(*) as c FROM product_images WHERE product_id = ?').get(row.product_id) as any)?.c || 0;
  // 上次采集（其他任务）
  const previousCaptures = db.prepare(`SELECT id, capture_status, created_at, sync_status FROM mobile_captures WHERE product_id = ? AND id != ? ORDER BY id DESC LIMIT 5`).all(row.product_id, captureId);

  return {
    ...row,
    images,
    processedImages,
    inventory,
    audioNotes,
    websiteImageCount,
    previousCaptures,
  };
}

export function updateCaptureDraft(captureId: number, data: { notes?: string; model?: string; reference?: string; colors?: string[] }): void {
  const db = getDatabase();
  const sets: string[] = [];
  const params: any[] = [];
  if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes); }
  if (data.model !== undefined) { sets.push('model = ?'); params.push(data.model); }
  if (data.reference !== undefined) { sets.push('reference = ?'); params.push(data.reference); }
  if (data.colors !== undefined) { sets.push('colors = ?'); params.push(JSON.stringify(data.colors)); }
  if (sets.length === 0) return;
  params.push(captureId);
  db.prepare(`UPDATE mobile_captures SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

/** 提交采集任务（文档 14：至少一张照片；仅草稿可提交） */
export function submitCapture(captureId: number): { success: boolean; message: string } {
  const db = getDatabase();
  const capture = db.prepare('SELECT * FROM mobile_captures WHERE id = ?').get(captureId) as any;
  if (!capture) throw new Error('采集任务不存在');
  if (capture.capture_status !== 'draft') {
    return { success: false, message: `该任务当前状态为「${capture.capture_status}」，无法提交` };
  }

  const imageCount = (db.prepare('SELECT COUNT(*) as c FROM mobile_capture_images WHERE capture_id = ?').get(captureId) as any)?.c || 0;
  if (getSetting('mobile_capture_require_photo') !== 'false' && imageCount === 0) {
    return { success: false, message: '至少需要一张照片才能提交' };
  }

  // 图片状态：uploaded → pending_review
  db.prepare(`UPDATE mobile_capture_images SET status = 'pending_review' WHERE capture_id = ? AND status = 'uploaded'`).run(captureId);
  db.prepare(`UPDATE mobile_captures SET capture_status = 'submitted', submitted_at = datetime('now'), review_status = 'pending' WHERE id = ?`).run(captureId);

  const session = db.prepare('SELECT * FROM mobile_capture_sessions WHERE id = ?').get(capture.session_id) as any;
  logMobileEvent('mobile_capture_submitted', captureId, capture.product_id, session?.operator_name, session?.device_name, `images=${imageCount}`);
  return { success: true, message: '已提交' };
}

export function cancelCapture(captureId: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE mobile_captures SET capture_status = 'cancelled', review_status = 'pending' WHERE id = ?`).run(captureId);
}

export function reopenCapture(captureId: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE mobile_captures SET capture_status = 'draft', review_status = 'pending', sync_status = 'none' WHERE id = ?`).run(captureId);
}

// === 库存（文档 11） ===

export function saveInventory(captureId: number, items: InventoryItemInput[]): void {
  const db = getDatabase();
  const capture = db.prepare('SELECT * FROM mobile_captures WHERE id = ?').get(captureId) as any;
  if (!capture) throw new Error('采集任务不存在');

  const del = db.prepare('DELETE FROM mobile_capture_inventory WHERE capture_id = ?');
  const ins = db.prepare(`
    INSERT INTO mobile_capture_inventory (capture_id, color_name, normalized_color, quantity, count_type, notes, review_status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);

  const tx = db.transaction(() => {
    del.run(captureId);
    for (const item of items || []) {
      const colorName = (item.colorName || 'Sin variante de color').trim();
      const qty = item.countType === 'exact' || item.countType === 'estimated' ? (item.quantity ?? null) : null;
      ins.run(captureId, colorName, normalizeColorName(colorName), qty, item.countType, item.notes || '');
    }
  });
  tx();
}

export function getInventory(captureId: number): MobileCaptureInventory[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM mobile_capture_inventory WHERE capture_id = ? ORDER BY id').all(captureId) as MobileCaptureInventory[];
}

export function approveInventory(captureId: number, items: { id: number; reviewedQuantity: number | null; reviewStatus: 'approved' | 'rejected' }[]): void {
  const db = getDatabase();
  const upd = db.prepare(`UPDATE mobile_capture_inventory SET reviewed_quantity = ?, review_status = ?, notes = notes WHERE id = ? AND capture_id = ?`);
  const tx = db.transaction(() => {
    for (const it of items) upd.run(it.reviewedQuantity, it.reviewStatus, it.id, captureId);
  });
  tx();
}

// === 状态流转（审核端，15 节） ===

export function startReview(captureId: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE mobile_captures SET capture_status = 'reviewing' WHERE id = ? AND capture_status = 'submitted'`).run(captureId);
}

export function approveCapture(captureId: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE mobile_captures SET capture_status = 'approved', review_status = 'approved', reviewed_at = datetime('now') WHERE id = ?`).run(captureId);
  const capture = db.prepare('SELECT * FROM mobile_captures WHERE id = ?').get(captureId) as any;
  const session = capture ? db.prepare('SELECT * FROM mobile_capture_sessions WHERE id = ?').get(capture.session_id) as any : null;
  logMobileEvent('mobile_capture_reviewed', captureId, capture?.product_id, session?.operator_name, session?.device_name, 'approved');
}

export function rejectCapture(captureId: number, reason: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE mobile_captures SET capture_status = 'rejected', review_status = 'rejected', reviewed_at = datetime('now'), notes = CASE WHEN ? = '' THEN notes ELSE notes || char(10) || '[退回] ' || ? END WHERE id = ?`).run(reason, reason, captureId);
  const capture = db.prepare('SELECT * FROM mobile_captures WHERE id = ?').get(captureId) as any;
  const session = capture ? db.prepare('SELECT * FROM mobile_capture_sessions WHERE id = ?').get(capture.session_id) as any : null;
  logMobileEvent('mobile_capture_rejected', captureId, capture?.product_id, session?.operator_name, session?.device_name, reason);
}

export function markReady(captureId: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE mobile_captures SET capture_status = 'ready', sync_status = 'ready' WHERE id = ? AND capture_status = 'approved'`).run(captureId);
}

/** 批量删除采集任务（含级联子表）。图片文件仅在未被 product_scan_images 引用时删除（避免破坏已推送的上传批次） */
export function deleteCaptures(ids: number[]): { deleted: number; keptFiles: number } {
  const db = getDatabase();
  let keptFiles = 0;
  const dir = getMobileCaptureDir();

  const tx = db.transaction(() => {
    for (const id of ids) {
      const capture = db.prepare('SELECT * FROM mobile_captures WHERE id = ?').get(id) as any;
      if (!capture) continue;

      const paths: string[] = [];
      for (const t of ['mobile_capture_images', 'mobile_capture_processed_images']) {
        const rows = db.prepare(`SELECT local_path FROM ${t} WHERE capture_id = ?`).all(id) as any[];
        for (const r of rows) if (r.local_path) paths.push(r.local_path);
      }
      const audio = db.prepare('SELECT local_path FROM mobile_capture_audio_notes WHERE capture_id = ?').all(id) as any[];
      for (const r of audio) if (r.local_path) paths.push(r.local_path);

      for (const p of paths) {
        // 安全限制：只删 mobile-captures 目录内的文件；已被推送引用的保留
        if (!p.startsWith(dir)) continue;
        const ref = db.prepare('SELECT 1 FROM product_scan_images WHERE local_path = ?').get(p);
        if (ref) { keptFiles++; continue; }
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
      }

      db.prepare('DELETE FROM mobile_captures WHERE id = ?').run(id); // 级联删 images/colors/inventory/audio/drafts
      logMobileEvent('mobile_capture_deleted', id, capture.product_id, '', '', '');
    }
  });
  tx();
  return { deleted: ids.length, keptFiles };
}

// === 审核端统计（15.1） ===

export function getReviewStats() {
  const db = getDatabase();
  const one = (sql: string) => (db.prepare(sql).get() as any)?.c || 0;
  return {
    todayCaptures: one(`SELECT COUNT(*) as c FROM mobile_captures WHERE date(created_at) = date('now')`),
    pendingReview: one(`SELECT COUNT(*) as c FROM mobile_captures WHERE capture_status = 'submitted'`),
    pendingRephotograph: one(`SELECT COUNT(*) as c FROM mobile_captures WHERE capture_status = 'rejected'`),
    pendingImages: one(`SELECT COUNT(*) as c FROM mobile_capture_images WHERE status = 'pending_review'`),
    pendingColors: one(`SELECT COUNT(*) as c FROM mobile_capture_image_colors WHERE mapping_status = 'pending'`),
    pendingInventory: one(`SELECT COUNT(*) as c FROM mobile_capture_inventory WHERE review_status = 'pending'`),
    pendingDrafts: one(`SELECT COUNT(*) as c FROM variant_drafts WHERE status = 'draft'`),
    readyToSync: one(`SELECT COUNT(*) as c FROM mobile_captures WHERE capture_status = 'ready'`),
    synced: one(`SELECT COUNT(*) as c FROM mobile_captures WHERE sync_status = 'synced'`),
    approved: one(`SELECT COUNT(*) as c FROM mobile_captures WHERE capture_status = 'approved'`),
  };
}

// === 新增产品（手机端扫码/搜索无匹配时直接新增） ===

export function createMobileProduct(input: {
  name?: string; serialNumber?: string; ean13?: string; model?: string;
  reference?: string; price?: number | null; brand?: string; category?: string; quantity?: number | null;
}): any {
  const db = getDatabase();
  const name = (input.name || '').trim();
  if (!name) throw new Error('产品名称不能为空');

  let ref = (input.reference || '').trim()
    || (input.serialNumber || '').trim()
    || (input.ean13 || '').trim()
    || `MOB-${Date.now().toString().slice(-8)}`;
  // Reference 唯一性：冲突时加后缀
  while (db.prepare('SELECT id FROM products WHERE reference = ?').get(ref)) {
    ref = `${ref}-${Date.now().toString().slice(-4)}`;
  }

  db.prepare(`
    INSERT INTO products (reference, name, serial_number, ean13, model, price, brand, category, quantity, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '待处理', datetime('now'), datetime('now'))
  `).run(ref, name, input.serialNumber || '', input.ean13 || '', input.model || '',
    input.price ?? 0, input.brand || '', input.category || '', input.quantity ?? 0);

  return db.prepare('SELECT * FROM products WHERE reference = ?').get(ref);
}

// === 日志（32 节） ===

export function logMobileEvent(
  type: string,
  captureId: number | null,
  productId: number | null,
  operatorName: string,
  deviceName: string,
  detail: string
): void {
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO api_logs (provider, type, model, reference, status, error, created_at)
      VALUES ('mobile', 'mobile_capture', ?, ?, 'ok', ?, datetime('now'))
    `).run(
      type,
      `capture=${captureId ?? '-'};product=${productId ?? '-'};op=${operatorName || '-'};dev=${deviceName || '-'}`,
      detail,
    );
  } catch (e) {
    console.error('[MobileCapture] log error:', e);
  }
}
