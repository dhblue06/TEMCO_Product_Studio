// 上传队列（文档 27.3 简化版：展示待上传/上传中/失败）
import React from 'react';
import { useI18n } from '../../i18n';

export type QueueItemStatus = 'pending' | 'uploading' | 'done' | 'failed';

export interface UploadQueueItem {
  id: string;
  filename: string;
  role: string;
  status: QueueItemStatus;
  error?: string;
  previewUrl?: string;
}

interface Props {
  items: UploadQueueItem[];
  onRetry?: (id: string) => void;
}

const STATUS_KEY: Record<QueueItemStatus, string> = {
  pending: 'queue.pending', uploading: 'queue.uploading', done: 'queue.done', failed: 'queue.failed',
};

export function UploadQueue({ items, onRetry }: Props) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  const counts = items.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>{t('queue.pending')} {counts.pending || 0}</span>
        <span>{t('queue.uploading')} {counts.uploading || 0}</span>
        <span>{t('queue.done')} {counts.done || 0}</span>
        <span style={{ color: counts.failed ? '#dc2626' : undefined }}>{t('queue.failed')} {counts.failed || 0}</span>
      </div>
      {items.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          {item.previewUrl && <img src={item.previewUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />}
          <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.filename}</span>
          <span style={{ color: item.status === 'failed' ? '#dc2626' : item.status === 'done' ? '#10b981' : 'var(--text-muted)' }}>
            {t(STATUS_KEY[item.status])}
          </span>
          {item.status === 'failed' && onRetry && (
            <button type="button" onClick={() => onRetry(item.id)} className="btn btn-sm">{t('queue.retry')}</button>
          )}
        </div>
      ))}
    </div>
  );
}

export default UploadQueue;
