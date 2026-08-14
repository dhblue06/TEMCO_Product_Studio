// 电脑采集审核页面（文档 15）
import React, { useCallback, useEffect, useState } from 'react';
import { mobileCaptureApi } from '../services/api';
import { MobileCaptureListItem, ReviewStats } from '../types/mobileCapture';
import CaptureTaskCard from '../components/mobileCapture/CaptureTaskCard';
import CaptureReviewPanel from '../components/mobileCapture/CaptureReviewPanel';

interface Props {
  onClose: () => void;
}

export default function MobileCaptureReviewPage({ onClose }: Props) {
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [captures, setCaptures] = useState<MobileCaptureListItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // 筛选
  const [date, setDate] = useState('');
  const [operator, setOperator] = useState('');
  const [captureStatus, setCaptureStatus] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // 批量选择与删除
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const toggleCheck = (id: number) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCheckAll = () => {
    if (checkedIds.size === captures.length && captures.length > 0) setCheckedIds(new Set());
    else setCheckedIds(new Set(captures.map(c => c.id)));
  };

  const batchDelete = async () => {
    if (checkedIds.size === 0) { alert('请先选择要删除的任务'); return; }
    const names = captures.filter(c => checkedIds.has(c.id)).map(c => c.product_name || c.reference).join('、');
    if (!window.confirm(`确定删除选中的 ${checkedIds.size} 个采集任务吗？\n\n${names}\n\n将同时删除任务下的照片记录、颜色、库存、备注（未被推送的照片文件也会删除）。此操作不可恢复。`)) return;
    setDeleting(true);
    try {
      const res = await mobileCaptureApi.batchDeleteCaptures(Array.from(checkedIds));
      if (res.success) {
        alert(res.message || '已删除');
        setCheckedIds(new Set());
        if (selectedId && checkedIds.has(selectedId)) setSelectedId(null);
        loadList();
        loadStats();
      } else {
        alert(res.error || '删除失败');
      }
    } catch (e: any) {
      alert('删除失败: ' + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const loadStats = useCallback(async () => {
    try {
      const res = await mobileCaptureApi.getStats();
      if (res.success) setStats(res.data);
    } catch { /* ignore */ }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mobileCaptureApi.reviewCaptures({ date, operator, captureStatus, syncStatus, search, page, pageSize: 20 });
      if (res.success) {
        setCaptures(res.data.captures || []);
        setPagination(res.data.pagination);
      }
    } catch (e: any) {
      alert('加载列表失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [date, operator, captureStatus, syncStatus, search, page]);

  useEffect(() => { loadStats(); loadList(); }, [loadStats, loadList]);

  // 自动刷新：手机端有新登记时列表自动出现（每 15 秒静默刷新）
  useEffect(() => {
    const t = window.setInterval(() => { loadList(); loadStats(); }, 15000);
    return () => window.clearInterval(t);
  }, [loadList, loadStats]);

  const StatCard = ({ label, value, color = 'var(--text-primary)' }: { label: string; value: number; color?: string }) => (
    <div style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', textAlign: 'center', minWidth: 76 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-primary)', zIndex: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 顶栏 */}
      <div style={{ padding: '10px 20px', background: 'var(--accent)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>🧾 手机采集审核 <span style={{ fontSize: 11, fontWeight: 400, opacity: .85, marginLeft: 6 }}>每 15 秒自动刷新，手机新登记自动出现</span></span>
        <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>关闭</button>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden', flex: 1 }}>
        {/* 15.1 顶部统计 */}
        {stats && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            <StatCard label="今日采集" value={stats.todayCaptures} />
            <StatCard label="待审核" value={stats.pendingReview} color="#3b82f6" />
            <StatCard label="待补拍" value={stats.pendingRephotograph} color="#ef4444" />
            <StatCard label="待处理图片" value={stats.pendingImages} color="#f59e0b" />
            <StatCard label="待确认颜色" value={stats.pendingColors} />
            <StatCard label="待确认库存" value={stats.pendingInventory} />
            <StatCard label="待生成变体" value={stats.pendingDrafts} />
            <StatCard label="可同步" value={stats.readyToSync} color="#059669" />
            <StatCard label="已同步" value={stats.synced} color="#0d9488" />
          </div>
        )}

        {/* 15.2 筛选 */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={date} onChange={e => { setDate(e.target.value); setPage(1); }} style={filterStyle} />
          <input value={operator} onChange={e => { setOperator(e.target.value); setPage(1); }} placeholder="操作员" style={filterStyle} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="产品/Reference/序列号" style={{ ...filterStyle, minWidth: 160 }} />
          <select value={captureStatus} onChange={e => { setCaptureStatus(e.target.value); setPage(1); }} style={filterStyle}>
            <option value="">全部状态</option>
            <option value="submitted">待审核</option>
            <option value="reviewing">审核中</option>
            <option value="approved">审核通过</option>
            <option value="rejected">退回补采</option>
            <option value="ready">可同步</option>
            <option value="synced">已同步</option>
            <option value="draft">草稿</option>
          </select>
          <select value={syncStatus} onChange={e => { setSyncStatus(e.target.value); setPage(1); }} style={filterStyle}>
            <option value="">全部同步状态</option>
            <option value="none">未推送</option>
            <option value="pushed">已推送</option>
            <option value="ready">可同步</option>
            <option value="synced">已同步</option>
          </select>
          <button type="button" className="btn btn-sm" onClick={() => { loadStats(); loadList(); }}>🔄 刷新</button>
        </div>

        {/* 批量操作工具栏 */}
        {captures.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: checkedIds.size > 0 ? 'rgba(245,158,11,.1)' : 'var(--bg-secondary)', border: `1px solid ${checkedIds.size > 0 ? '#f59e0b' : 'var(--border-color)'}` }}>
            <label style={{ fontSize: 12, color: 'var(--text-primary)', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={captures.length > 0 && checkedIds.size === captures.length} onChange={toggleCheckAll} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)' }} />
              全选本页
            </label>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>已选 {checkedIds.size} 项</span>
            <div style={{ flex: 1 }} />
            {checkedIds.size > 0 && (
              <>
                <button type="button" className="btn btn-sm" onClick={() => setCheckedIds(new Set())}>取消选择</button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={batchDelete}
                  disabled={deleting}
                  style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
                >
                  {deleting ? '删除中...' : `🗑 删除选中（${checkedIds.size}）`}
                </button>
              </>
            )}
          </div>
        )}

        {/* 列表 + 详情 */}
        <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'hidden' }}>
          <div style={{ width: selectedId ? '38%' : '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, transition: 'width .2s' }}>
            {loading && captures.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>加载中...</div>}
            {!loading && captures.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无采集任务</div>}
            {captures.map(c => (
              <CaptureTaskCard
                key={c.id}
                capture={c}
                selected={selectedId === c.id}
                checked={checkedIds.has(c.id)}
                onToggleCheck={() => toggleCheck(c.id)}
                onClick={() => setSelectedId(c.id)}
              />
            ))}
            {/* 分页 */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: 8 }}>
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                {pagination.page}/{pagination.totalPages || 1}（共 {pagination.total}）
              </span>
              <button className="btn btn-sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
            </div>
          </div>

          {selectedId && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
              <CaptureReviewPanel
                captureId={selectedId}
                onBack={() => setSelectedId(null)}
                onChanged={() => { loadList(); loadStats(); }}
                onPushed={(msg) => alert(msg)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const filterStyle: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 12,
  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
};

