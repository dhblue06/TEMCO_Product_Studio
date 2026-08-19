// 桌面端缺货管理页（v1.7）：红色小标 → 缺货明细 → 网站信息对比 → 已补货标记
import React, { useCallback, useEffect, useState } from 'react';
import { stockReportApi } from '../services/api';
import { useToast } from '../components/ui/ToastProvider';
import { useConfirm } from '../components/ui/ConfirmProvider';

type StatusFilter = 'active' | 'synced' | 'resolved' | 'all';

interface ReportItem {
  id: number;
  product_id: number | null;
  prestashop_product_id: number;
  reference: string;
  product_name: string;
  barcode: string;
  report_type: 'pieces' | 'boxes' | 'sold_out';
  quantity: number;
  box_size: number;
  status: 'active' | 'synced' | 'resolved';
  sync_status: 'pending' | 'synced' | 'failed';
  sync_error: string;
  website_quantity: number | null;
  operator_name: string;
  device_name: string;
  note: string;
  created_at: string;
  updated_at: string;
  local_name: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: '待处理', color: '#dc2626', bg: '#fef2f2' },
  synced: { label: '已同步', color: '#16a34a', bg: '#f0fdf4' },
  resolved: { label: '已补货', color: '#6b7280', bg: '#f3f4f6' },
};

const TYPE_LABEL: Record<string, string> = {
  pieces: '剩X件',
  boxes: '剩X箱',
  sold_out: '已卖完',
};

export function StockReportPage({ onClose }: { onClose: () => void }) {
  const { success, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [items, setItems] = useState<ReportItem[]>([]);
  const [summary, setSummary] = useState<{ count: number }>({ count: 0 });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    try {
      const [listRes, sumRes] = await Promise.all([
        stockReportApi.list(status),
        stockReportApi.getSummary(),
      ]);
      if (listRes.success) setItems(listRes.data || []);
      if (sumRes.success) setSummary(sumRes.data);
    } catch { /* 忽略 */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const resolveOne = async (it: ReportItem) => {
    const ok = await confirm(`确认 ${it.reference} 已补货？将从缺货列表中移除。`, { title: '标记已补货' });
    if (!ok) return;
    try {
      const res = await stockReportApi.resolve(it.id);
      if (res.success) { success('已标记补货'); load(filter); }
    } catch (e: any) { toastError(e.message); }
  };

  const removeOne = async (it: ReportItem) => {
    const ok = await confirm(`删除 ${it.reference} 的缺货记录？`, { title: '删除记录', danger: true });
    if (!ok) return;
    try {
      const res = await stockReportApi.remove(it.id);
      if (res.success) { success('已删除'); load(filter); }
    } catch (e: any) { toastError(e.message); }
  };

  const totalPieces = (it: ReportItem) =>
    it.report_type === 'pieces' ? it.quantity
      : it.report_type === 'boxes' ? it.quantity * (it.box_size || 0)
      : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-primary)', zIndex: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 顶栏 */}
      <div className="mobile-topbar" style={{ padding: '10px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>📉 缺货管理 {summary.count > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 12, marginLeft: 6 }}>{summary.count}</span>}</span>
        <button type="button" className="btn btn-sm" onClick={onClose} style={{ background: 'rgba(255,255,255,.18)', color: '#fff', border: '1px solid rgba(255,255,255,.35)' }}>关闭</button>
      </div>

      {/* 筛选 */}
      <div style={{ padding: '10px 20px', display: 'flex', gap: 6, borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
        {([['active', `待处理（${summary.count}）`], ['resolved', '已补货'], ['all', '全部']] as [StatusFilter, string][]).map(([s, label]) => (
          <button key={s} className={filter === s ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setFilter(s)}>{label}</button>
        ))}
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>加载中...</div>}
        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <div>暂无缺货记录</div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 900, margin: '0 auto' }}>
          {items.map(it => {
            const st = STATUS_LABEL[it.status] || STATUS_LABEL.active;
            const typeLabel = TYPE_LABEL[it.report_type] || it.report_type;
            return (
              <div key={it.id} className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderLeft: `4px solid ${it.status === 'active' ? '#ef4444' : it.status === 'synced' ? '#16a34a' : '#d1d5db'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{it.product_name || it.local_name || it.reference}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {it.reference}{it.barcode ? ` · EAN ${it.barcode}` : ''} · {it.operator_name || '—'} · {it.created_at?.slice(0, 16).replace('T', ' ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 12, background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span>
                    {it.status === 'active' && it.sync_status === 'failed' && (
                      <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 12, background: '#fef2f2', color: '#dc2626', fontWeight: 600 }} title={it.sync_error}>⚠️ 同步失败</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--bg-hover)' }}>
                    <b>{typeLabel}</b>：
                    {it.report_type === 'sold_out' ? <b style={{ color: '#dc2626' }}>0</b>
                      : it.report_type === 'boxes' ? <b>{it.quantity} 箱</b>
                      : <b>{it.quantity} 件</b>}
                  </span>
                  <span style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--bg-hover)' }}>
                    总件数：<b>{it.report_type === 'boxes' ? `${it.quantity}×${it.box_size || 0}=${totalPieces(it)}` : totalPieces(it)}</b>
                  </span>
                  <span style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--bg-hover)' }}>
                    网站当前库存：<b style={{ color: it.website_quantity === null ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{it.website_quantity === null ? '未知' : it.website_quantity}</b>
                  </span>
                </div>

                {it.note && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📝 {it.note}</div>}
                {it.status === 'active' && it.sync_status === 'failed' && it.sync_error && (
                  <div style={{ fontSize: 12, color: '#dc2626' }}>错误：{it.sync_error}</div>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {it.status === 'active' && (
                    <button type="button" className="btn btn-sm" onClick={() => resolveOne(it)}>✅ 已补货</button>
                  )}
                  <button type="button" className="btn btn-sm" style={{ color: '#dc2626' }} onClick={() => removeOne(it)}>删除</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default StockReportPage;
