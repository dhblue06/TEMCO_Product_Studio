// 采集任务卡片（文档 15.3 列表字段）
import React from 'react';
import { MobileCaptureListItem, CAPTURE_STATUS_LABELS, SYNC_STATUS_LABELS } from '../../types/mobileCapture';

interface Props {
  capture: MobileCaptureListItem;
  selected: boolean;        // 详情选中（高亮）
  checked: boolean;         // 批量选择
  onToggleCheck: () => void;
  onClick: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280', submitted: '#3b82f6', reviewing: '#8b5cf6', approved: '#10b981',
  rejected: '#ef4444', processing: '#f59e0b', ready: '#059669', synced: '#0d9488', cancelled: '#9ca3af',
};

export function CaptureTaskCard({ capture, selected, checked, onToggleCheck, onClick }: Props) {
  const thumbUrl = capture.thumbnail_image_id
    ? `/api/mobile-capture/review/images/${capture.thumbnail_image_id}/file`
    : null;
  return (
    <div
      onClick={onClick}
      style={{
        padding: 12, borderRadius: 10, border: `1px solid ${selected ? 'var(--accent)' : checked ? '#f59e0b' : 'var(--border-color)'}`,
        background: selected ? 'var(--accent-light)' : checked ? 'rgba(245,158,11,.08)' : 'var(--bg-secondary)',
        cursor: 'pointer',
        display: 'flex', gap: 10, position: 'relative',
      }}
    >
      {/* 手机上传照片缩略图 */}
      <div style={{ flexShrink: 0, width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt="采集照片"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <span style={{ fontSize: 22, opacity: .35 }}>📷</span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {capture.product_sold_out === 1 && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#ef44441a', color: '#dc2626', fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}>
                🚫 已卖完
              </span>
            )}
            {capture.product_name || capture.reference}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={checked}
              onClick={e => e.stopPropagation()}
              onChange={onToggleCheck}
              title="选择此任务（用于批量删除）"
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, background: `${STATUS_COLORS[capture.capture_status] || '#6b7280'}1a`, color: STATUS_COLORS[capture.capture_status] || '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {CAPTURE_STATUS_LABELS[capture.capture_status] || capture.capture_status}
            </span>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <span>{capture.reference}</span>
          {capture.serial_number && <span>· {capture.serial_number}</span>}
          {capture.brand && <span>· {capture.brand}</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <span>🖼 {capture.image_count} 张（通过 {capture.approved_image_count}）</span>
          {capture.colors && <span>🎨 {capture.colors}</span>}
          {capture.phone_models && (() => {
            try {
              const models = JSON.parse(capture.phone_models);
              if (Array.isArray(models) && models.length) {
                const names = models.map((m: any) => {
                  const colors = Array.isArray(m.colors) && m.colors.length ? `（${m.colors.join('、')}）` : '';
                  return m.model + colors;
                }).join('、');
                return <span style={{ color: '#7c3aed', fontWeight: 600 }}>📱 {names.length > 80 ? names.slice(0, 80) + '…' : names}</span>;
              }
            } catch {}
            return null;
          })()}
          {capture.has_notes === 1 && <span>📝</span>}
          <span>👤 {capture.operator_name}</span>
          <span>⏱ {(capture.created_at || '').slice(0, 16).replace('T', ' ')}</span>
          <span>📤 {SYNC_STATUS_LABELS[capture.sync_status] || capture.sync_status}</span>
        </div>
      </div>
    </div>
  );
}

export default CaptureTaskCard;
