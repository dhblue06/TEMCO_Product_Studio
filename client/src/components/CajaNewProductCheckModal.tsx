// CAJA 新品检查（v1.6）：上传 Products.xlsx → 与 PrestaShop 网站比对 → 默认只显示网站没有的新品
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cajaCheckApi } from '../services/api';
import { useToast } from './ui/ToastProvider';
import { useConfirm } from './ui/ConfirmProvider';
import './Modal.css';

interface PreviewData {
  filename: string;
  totalRows: number;
  validRows: number;
  columns: string[];
  sample: { reference: string; barcode: string; name: string }[];
}

interface Summary {
  batchId: number;
  total: number;
  existing: number;
  new: number;
  review: number;
  priceChanged: number;
  websiteProducts: number;
}

interface BatchRow {
  id: number;
  filename: string;
  total_rows: number;
  existing_count: number;
  new_count: number;
  review_count: number;
  website_product_count: number;
  status: string;
  error_message: string;
  created_at: string;
}

interface ItemRow {
  id: number;
  caja_reference: string;
  barcode: string;
  name: string;
  name2: string;
  purchase_price: number | null;
  sale_price: number | null;
  edit_date: string;
  caja_status: string;
  result_status: string;
  match_method: string;
  prestashop_product_id: number | null;
  prestashop_price: number | null;
  price_changed: number;
  price_sync_status: string | null;
  price_sync_error: string | null;
  upload_error: string | null;
  upload_status: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  existing: '网站已存在',
  new: '🆕 网站没有',
  review: '🟡 需要确认',
};

const MATCH_METHOD_LABEL: Record<string, string> = {
  ean: 'EAN 精确匹配',
  upc: 'UPC 精确匹配',
  reference: 'Reference 精确匹配',
  exact_name: '标准化名称完全一致',
  duplicate_ean: '网站 EAN 重复',
  duplicate_reference: '网站 Reference 重复',
  none: '无匹配',
};

