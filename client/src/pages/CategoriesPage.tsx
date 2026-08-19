import React, { useState, useEffect, useCallback, useRef } from 'react';
import { categoriesApi } from '../services/api';
import { useConfirm } from '../components/ui/ConfirmProvider';

interface CategoriesPageProps {
  onClose: () => void;
}

const CategoriesPage: React.FC<CategoriesPageProps> = ({ onClose }) => {
  const { confirm } = useConfirm();
  const [tab, setTab] = useState<'categories' | 'images' | 'matching' | 'upload'>('categories');
  const [categories, setCategories] = useState<any[]>([]);
  const [images, setImages] = useState<any[]>([]);
  const [matchingResults, setMatchingResults] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [matchStatusFilter, setMatchStatusFilter] = useState('');
  const [parentFilter, setParentFilter] = useState('');
  const [parentList, setParentList] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [catPagination, setCatPagination] = useState<{ page: number; pageSize: number; total: number; totalPages: number }>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [selectedCatIds, setSelectedCatIds] = useState<Set<number>>(new Set());
  const [selectedMappingIds, setSelectedMappingIds] = useState<Set<number>>(new Set());
  const [scanDirInput, setScanDirInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 上传相关状态
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<any>(null);
  const [uploadBatchId, setUploadBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uploadCover, setUploadCover] = useState(true);
  const [uploadThumb, setUploadThumb] = useState(true);

  // 清理 polling
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setUploading(false);
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const showMessage = (msg: string, duration = 4000) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), duration);
  };

  // 获取分类列表
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await categoriesApi.getList({ search, matchStatus: matchStatusFilter, parentId: parentFilter || undefined, page, pageSize: 50 });
      if (res.success) {
        setCategories(res.data.categories);
        if (res.data.pagination) setCatPagination(res.data.pagination);
      }
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [search, matchStatusFilter, parentFilter, page]);

  // 获取统计
  const fetchStats = useCallback(async () => {
    try {
      const res = await categoriesApi.getStats();
      if (res.success) setStats(res.data);
    } catch {}
  }, []);

  // 获取父分类列表
  const fetchParents = useCallback(async () => {
    try {
      const res = await categoriesApi.getParents();
      if (res.success) setParentList(res.data);
    } catch {}
  }, []);

  // 获取图片列表
  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await categoriesApi.getImages({ pageSize: 200 });
      if (res.success) setImages(res.data.images);
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 获取匹配结果
  const fetchMatchingResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await categoriesApi.getMatchingResults({ pageSize: 500 });
      if (res.success) setMatchingResults(res.data.results);
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 获取批次列表
  const fetchBatches = useCallback(async () => {
    try {
      const res = await categoriesApi.getAllBatches();
      if (res.success) setBatches(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
    fetchParents();
    if (tab === 'categories') fetchCategories();
    else if (tab === 'images') fetchImages();
    else if (tab === 'matching') fetchMatchingResults();
    else if (tab === 'upload') fetchBatches();
  }, [tab, fetchCategories, fetchImages, fetchMatchingResults, fetchBatches, fetchStats, fetchParents]);

  // 导入 CSV
  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await categoriesApi.importCsv(file);
      showMessage(res.success ? `✅ ${res.message}` : `❌ ${res.error}`);
      if (res.success) { fetchCategories(); fetchStats(); }
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 从 PrestaShop 同步
  const handleSyncPrestashop = async () => {
    setLoading(true);
    try {
      const res = await categoriesApi.syncPrestashop();
      showMessage(res.success ? `✅ ${res.message}` : `❌ ${res.error}`);
      if (res.success) { fetchCategories(); fetchStats(); }
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 扫描图片
  const handleScanImages = async () => {
    setLoading(true);
    try {
      const res = await categoriesApi.scanImages(scanDirInput || undefined);
      showMessage(res.success ? `✅ ${res.message}` : `❌ ${res.error}`);
      if (res.success) { fetchImages(); fetchStats(); }
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 执行匹配
  const handleRunMatching = async () => {
    setLoading(true);
    try {
      const ids = selectedCatIds.size > 0 ? Array.from(selectedCatIds) : undefined;
      const res = await categoriesApi.runMatching(ids);
      showMessage(res.success ? `✅ ${res.message}` : `❌ ${res.error}`);
      if (res.success) { fetchMatchingResults(); fetchStats(); }
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 确认/拒绝映射
  const handleConfirmMapping = async (categoryId: number, categoryImageId: number) => {
    try {
      await categoriesApi.confirmMapping(categoryId, categoryImageId);
      fetchMatchingResults();
      showMessage('✅ 映射已确认');
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    }
  };

  const handleRejectMapping = async (categoryId: number, categoryImageId: number) => {
    try {
      await categoriesApi.rejectMapping(categoryId, categoryImageId);
      fetchMatchingResults();
      showMessage('映射已拒绝');
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    }
  };

  // 预检
  const handlePreviewUpload = async () => {
    setLoading(true);
    try {
      const res = await categoriesApi.previewUpload();
      if (res.success) {
        setUploadPreview(res.data);
        setShowUploadConfirm(true);
      } else {
        showMessage('❌ ' + (res.error || '预检失败'));
      }
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 创建并开始上传
  const handleCreateAndStartUpload = async () => {
    setLoading(true);
    try {
      const createRes = await categoriesApi.createUploadBatch();
      if (!createRes.success) {
        showMessage('❌ ' + (createRes.error || '创建批次失败'));
        setLoading(false);
        return;
      }
      const batchId = createRes.data.batchId;
      setUploadBatchId(batchId);

      const startRes = await categoriesApi.startUploadBatch(batchId);
      if (startRes.success) {
        showMessage(`🚀 ${startRes.message}`);
        stopPolling(); // 停掉旧的
        setUploading(true);
        setShowUploadConfirm(false);
        setTab('upload');
        // 开始轮询
        const interval = setInterval(async () => {
          try {
            const s = await categoriesApi.getBatchStatus(batchId);
            if (s.success) {
              setBatchStatus(s.data);
              if (s.data.queued === 0 && s.data.processing === 0) {
                stopPolling();
                showMessage('✅ 上传批次已完成');
              }
            }
          } catch {}
        }, 2000);
        pollRef.current = interval;
      } else {
        showMessage('❌ ' + (startRes.message || '启动失败'));
      }
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 重试失败
  const handleRetryFailed = async (batchId: string) => {
    try {
      const res = await categoriesApi.retryFailedJobs(batchId);
      showMessage(res.success ? `✅ ${res.message}` : '❌ 重试失败');
      fetchBatches();
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    }
  };

  // 手动映射 — 选图到分类
  const handleManualMap = async (categoryId: number, imageId: number) => {
    try {
      await categoriesApi.manualMap(categoryId, imageId);
      fetchMatchingResults();
      showMessage('✅ 人工映射已保存');
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    }
  };

  const handleIgnoreImage = async (id: number, ignored: boolean) => {
    try {
      await categoriesApi.ignoreImage(id, ignored);
      fetchImages();
    } catch (err: any) {
      showMessage('❌ ' + err.message);
    }
  };

  // 切换选中
  const toggleSelectCat = (id: number) => {
    setSelectedCatIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // 全选（分类列表用, 基于 categories）
  const selectAllCat = () => {
    setSelectedCatIds(new Set(categories.map(c => c.id)));
  };
  // 全选（匹配管理用, 基于 matchingResults）
  const selectAllMatching = () => {
    setSelectedMappingIds(new Set(matchingResults.map(r => r.id)));
  };
  const deselectAllCat = () => {
    setSelectedCatIds(new Set());
    setSelectedMappingIds(new Set());
  };

  // 批量确认匹配
  const handleBatchConfirm = async () => {
    const toConfirm = matchingResults.filter(r => selectedMappingIds.has(r.id));
    for (const m of toConfirm) {
      if (m.status === 'suggested' || m.status === 'conflict') {
        await categoriesApi.confirmMapping(m.category_id, m.category_image_id).catch(() => {});
      }
    }
    fetchMatchingResults();
    setSelectedMappingIds(new Set());
    showMessage(`✅ 已确认 ${toConfirm.length} 条映射`);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'confirmed': return '#52c41a';
      case 'suggested': return '#1677ff';
      case 'conflict': return '#fa8c16';
      case 'rejected': return '#ff4d4f';
      case 'ignored': return '#d9d9d9';
      default: return '#999';
    }
  };

  const matchTypeLabel = (t: string) => {
    switch (t) {
      case 'exact': return '精确匹配';
      case 'alias': return '别名匹配';
      case 'fuzzy': return '模糊匹配';
      case 'manual': return '人工映射';
      default: return t;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: '95vw', height: '90vh', maxWidth: 1400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📂 分类图片管理</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {stats && (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                分类 {stats.total} | 已匹配 {stats.matched} | 已确认 {stats.confirmed} | 图片 {stats.totalImages} | 已上传 {stats.uploaded}
              </span>
            )}
            <button className="btn" onClick={onClose}>✕ 关闭</button>
          </div>
        </div>

        {message && (
          <div style={{ padding: '8px 16px', background: message.startsWith('✅') ? '#f6ffed' : message.startsWith('🚀') ? '#e6f7ff' : '#fff2f0', borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>{message}</div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', padding: '0 16px' }}>
          {(['categories', 'images', 'matching', 'upload'] as const).map(t => (
            <button key={t}
              onClick={() => { setTab(t); setPage(1); setSelectedCatIds(new Set()); setSelectedMappingIds(new Set()); }}
              style={{
                padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: tab === t ? 600 : 400,
                color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -2,
              }}>
              {t === 'categories' ? '分类列表' : t === 'images' ? '图片库' : t === 'matching' ? '匹配管理' : '上传任务'}
            </button>
          ))}
        </div>

        {/* 分类列表 Tab */}
        {tab === 'categories' && (
          <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="search-input" style={{ width: 300 }} placeholder="搜索分类名/ID..." value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }} />
              <select value={matchStatusFilter} onChange={e => { setMatchStatusFilter(e.target.value); setPage(1); }}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-color)' }}>
                <option value="">全部匹配状态</option>
                <option value="matched">已匹配</option>
                <option value="unmatched">未匹配</option>
                <option value="conflict">冲突</option>
              </select>
              <select value={parentFilter} onChange={e => { setParentFilter(e.target.value); setPage(1); }}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-color)', minWidth: 160 }}>
                <option value="">📂 全部分类</option>
                <option value="root">🏠 根分类</option>
                {parentList.map((p: any) => (
                  <option key={p.prestashop_category_id} value={p.prestashop_category_id}>
                    {p.name} ({p.child_count})
                  </option>
                ))}
              </select>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportCsv} style={{ display: 'none' }} />
              <button className="btn btn-sm" onClick={() => fileInputRef.current?.click()}>📥 导入CSV</button>
              <button className="btn btn-sm" onClick={handleSyncPrestashop} disabled={loading}>🔄 同步PrestaShop</button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={selectAllCat}>全选</button>
                <button className="btn btn-sm" onClick={deselectAllCat}>取消全选</button>
                {selectedCatIds.size > 0 && (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: '28px' }}>已选 {selectedCatIds.size}</span>
                    <button className="btn btn-sm" style={{ background: 'var(--accent)', color: 'white', border: 'none', fontWeight: 600 }}
                      onClick={() => setTab('matching')}>
                      ✅ 确认 → 去匹配
                    </button>
                  </>
                )}
              </div>
            </div>

            <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}> </th>
                  <th>分类ID</th>
                  <th>分类名称</th>
                  <th>分类路径</th>
                  <th>匹配状态</th>
                  <th>匹配图片</th>
                  <th>上传状态</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id} style={{ background: selectedCatIds.has(c.id) ? 'var(--accent-light)' : undefined }}>
                    <td><input type="checkbox" checked={selectedCatIds.has(c.id)} onChange={() => toggleSelectCat(c.id)} /></td>
                    <td style={{ fontFamily: 'monospace' }}>{c.prestashop_category_id}</td>
                    <td><strong>{c.name}</strong></td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.full_path || c.parent_name || (c.parent_id === 0 ? '🏠 Raíz' : '-')}
                    </td>
                    <td>
                      <span style={{ color: statusColor(c.mapping_status), fontWeight: 500 }}>
                        {c.mapping_status === 'confirmed' ? '已确认' :
                         c.mapping_status === 'suggested' ? '匹配建议' :
                         c.mapping_status === 'conflict' ? '⚠ 冲突' : '未匹配'}
                      </span>
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.image_filename || '-'}
                    </td>
                    <td>
                      {c.upload_success_count > 0 ? (
                        <span style={{ color: '#52c41a' }}>✅ {c.last_upload_at?.slice(0, 10)}</span>
                      ) : (
                        <span style={{ color: '#999' }}>未上传</span>
                      )}
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    暂无分类数据，请导入 CSV 或同步 PrestaShop
                  </td></tr>
                )}
              </tbody>
            </table>
            <div className="pagination" style={{ marginTop: 12 }}>
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</button>
              <span className="pagination-info">第 {catPagination.page} / {catPagination.totalPages} 页 (共 {catPagination.total} 条)</span>
              <button disabled={page >= catPagination.totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
            </div>
          </div>
        )}

        {/* 图片库 Tab */}
        {tab === 'images' && (
          <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <input className="search-input" style={{ width: 300 }} placeholder="扫描目录路径（留空用默认）..."
                value={scanDirInput} onChange={e => setScanDirInput(e.target.value)} />
              <button className="btn btn-sm" onClick={handleScanImages} disabled={loading}>🔍 扫描图片</button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>共 {images.length} 张图片</span>
              <div style={{ marginLeft: 'auto' }}>
                <button className="btn btn-sm" style={{ color: '#ff4d4f' }}
                  onClick={async () => {
                    const ok = await confirm('确定清空全部图片记录？注意：已确认的映射也会被清除。', { title: '清空图片记录', danger: true });
                    if (!ok) return;
                    try {
                      const res = await categoriesApi.clearImages();
                      showMessage(res.success ? `✅ ${res.message}` : `❌ ${res.error}`);
                      if (res.success) { fetchImages(); fetchMatchingResults(); fetchStats(); }
                    } catch (err: any) { showMessage('❌ ' + err.message); }
                  }}>🗑 清空</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {images.map(img => (
                <div key={img.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 8, background: img.ignored ? '#f5f5f5' : 'white' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, wordBreak: 'break-all' }}>{img.filename}</div>
                  {img.category_name && (
                    <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 4 }}>→ {img.category_name}</div>
                  )}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {img.mapping_status && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: statusColor(img.mapping_status) + '20', color: statusColor(img.mapping_status) }}>
                        {img.mapping_status}
                      </span>
                    )}
                    <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                      onClick={() => handleIgnoreImage(img.id, !img.ignored)}>
                      {img.ignored ? '恢复' : '忽略'}
                    </button>
                  </div>
                </div>
              ))}
              {images.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  暂无图片，请先扫描分类图片目录
                </div>
              )}
            </div>
          </div>
        )}

        {/* 匹配管理 Tab */}
        {tab === 'matching' && (
          <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <button className="btn btn-sm" onClick={handleRunMatching} disabled={loading}>
                🔗 {selectedCatIds.size > 0 ? `匹配选中 (${selectedCatIds.size})` : '自动匹配全部'}</button>
              {selectedMappingIds.size > 0 && (
                <button className="btn btn-sm" onClick={handleBatchConfirm}>✅ 批量确认 ({selectedMappingIds.size})</button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={selectAllMatching}>全选</button>
                <button className="btn btn-sm" onClick={deselectAllCat}>取消全选</button>
                {selectedMappingIds.size > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: '28px' }}>已选 {selectedMappingIds.size}</span>}
              </div>
            </div>

            <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}> </th>
                  <th>分类ID</th>
                  <th>分类名称</th>
                  <th>匹配类型</th>
                  <th>置信度</th>
                  <th>匹配图片</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {matchingResults.map(r => (
                  <tr key={r.id} style={{ background: selectedMappingIds.has(r.id) ? 'var(--accent-light)' : undefined }}>
                    <td><input type="checkbox" checked={selectedMappingIds.has(r.id)} onChange={() => {
                      setSelectedMappingIds(prev => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                        return next;
                      });
                    }} /></td>
                    <td style={{ fontFamily: 'monospace' }}>{r.prestashop_category_id}</td>
                    <td><strong>{r.category_name}</strong></td>
                    <td>{matchTypeLabel(r.match_type)}</td>
                    <td>{(r.confidence * 100).toFixed(0)}%</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.image_filename}
                    </td>
                    <td>
                      <span style={{ color: statusColor(r.status), fontWeight: 500 }}>
                        {r.status === 'confirmed' ? '已确认' :
                         r.status === 'suggested' ? '匹配建议' :
                         r.status === 'conflict' ? '⚠ 冲突' : r.status}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {(r.status === 'suggested' || r.status === 'conflict') && (
                        <button className="btn btn-sm" style={{ fontSize: 11, marginRight: 4, background: '#52c41a', color: 'white', border: 'none' }}
                          onClick={() => handleConfirmMapping(r.category_id, r.category_image_id)}>确认</button>
                      )}
                      {r.status !== 'rejected' && (
                        <button className="btn btn-sm" style={{ fontSize: 11, background: '#ff4d4f', color: 'white', border: 'none' }}
                          onClick={() => handleRejectMapping(r.category_id, r.category_image_id)}>拒绝</button>
                      )}
                    </td>
                  </tr>
                ))}
                {matchingResults.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    暂无匹配结果，请先执行自动匹配
                  </td></tr>
                )}
              </tbody>
            </table>

            {/* 快捷上传入口 */}
            <div style={{ marginTop: 16, padding: 12, background: '#fafafa', borderRadius: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
              <button className="btn" onClick={handlePreviewUpload} disabled={loading}>🔍 预检 (Dry Run)</button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>检查所有已确认映射的图片和分类是否准备就绪</span>
            </div>
          </div>
        )}

        {/* 上传任务 Tab */}
        {tab === 'upload' && (
          <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <button className="btn" onClick={handlePreviewUpload} disabled={loading}>🔍 预检</button>
              <button className="btn" onClick={handlePreviewUpload} style={{ background: '#52c41a', color: 'white', border: 'none' }}>
                🚀 批量上传
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>刷新按钮查看最新状态</span>
              <button className="btn btn-sm" onClick={() => { fetchBatches(); if (uploadBatchId) categoriesApi.getBatchStatus(uploadBatchId).then(r => r.success && setBatchStatus(r.data)); }}>
                🔄 刷新
              </button>
            </div>

            {/* 当前批次状态 */}
            {batchStatus && (
              <div style={{ marginBottom: 16, padding: 12, background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>📊 批次 {batchStatus.batchId}</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                  <span>总计: {batchStatus.total}</span>
                  <span style={{ color: '#52c41a' }}>成功: {batchStatus.success}</span>
                  <span style={{ color: '#ff4d4f' }}>失败: {batchStatus.failed}</span>
                  <span style={{ color: '#1677ff' }}>队列: {batchStatus.queued}</span>
                  <span style={{ color: '#fa8c16' }}>处理中: {batchStatus.processing}</span>
                </div>
                {batchStatus.queued === 0 && batchStatus.processing === 0 && (
                  <div style={{ marginTop: 8 }}>
                    {batchStatus.failed > 0 && (
                      <button className="btn btn-sm" style={{ background: '#fa8c16', color: 'white', border: 'none' }}
                        onClick={() => handleRetryFailed(batchStatus.batchId)}>🔁 重试失败项 ({batchStatus.failed})</button>
                    )}
                    <a href={categoriesApi.getBatchLogsCsvUrl(batchStatus.batchId)} target="_blank" rel="noreferrer"
                      className="btn btn-sm" style={{ marginLeft: 8 }}>📥 导出日志CSV</a>
                  </div>
                )}
              </div>
            )}

            {/* 历史批次 */}
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>历史批次</div>
            <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th>批次ID</th>
                  <th>总数</th>
                  <th>成功</th>
                  <th>失败</th>
                  <th>队列/处理中</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.batch_id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{b.batch_id}</td>
                    <td>{b.total}</td>
                    <td style={{ color: '#52c41a' }}>{b.success}</td>
                    <td style={{ color: b.failed > 0 ? '#ff4d4f' : '#999' }}>{b.failed}</td>
                    <td>{b.queued > 0 && `${b.queued}等待 `}{b.processing > 0 && `${b.processing}处理中`}{b.queued === 0 && b.processing === 0 && '-'}</td>
                    <td>{b.created_at?.slice(0, 16)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm" style={{ fontSize: 11 }}
                        onClick={async () => {
                          const s = await categoriesApi.getBatchStatus(b.batch_id);
                          if (s.success) setBatchStatus(s.data);
                        }}>查看</button>
                      {b.failed > 0 && (
                        <button className="btn btn-sm" style={{ fontSize: 11, marginLeft: 4, background: '#fa8c16', color: 'white', border: 'none' }}
                          onClick={() => handleRetryFailed(b.batch_id)}>重试失败</button>
                      )}
                      <a href={categoriesApi.getBatchLogsCsvUrl(b.batch_id)} target="_blank" rel="noreferrer"
                        className="btn btn-sm" style={{ marginLeft: 4 }}>CSV</a>
                    </td>
                  </tr>
                ))}
                {batches.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    暂无上传批次
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 上传确认弹窗 */}
      {showUploadConfirm && uploadPreview && (
        <div className="modal-overlay" onClick={() => setShowUploadConfirm(false)}>
          <div className="modal-content" style={{ width: 500, padding: 24 }} onClick={e => e.stopPropagation()}>
            <h3>📤 上传确认</h3>
            <div style={{ margin: '16px 0', lineHeight: 1.8 }}>
              <div>总计检查: <strong>{uploadPreview.total}</strong> 项</div>
              {uploadPreview.ready > 0 && <div style={{ color: '#52c41a' }}>✅ 待上传（仅已确认的映射）: <strong>{uploadPreview.ready}</strong></div>}
              {uploadPreview.unmatched > 0 && <div style={{ color: '#fa8c16' }}>⚠ 未匹配（跳过）: <strong>{uploadPreview.unmatched}</strong></div>}
              {uploadPreview.conflict > 0 && <div style={{ color: '#fa8c16' }}>⚠ 冲突（跳过，仅上传已确认）: <strong>{uploadPreview.conflict}</strong></div>}
              {uploadPreview.invalidFile > 0 && <div style={{ color: '#ff4d4f' }}>❌ 无效文件: <strong>{uploadPreview.invalidFile}</strong></div>}
            </div>
            {!uploadPreview.canStart && (
              <div style={{ padding: 12, background: '#fff2f0', borderRadius: 6, marginBottom: 12, fontSize: 13, color: '#ff4d4f' }}>
                {uploadPreview.invalidFile > 0 
                  ? `⚠ 有 ${uploadPreview.invalidFile} 个图片文件无法读取，请检查文件是否存在` 
                  : uploadPreview.ready === 0 
                    ? '⚠ 没有可上传的映射。请先在匹配管理中确认映射' 
                    : '⚠ 无法开始上传'}
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                <input type="checkbox" checked={uploadCover} onChange={e => setUploadCover(e.target.checked)} />
                {' '}上传封面图 (Webservice)
              </label>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                <input type="checkbox" checked={uploadThumb} onChange={e => setUploadThumb(e.target.checked)} />
                {' '}上传缩略图 (FTP)
              </label>
              <div style={{ height: 1, background: 'var(--border-color)', margin: '8px 0' }} />
              <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                <input type="checkbox" /> 我已检查分类与图片映射
              </label>
              <label style={{ fontSize: 13, display: 'block' }}>
                <input type="checkbox" /> 我确认上传会替换对应分类的当前图片
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowUploadConfirm(false)}>取消</button>
              <button className="btn" onClick={handleCreateAndStartUpload}
                disabled={!uploadPreview.canStart || loading}
                style={{ background: '#52c41a', color: 'white', border: 'none' }}>
                🚀 开始上传
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesPage;
