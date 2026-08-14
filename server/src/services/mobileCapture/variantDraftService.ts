// 变体草稿服务（文档 19）— 第一阶段：生成与查看草稿；PrestaShop 同步在第二阶段
import { getDatabase } from '../../database/database';

/**
 * 从已审核通过的采集生成变体草稿（文档 19.2）
 * 第一阶段不读取 PrestaShop 组合，全部标记为 draft；action_type 由人工在审核时确认。
 */
export function createVariantDraftsFromCapture(captureId: number): { created: number } {
  const db = getDatabase();
  const capture = db.prepare(`
    SELECT c.*, p.name as product_name FROM mobile_captures c
    JOIN products p ON c.product_id = p.id WHERE c.id = ?
  `).get(captureId) as any;
  if (!capture) throw new Error('采集任务不存在');
  if (capture.capture_status !== 'approved') throw new Error('只有审核通过的采集才能生成变体草稿');

  const existing = db.prepare('SELECT COUNT(*) as c FROM variant_drafts WHERE capture_id = ?').get(captureId) as any;
  if ((existing?.c || 0) > 0) return { created: 0 };

  // 库存项（颜色 + 数量）
  const inventory = db.prepare(`
    SELECT * FROM mobile_capture_inventory WHERE capture_id = ? AND review_status = 'approved'
  `).all(captureId) as any[];

  // 已审核图片的颜色绑定
  const imageColors = db.prepare(`
    SELECT DISTINCT ic.color_name FROM mobile_capture_image_colors ic
    JOIN mobile_capture_images i ON ic.capture_image_id = i.id
    WHERE i.capture_id = ? AND i.status IN ('approved','pushed')
  `).all(captureId) as any[];

  const colors = new Map<string, { name: string; qty: number | null }>();
  for (const inv of inventory) {
    const key = inv.normalized_color || (inv.color_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!colors.has(key)) colors.set(key, { name: inv.color_name, qty: inv.quantity ?? null });
  }
  for (const ic of imageColors) {
    const key = (ic.color_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!colors.has(key)) colors.set(key, { name: ic.color_name || '', qty: null });
  }

  const insert = db.prepare(`
    INSERT INTO variant_drafts (capture_id, product_id, prestashop_product_id, color_name, quantity, capture_image_id,
      action_type, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, 'create', 'draft', datetime('now'), datetime('now'))
  `);

  const tx = db.transaction(() => {
    for (const [, v] of colors) {
      if (!v.name) continue;
      insert.run(captureId, capture.product_id, capture.prestashop_product_id || parseInt(capture.prestashop_id || '0', 10) || 0, v.name, v.qty);
    }
  });
  tx();

  const count = (db.prepare('SELECT COUNT(*) as c FROM variant_drafts WHERE capture_id = ?').get(captureId) as any)?.c || 0;
  return { created: count };
}

export function listVariantDrafts(filters: { status?: string; captureId?: number; page?: number; pageSize?: number } = {}): { drafts: any[]; pagination: any } {
  const db = getDatabase();
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 20));
  const where: string[] = ['1=1'];
  const params: any[] = [];
  if (filters.status) { where.push('v.status = ?'); params.push(filters.status); }
  if (filters.captureId) { where.push('v.capture_id = ?'); params.push(filters.captureId); }

  const whereSQL = where.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) as c FROM variant_drafts v WHERE ${whereSQL}`).get(...params) as any)?.c || 0;
  const drafts = db.prepare(`
    SELECT v.*, p.reference, p.name as product_name, c.capture_status,
      (SELECT COUNT(*) FROM mobile_capture_images i WHERE i.capture_id = v.capture_id) as image_count
    FROM variant_drafts v
    JOIN products p ON v.product_id = p.id
    JOIN mobile_captures c ON v.capture_id = c.id
    WHERE ${whereSQL}
    ORDER BY v.id DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize);
  return { drafts, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export function updateVariantDraft(id: number, data: { actionType?: string; status?: string; quantity?: number | null; colorName?: string }): void {
  const db = getDatabase();
  const sets: string[] = [];
  const params: any[] = [];
  if (data.actionType !== undefined) { sets.push('action_type = ?'); params.push(data.actionType); }
  if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status); }
  if (data.quantity !== undefined) { sets.push('quantity = ?'); params.push(data.quantity); }
  if (data.colorName !== undefined) { sets.push('color_name = ?'); params.push(data.colorName); }
  if (sets.length === 0) return;
  sets.push('updated_at = datetime(\'now\')');
  params.push(id);
  db.prepare(`UPDATE variant_drafts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}