export function CajaNewProductCheckModal({ onClose }: { onClose: () => void }) {
  const { success, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [batchId, setBatchId] = useState<number | null>(null);

  const [statusFilter, setStatusFilter] = useState<'new' | 'review' | 'price_changed' | 'all'>('new');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [pagination, setPagination] = useState<{ page: number; pageSize: number; total: number; pages: number } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [priceMsg, setPriceMsg] = useState('');

  const [history, setHistory] = useState<BatchRow[]>([]);

  const loadItems = useCallback(async (id: number, opts: { status?: string; search?: string; page?: number } = {}) => {
    const res = await cajaCheckApi.getItems(id, {
      status: opts.status ?? statusFilter,
      search: opts.search ?? search,
      page: opts.page ?? page,
      pageSize: 50,
    });
    if (res.success) {
      setItems(res.data.items || []);
      setPagination(res.data.pagination || null);
    }
  }, [statusFilter, search, page]);

  const loadHistory = useCallback(async () => {
    const res = await cajaCheckApi.getHistory();
    if (res.success) setHistory(res.data || []);
  }, []);

  const openBatch = useCallback(async (id: number) => {
    setBatchId(id);
    const b = await cajaCheckApi.getBatch(id);
    if (b.success) {
      setSummary({
        batchId: id,
        total: b.data.total_rows || 0,
        existing: b.data.existing_count || 0,
        new: b.data.new_count || 0,
        review: b.data.review_count || 0,
        priceChanged: b.data.price_changed_count || 0,
        websiteProducts: b.data.website_product_count || 0,
      });
    }
    await loadItems(id, { status: 'new', search: '', page: 1 });
    setStatusFilter('new');
    setSearch('');
    setSearchInput('');
    setPage(1);
  }, [loadItems]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const onFileChange = async (f: File | null) => {
    setFile(f);
    setPreview(null);
    setRunError('');
    setSummary(null);
    setBatchId(null);
    setItems([]);
    setPagination(null);
    if (!f) return;
    const res = await cajaCheckApi.preview(f);
    if (res.success) {
      setPreview(res.data);
    } else if (res.error === 'INVALID_CAJA_FILE') {
      setRunError(`❌ 这不是有效的 CAJA Products.xlsx\n缺少字段：${(res.missingColumns || []).join('、')}`);
    } else {
      setRunError('❌ ' + (res.error || '文件解析失败'));
    }
  };

  const startCheck = async () => {
    if (!file) return;
    setRunning(true);
    setRunError('');
    try {
      const res = await cajaCheckApi.run(file);
      if (res.success) {
        const s: Summary = res.data;
        setSummary(s);
        setBatchId(s.batchId);
        setStatusFilter('new');
        setSearch('');
        setSearchInput('');
        setPage(1);
        await loadItems(s.batchId, { status: 'new', search: '', page: 1 });
        await loadHistory();
      } else {
        setRunError('❌ ' + (res.error || '检查失败'));
      }
    } catch (e: any) {
      setRunError('❌ ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  const applyFilter = (status: 'new' | 'review' | 'price_changed' | 'all') => {
    setStatusFilter(status);
    setPage(1);
    if (batchId) loadItems(batchId, { status, search, page: 1 });
  };

  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
    if (batchId) loadItems(batchId, { status: statusFilter, search: searchInput.trim(), page: 1 });
  };

  const goPage = (p: number) => {
    if (!pagination || p < 1 || p > pagination.pages) return;
    setPage(p);
    if (batchId) loadItems(batchId, { status: statusFilter, search, page: p });
  };

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (items.length === 0) return;
    // 价格变动 tab：勾选“价格有变动”的已匹配商品；其余 tab：勾选未上传的新品
    const selectable = statusFilter === 'price_changed'
      ? items.filter(it => hasPriceChanged(it))
      : items.filter(it => !it.prestashop_product_id);
    setSelectedIds(prev => {
      const allSelected = selectable.length > 0 && selectable.every(it => prev.has(it.id));
      const next = new Set(prev);
      selectable.forEach(it => allSelected ? next.delete(it.id) : next.add(it.id));
      return next;
    });
  };

  const uploadSelected = async () => {
    if (!batchId || selectedIds.size === 0) return;
    const ok = await confirm(`将 ${selectedIds.size} 个商品直接创建到 PrestaShop 网站（基础信息：编号/名称/售价/EAN，库存为 0，不含图片/分类/文案）。继续？`, { title: '上传到网站' });
    if (!ok) return;
    setUploading(true);
    setUploadMsg('');
    try {
      const res = await cajaCheckApi.uploadToWebsite(batchId, Array.from(selectedIds));
      if (res.success) {
        const d = res.data;
        setUploadMsg(`✅ 上传完成：新建 ${d.created} · 网站已有 ${d.exists} · 已上传跳过 ${d.skipped} · 失败 ${d.failed}`);
        setSelectedIds(new Set());
        await loadItems(batchId, { status: statusFilter, search, page });
      } else {
        setUploadMsg('❌ ' + (res.error || '上传失败'));
      }
    } catch (e: any) {
      setUploadMsg('❌ ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  /** 价格同步：把勾选商品在网站上的价格更新为文件售价（以文件为准） */
  const syncPriceSelected = async () => {
    if (!batchId || selectedIds.size === 0) return;
    const ok = await confirm(`将以文件售价为准，把 ${selectedIds.size} 个商品在 PrestaShop 网站上的价格更新为文件中的售价。继续？`, { title: '同步价格' });
    if (!ok) return;
    setSyncingPrices(true);
    setPriceMsg('');
    try {
      const res = await cajaCheckApi.syncPrices(batchId, Array.from(selectedIds));
      if (res.success) {
        const d = res.data;
        setPriceMsg(`✅ 价格同步完成：已更新 ${d.synced} · 失败 ${d.failed} · 跳过 ${d.skipped}`);
        setSelectedIds(new Set());
        await loadItems(batchId, { status: statusFilter, search, page });
      } else {
        setPriceMsg('❌ ' + (res.error || '价格同步失败'));
      }
    } catch (e: any) {
      setPriceMsg('❌ ' + e.message);
    } finally {
      setSyncingPrices(false);
    }
  };

  const hasUploaded = (it: ItemRow) => it.prestashop_product_id != null;
  const hasFailed = (it: ItemRow) => !hasUploaded(it) && !!it.upload_error;
  const isUploadedNew = (it: ItemRow) => it.upload_status === 'created';
  const isUploadedExists = (it: ItemRow) => it.upload_status === 'exists';
  /** 价格有变动（网站价格 ≠ 文件售价） */
  const hasPriceChanged = (it: ItemRow) => it.prestashop_product_id != null && it.price_changed === 1;
  /** 价格已同步到网站 / 同步失败 */
  const hasPriceSynced = (it: ItemRow) => it.price_sync_status === 'synced';
  const hasPriceFailed = (it: ItemRow) => it.price_sync_status === 'failed';
  /** 当前 tab 下可勾选的商品（价格变动 tab 勾价格变动项；其余 tab 勾未上传的新品） */
  const isSelectable = (it: ItemRow) => statusFilter === 'price_changed' ? hasPriceChanged(it) : !hasUploaded(it);

  const removeBatch = async (id: number) => {
    const ok = await confirm(`删除检查批次 #${id}？其明细将一并删除。`, { title: '删除批次', danger: true });
    if (!ok) return;
    const res = await cajaCheckApi.deleteBatch(id);
    if (res.success) {
      await loadHistory();
      if (batchId === id) {
        setBatchId(null);
        setSummary(null);
        setItems([]);
        setPagination(null);
      }
      success('✅ 批次已删除');
    } else {
      toastError('❌ ' + (res.error || '删除失败'));
    }
  };

  const tabCount = (status: 'new' | 'review' | 'price_changed' | 'all') => {
    if (!summary) return 0;
    if (status === 'new') return summary.new;
    if (status === 'review') return summary.review;
    if (status === 'price_changed') return summary.priceChanged;
    return summary.total;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980, width: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3>📥 CAJA 新品检查</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 上传区 */}
          <div style={{ border: '1px dashed var(--border-color)', borderRadius: 10, padding: 14, background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>
              上传 CAJA 导出的 <b>Products.xlsx</b>，与 PrestaShop 网站商品比对：<b>① 发现网站还没有的新品</b>（🆕）；<b>② 比对价格变动</b>（💰 文件售价 ≠ 网站价格时，以文件为准，可勾选一键同步到网站）。
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => onFileChange(e.target.files?.[0] || null)}
                style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, minWidth: 240 }}
              />
              {preview && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={running}
                  onClick={startCheck}
                  style={{ padding: '8px 18px' }}
                >
                  {running ? '⏳ 正在检查网站商品…' : '🚀 开始检查'}
                </button>
              )}
            </div>
            {preview && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                ✅ <b>{preview.filename}</b> · 已读取 <b>{preview.totalRows.toLocaleString()}</b> 条 · 字段 {preview.columns.length} 个
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  网站数据：{running ? '⏳ 读取中…' : summary ? `已比对 ${summary.websiteProducts.toLocaleString()} 个网站商品` : '● 待检查'}
                </div>
              </div>
            )}
            {running && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--accent)' }}>
                正在检查网站产品……（首次读取约 9,000+ 商品，请稍候）
              </div>
            )}
            {runError && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: '#fff2f0', color: '#cf1322', fontSize: 13, whiteSpace: 'pre-line' }}>
                {runError}
              </div>
            )}
          </div>

          {/* 结果区 */}
          {summary && (
            <>
              {/* 统计 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                {[
                  { label: 'CAJA 商品', value: summary.total, color: 'var(--text-primary)' },
                  { label: '网站已存在', value: summary.existing, color: 'var(--text-secondary)' },
                  { label: '发现新品', value: summary.new, color: '#10b981' },
                  { label: '无法判断', value: summary.review, color: '#f59e0b' },
                  { label: '价格变动', value: summary.priceChanged, color: '#ef4444' },
                ].map(s => (
                  <div key={s.label} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg-secondary)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>

              {/* 批次操作 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                <span>批次 #{batchId}</span>
                <a
                  href={cajaCheckApi.exportUrl(batchId!, statusFilter === 'all' ? 'all' : statusFilter)}
                  download
                  style={{ textDecoration: 'none', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}
                >
                  ⬇️ 导出 CSV（{statusFilter === 'new' ? '新品' : statusFilter === 'review' ? '待确认' : '当前筛选'}）
                </a>
                {statusFilter !== 'price_changed' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={uploading || selectedIds.size === 0}
                      onClick={uploadSelected}
                      style={{ padding: '4px 12px', fontSize: 12 }}
                    >
                      {uploading ? '⏳ 正在上传到网站…' : `⬆️ 上传到网站（${selectedIds.size}）`}
                    </button>
                    {uploadMsg && (
                      <span style={{ fontSize: 12, color: uploadMsg.startsWith('❌') ? '#cf1322' : '#059669', fontWeight: 600 }}>
                        {uploadMsg}
                      </span>
                    )}
                  </>
                )}
                {statusFilter === 'price_changed' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={syncingPrices || selectedIds.size === 0}
                      onClick={syncPriceSelected}
                      style={{ padding: '4px 12px', fontSize: 12, background: '#ef4444', borderColor: '#ef4444' }}
                    >
                      {syncingPrices ? '⏳ 正在同步价格…' : `💰 同步价格到网站（${selectedIds.size}）`}
                    </button>
                    {priceMsg && (
                      <span style={{ fontSize: 12, color: priceMsg.startsWith('❌') ? '#cf1322' : '#059669', fontWeight: 600 }}>
                        {priceMsg}
                      </span>
                    )}
                  </>
                )}
                {history.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span>历史批次：</span>
                    <select
                      value={batchId || ''}
                      onChange={(e) => { const v = Number(e.target.value); if (v) openBatch(v); }}
                      style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                    >
                      <option value="">—</option>
                      {history.map(h => (
                        <option key={h.id} value={h.id}>
                          #{h.id} {h.filename} ({new Date(h.created_at).toLocaleString()})
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-sm" style={{ color: '#dc2626' }} onClick={() => batchId && removeBatch(batchId)}>🗑 删除本批次</button>
                  </span>
                )}
              </div>

              {/* 筛选 tab + 搜索 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {(['new', 'review', 'price_changed', 'all'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => applyFilter(s)}
                    style={{
                      padding: '6px 14px', borderRadius: 14, border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: 13,
                      background: statusFilter === s ? 'var(--accent)' : 'var(--bg-secondary)',
                      color: statusFilter === s ? '#fff' : 'var(--text-primary)',
                      ...(s === 'price_changed' && statusFilter !== s ? { borderColor: '#ef4444', color: '#ef4444' } : {}),
                    }}
                  >
                    {s === 'new' ? '🆕 新品' : s === 'review' ? '🟡 需要确认' : s === 'price_changed' ? '💰 价格变动' : '全部'}（{tabCount(s).toLocaleString()}）
                  </button>
                ))}
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                    placeholder="搜索 编号 / 条码 / 名称"
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: 220 }}
                  />
                  <button type="button" className="btn btn-sm" onClick={applySearch}>搜索</button>
                </div>
              </div>

              {/* 表格 */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-hover)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px', width: 30 }}>
                        <input type="checkbox" checked={items.length > 0 && items.filter(i => isSelectable(i)).every(i => selectedIds.has(i.id))} onChange={toggleSelectAll} style={{ accentColor: 'var(--accent)' }} />
                      </th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>CAJA 编号</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>条码</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>商品名称</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>文件售价</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>网站价格</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>检查结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>暂无数据</td></tr>
                    )}
                    {items.map(it => (
                      <React.Fragment key={it.id}>
                        <tr style={{ borderTop: '1px solid var(--border-color)', cursor: 'pointer', opacity: hasUploaded(it) && !hasPriceChanged(it) ? 0.55 : 1 }} onClick={() => toggleExpand(it.id)}>
                          <td style={{ padding: '8px 10px' }} onClick={(e) => e.stopPropagation()}>
                            {isUploadedNew(it) ? (
                              <span title="已新建上传到网站" style={{ fontSize: 13 }}>✅</span>
                            ) : isUploadedExists(it) ? (
                              <span title="网站已有同编号商品（未新建）" style={{ fontSize: 13 }}>⚠️</span>
                            ) : hasPriceSynced(it) ? (
                              <span title="价格已同步到网站" style={{ fontSize: 13 }}>✅</span>
                            ) : hasPriceFailed(it) ? (
                              <span title={it.price_sync_error || '价格同步失败'} style={{ fontSize: 13 }}>❌</span>
                            ) : (
                              <input type="checkbox" checked={selectedIds.has(it.id)} onChange={() => toggleSelect(it.id)} style={{ accentColor: 'var(--accent)' }} />
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{it.caja_reference}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{it.barcode}</td>
                          <td style={{ padding: '8px 10px', maxWidth: 320 }}>{it.name}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: hasPriceChanged(it) ? 700 : 400, color: hasPriceChanged(it) ? '#ef4444' : 'var(--text-primary)' }}>
                            {it.sale_price != null ? `€${it.sale_price}` : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                            {it.prestashop_price != null ? (
                              <span style={{ fontWeight: hasPriceChanged(it) ? 700 : 400, color: hasPriceChanged(it) ? '#ef4444' : 'var(--text-secondary)' }} title={hasPriceChanged(it) ? '网站价格与文件售价不一致' : '网站价格与文件售价一致'}>
                                €{it.prestashop_price}
                                {hasPriceChanged(it) && it.sale_price != null && (it.sale_price > it.prestashop_price ? ' ↑' : ' ↓')}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {isUploadedNew(it) ? (
                              <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'rgba(16,185,129,.12)', color: '#059669' }}>
                                ✅ 已上传
                              </span>
                            ) : isUploadedExists(it) ? (
                              <span title="网站已有同 Reference 商品（未新建，状态为网站原有）" style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'rgba(245,158,11,.15)', color: '#b45309', cursor: 'help' }}>
                                ⚠️ 网站已有
                              </span>
                            ) : hasFailed(it) ? (
                              <span title={it.upload_error || ''} style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'rgba(207,19,34,.1)', color: '#cf1322', cursor: 'help' }}>
                                ❌ 失败
                              </span>
                            ) : (
                              <span
                                title={MATCH_METHOD_LABEL[it.match_method] || it.match_method}
                                style={{
                                  display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                                  background: it.result_status === 'new' ? 'rgba(16,185,129,.12)' : it.result_status === 'review' ? 'rgba(245,158,11,.15)' : 'var(--bg-hover)',
                                  color: it.result_status === 'new' ? '#059669' : it.result_status === 'review' ? '#b45309' : 'var(--text-secondary)',
                                }}
                              >
                                {STATUS_LABEL[it.result_status] || it.result_status}
                              </span>
                            )}
                          </td>
                        </tr>
                        {expanded.has(it.id) && (
                          <tr style={{ borderTop: '1px solid var(--border-color)', background: 'var(--bg-hover)' }}>
                            <td colSpan={7} style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                {it.name2 && <span>名称2：{it.name2}</span>}
                                {it.purchase_price != null && <span>进价：€{it.purchase_price}</span>}
                                {it.prestashop_price != null && (
                                  <span style={{ color: hasPriceChanged(it) ? '#ef4444' : undefined, fontWeight: hasPriceChanged(it) ? 600 : 400 }}>
                                    网站价格：€{it.prestashop_price}
                                    {hasPriceChanged(it) && it.sale_price != null && `（与文件售价差 €${Math.abs(it.sale_price - it.prestashop_price).toFixed(2)}，以文件为准）`}
                                    {hasPriceSynced(it) && ' ✅ 已同步'}
                                  </span>
                                )}
                                {it.edit_date && <span>编辑日期：{it.edit_date}</span>}
                                {it.caja_status && <span>CAJA 状态：{it.caja_status}</span>}
                                {it.match_method && <span>匹配方式：{MATCH_METHOD_LABEL[it.match_method] || it.match_method}</span>}
                                {it.prestashop_product_id != null && <span>网站商品 ID：{it.prestashop_product_id}{it.upload_status === 'exists' ? '（网站原有）' : ''}</span>}
                                {it.price_sync_error && <span style={{ color: '#cf1322' }}>价格同步错误：{it.price_sync_error}</span>}
                                {it.upload_error && <span style={{ color: '#cf1322' }}>上传错误：{it.upload_error}</span>}
                                {!(it.name2 || it.purchase_price != null || it.edit_date || it.caja_status || it.prestashop_price != null) && <span>无更多字段</span>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 分页 */}
              {pagination && pagination.pages > 1 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                  <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>← 上一页</button>
                  <span style={{ color: 'var(--text-secondary)' }}>第 {page} / {pagination.pages} 页（共 {pagination.total.toLocaleString()} 条）</span>
                  <button type="button" className="btn btn-sm" disabled={page >= pagination.pages} onClick={() => goPage(page + 1)}>下一页 →</button>
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

export default CajaNewProductCheckModal;
