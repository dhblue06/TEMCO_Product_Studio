// 库存审核面板（文档 16.4）
import React, { useState } from 'react';
import { MobileInventoryItem } from '../../types/mobileCapture';

interface Props {
  items: MobileInventoryItem[];
  websiteQuantity: number;
  onApprove: (items: { id: number; reviewedQuantity: number | null; reviewStatus: 'approved' | 'rejected' }[]) => Promise<void>;
}

export function InventoryReviewPanel({ items, websiteQuantity, onApprove }: Props) {
  const [reviews, setReviews] = useState<Record<number, { qty: number | null; status: 'approved' | 'rejected' }>>({});

  if (items.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>无库存记录</div>;
  }

  const submit = async () => {
    const payload = items.map(i => ({
      id: i.id,
      reviewedQuantity: reviews[i.id]?.status === 'approved' ? reviews[i.id].qty : null,
      reviewStatus: reviews[i.id]?.status || 'rejected',
    }));
    await onApprove(payload);
  };

  const allReviewed = items.every(i => reviews[i.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        网站当前库存：<b style={{ color: 'var(--text-primary)' }}>{websiteQuantity ?? '未知'}</b>
      </div>
      {items.map(item => {
        const review = reviews[item.id];
        return (
          <div key={item.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{item.color_name || 'Sin variante de color'}</span>
              <span>
                手机：{item.count_type === 'unknown' ? '未盘点' : item.count_type === 'sufficient' ? '库存充足' : item.quantity}
                {item.review_status === 'approved' ? ' ✅' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                placeholder="审核数量"
                value={review?.qty ?? ''}
                onChange={e => setReviews(r => ({ ...r, [item.id]: { qty: e.target.value === '' ? null : parseInt(e.target.value, 10) || 0, status: 'approved' } }))}
                style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
              <button
                type="button"
                className="btn btn-sm"
                style={review?.status === 'approved' ? { background: 'var(--accent)', color: '#fff' } : undefined}
                onClick={() => setReviews(r => ({ ...r, [item.id]: { qty: review?.qty ?? item.quantity, status: 'approved' } }))}
              >
                通过
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={review?.status === 'rejected' ? { background: '#dc2626', color: '#fff' } : undefined}
                onClick={() => setReviews(r => ({ ...r, [item.id]: { qty: null, status: 'rejected' } }))}
              >
                拒绝
              </button>
            </div>
          </div>
        );
      })}
      <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!allReviewed} style={{ alignSelf: 'flex-start' }}>
        确认库存审核
      </button>
    </div>
  );
}

export default InventoryReviewPanel;
