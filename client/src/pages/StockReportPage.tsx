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
  ps_id?: number | string;
}

function WebsiteProductImage({ productId, name }: { productId: number; name: string }) {
  const [failed, setFailed] = useState(false);
  const boxStyle: React.CSSProperties = { width: 92, height: 92, flex: '0 0 92px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-hover)' };
  if (!productId || failed) {
    return <div style={{ ...boxStyle, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 11 }}>暂无图片</div>;
  }
  return <img src={stockReportApi.websiteImageUrl(productId)} alt={name} loading="lazy" onError={() => setFailed(true)} style={{ ...boxStyle, objectFit: 'contain' }} />;
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

  const loadAllActive = async (): Promise<ReportItem[]> => {
    const res = await stockReportApi.list('active');
    if (!res.success) throw new Error(res.error || '读取缺货产品失败');
    return res.data || [];
  };

  const exportExcel = async () => {
    try {
      const rows = await loadAllActive();
      if (rows.length === 0) { toastError('当前没有待处理缺货产品'); return; }
      const XLSX = await import('xlsx');
      const data = rows.map((it, index) => ({
        序号: index + 1,
        产品编号: it.reference,
        产品名称: it.product_name || it.local_name || '',
        条码: it.barcode || '',
        缺货状态: TYPE_LABEL[it.report_type] || it.report_type,
        上报数量: it.report_type === 'sold_out' ? 0 : it.quantity,
        单位: it.report_type === 'boxes' ? '箱' : '件',
        每箱件数: it.report_type === 'boxes' ? it.box_size : '',
        总件数: totalPieces(it),
        网站库存: it.website_quantity ?? '未知',
        上报人: it.operator_name || '',
        设备: it.device_name || '',
        备注: it.note || '',
        上报时间: it.created_at || '',
      }));
      const sheet = XLSX.utils.json_to_sheet(data);
      sheet['!cols'] = [6, 16, 34, 18, 12, 10, 8, 10, 10, 10, 12, 12, 28, 20].map(wch => ({ wch }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, '待处理缺货产品');
      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(book, `TEMCO_缺货产品_${date}.xlsx`);
      success(`已导出 ${rows.length} 个缺货产品`);
    } catch (e: any) {
      toastError(`导出 Excel 失败：${e.message}`);
    }
  };

  const escapeHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const exportPdf = async () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toastError('浏览器阻止了打印窗口，请允许弹出窗口后重试'); return; }
    printWindow.document.write('<p style="font-family:sans-serif;padding:24px">正在生成缺货清单…</p>');
    try {
      const rows = await loadAllActive();
      if (rows.length === 0) { printWindow.close(); toastError('当前没有待处理缺货产品'); return; }
      const date = new Date().toLocaleString('zh-CN');
      const body = rows.map((it, index) => {
        const psId = Number(it.prestashop_product_id || it.ps_id || 0);
        const imageUrl = psId ? stockReportApi.websiteImageUrl(psId) : '';
        return `<tr>
          <td>${index + 1}</td>
          <td>${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="">` : ''}</td>
          <td><b>${escapeHtml(it.reference)}</b><br>${escapeHtml(it.product_name || it.local_name || '')}<br><small>${escapeHtml(it.barcode)}</small></td>
          <td>${escapeHtml(TYPE_LABEL[it.report_type] || it.report_type)}</td>
          <td>${it.report_type === 'boxes' ? `${it.quantity}箱 × ${it.box_size || 0}` : `${totalPieces(it)}件`}</td>
          <td>${totalPieces(it)}</td>
          <td>${escapeHtml(it.website_quantity ?? '未知')}</td>
          <td>${escapeHtml(it.operator_name || '')}<br><small>${escapeHtml(it.created_at?.slice(0, 16).replace('T', ' '))}</small></td>
          <td>${escapeHtml(it.note || '')}</td>
        </tr>`;
      }).join('');
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>TEMCO 缺货产品清单</title>
        <style>
          @page{size:A4 landscape;margin:10mm} body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#111;margin:0} h1{font-size:20px;margin:0 0 4px}.meta{font-size:11px;color:#555;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #bbb;padding:5px;text-align:left;vertical-align:middle}th{background:#eee}img{width:48px;height:48px;object-fit:contain}small{color:#555}.actions{margin:12px 0}@media print{.actions{display:none}}
        </style></head><body><h1>TEMCO 待处理缺货产品清单</h1><div class="meta">导出时间：${escapeHtml(date)} · 共 ${rows.length} 个产品</div>
        <div class="actions"><button onclick="window.print()" style="padding:8px 18px">打印 / 另存为 PDF</button></div>
        <table><thead><tr><th>#</th><th>图片</th><th>产品</th><th>状态</th><th>上报数量</th><th>总件数</th><th>网站库存</th><th>上报人/时间</th><th>备注</th></tr></thead><tbody>${body}</tbody></table>
        <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),500));<\/script></body></html>`);
      printWindow.document.close();
    } catch (e: any) {
      printWindow.close();
      toastError(`生成 PDF 失败：${e.message}`);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-primary)', zIndex: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 顶栏 */}
      <div className="mobile-topbar" style={{ padding: '10px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>📉 缺货管理 {summary.count > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 12, marginLeft: 6 }}>{summary.count}</span>}</span>
        <button type="button" className="btn btn-sm" onClick={onClose} style={{ background: 'rgba(255,255,255,.18)', color: '#fff', border: '1px solid rgba(255,255,255,.35)' }}>关闭</button>
      </div>

      {/* 筛选 */}
      <div style={{ padding: '10px 20px', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([['active', `待处理（${summary.count}）`], ['resolved', '已补货'], ['all', '全部']] as [StatusFilter, string][]).map(([s, label]) => (
            <button key={s} className={filter === s ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setFilter(s)}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={exportExcel}>📊 导出 Excel</button>
          <button type="button" className="btn btn-sm" onClick={exportPdf}>📄 导出 PDF</button>
        </div>
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
            const websiteProductId = Number(it.prestashop_product_id || it.ps_id || 0);
            return (
              <div key={it.id} className="ui-card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: `4px solid ${it.status === 'active' ? '#ef4444' : it.status === 'synced' ? '#16a34a' : '#d1d5db'}` }}>
                <WebsiteProductImage productId={websiteProductId} name={it.product_name || it.local_name || it.reference} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default StockReportPage;
