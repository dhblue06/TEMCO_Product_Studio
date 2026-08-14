// 手机采集电脑审核服务（文档 15 / 16）
import { getDatabase } from '../../database/database';
import { getCaptureDetail, getReviewStats, approveCapture, rejectCapture, startReview, markReady, approveInventory } from './mobileCaptureService';
import { approveImage, rejectImage, updateImage, setImageColors } from './mobileCaptureImageService';
import { ColorInput } from './types';

/** 审核端统计（15.1） */
export { getReviewStats };

/** 采集详情（16 节） */
export { getCaptureDetail };

/** 待确认颜色列表（16.3） */
export function listPendingColors(limit = 200): any[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT ic.id, ic.color_name, ic.normalized_color, ic.mapping_status,
      i.id as image_id, i.filename, i.role,
      c.id as capture_id, c.reference,
      p.id as product_id, p.name as product_name, p.prestashop_id
    FROM mobile_capture_image_colors ic
    JOIN mobile_capture_images i ON ic.capture_image_id = i.id
    JOIN mobile_captures c ON i.capture_id = c.id
    JOIN products p ON c.product_id = p.id
    WHERE ic.mapping_status = 'pending'
    ORDER BY ic.id DESC LIMIT ?
  `).all(limit);
}

/** 颜色映射（16.3：mapped/new/ignored + 可选绑定 PrestaShop 属性 ID） */
export function mapColor(colorId: number, status: 'mapped' | 'new' | 'ignored', prestashopAttributeId?: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE mobile_capture_image_colors SET mapping_status = ?, prestashop_attribute_id = ?, is_primary = is_primary WHERE id = ?`)
    .run(status, prestashopAttributeId || 0, colorId);
}

/** 审核单张图片 */
export function reviewImage(imageId: number, action: 'approve' | 'reject', reason?: string): void {
  if (action === 'approve') approveImage(imageId);
  else rejectImage(imageId, reason || '');
}

/** 修改图片（role / 顺序 / 主图候选） */
export function editImage(imageId: number, data: { role?: string; sequence?: number; isCoverCandidate?: boolean }): void {
  updateImage(imageId, data);
}

/** 重新绑定图片颜色 */
export function editImageColors(imageId: number, colors: ColorInput[]): void {
  setImageColors(imageId, colors);
}

/** 审核采集任务（通过/退回） */
export function reviewCapture(captureId: number, action: 'approve' | 'reject', reason?: string): void {
  if (action === 'approve') approveCapture(captureId);
  else rejectCapture(captureId, reason || '');
}

export { startReview, markReady, approveInventory };
