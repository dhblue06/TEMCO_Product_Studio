import React, { useState, useEffect, useCallback } from 'react';

const API = '/api/product-images';

async function req(url: string, opts?: RequestInit) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return r.json();
}

const ProductImagesPage: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<'images' | 'matching' | 'upload'>('images');
  const [images, setImages] = useState<any[]>([]);
  const [matching, setMatching] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [stats, setStats] = useState<any>({});
  const [scanDir, setScanDir] = useState('');
  const [batchId, setBatchId] = useState('');
  const [batchStatus, setBatchStatus] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try { const r = await req(`${API}?pageSize=200`); if (r.success) setImages(r.data.images); }
    catch (e: any) { showMsg('❌ ' + e.message); }
    finally { setLoading(false); }
  }, []);

  const fetchMatching = useCallback(async () => {
    try { const r = await req(`${API}/matching/results`); if (r.success) setMatching(r.data.results); } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try { const r = await req(`${API}/stats`); if (r.success) setStats(r.data); } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
    if (tab === 'images') fetchImages();
    else if (tab === 'matching') fetchMatching();
  }, [tab, fetchImages, fetchMatching, fetchStats]);

  const handleScan = async () => {
    setLoading(true);
    try { const r = await req(`${API}/scan`, { method: 'POST', body: JSON.stringify({ directory: scanDir }) }); showMsg(r.success ? `✅ ${r.message}` : `❌ ${r.error}`); if (r.success) { fetchImages(); fetchStats(); } }
    catch (e: any) { showMsg('❌ ' + e.message); }
    finally { setLoading(false); }
  };

  const handleMatch = async () => {
    setLoading(true);
    try { const r = await req(`${API}/matching/run`, { method: 'POST' }); showMsg(r.success ? `✅ ${r.message}` : `❌ ${r.error}`); if (r.success) { fetchMatching(); fetchStats(); } }
    catch (e: any) { showMsg('❌ ' + e.message); }
    finally { setLoading(false); }
  };

  const handleConfirm = async (pid: number, sid: number) => {
    await req(`${API}/matching/confirm`, { method: 'POST', body: JSON.stringify({ productId: pid, scanImageId: sid }) });
    fetchMatching();
  };

  const handleReject = async (pid: number, sid: number) => {
    await req(`${API}/matching/reject`, { method: 'POST', body: JSON.stringify({ productId: pid, scanImageId: sid }) });
    fetchMatching();
  };

  const handleUpload = async () => {
    setLoading(true);
    try {
      const c = await req(`${API}/uploads/create`, { method: 'POST' });
      if (!c.success) { showMsg('❌ ' + c.error); return; }
      setBatchId(c.data.batchId);
      const s = await req(`${API}/uploads/${c.data.batchId}/start`, { method: 'POST' });
      showMsg(s.success ? `🚀 ${s.message}` : '❌ ' + s.message);
      if (s.success) {
        setTab('upload');
        const poll = setInterval(async () => {
          const status = await req(`${API}/uploads/${c.data.batchId}`);
          if (status.success) {
            setBatchStatus(status.data);
            if (status.data.queued === 0 && status.data.processing === 0) { clearInterval(poll); showMsg('✅ 上传完成'); }
          }
        }, 2000);
      }
    } catch (e: any) { showMsg('❌ ' + e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: '95vw', height: '90vh', maxWidth: 1400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📦 产品图片管理</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>图片 {stats.total || 0} | 已匹配 {stats.matched || 0}</span>
            <button className="btn" onClick={onClose}>✕</button>
          </div>
        </div>
        {msg && <div style={{ padding: '8px 16px', background: msg.startsWith('✅') || msg.startsWith('🚀') ? '#f6ffed' : '#fff2f0', borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>{msg}</div>}

        <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', padding: '0 16px' }}>
          {(['images', 'matching', 'upload'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setSelectedIds(new Set()); }}
              style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: tab === t ? 600 : 400, color: tab === t ? 'var(--accent)' : 'var(--text-secondary)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -2 }}>
              {t === 'images' ? '图片库' : t === 'matching' ? '匹配管理' : '上传任务'}
            </button>
          ))}
        </div>

        {tab === 'images' && (
          <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <input className="search-input" style={{ width: 350 }} placeholder="图片目录路径（留空用默认）" value={scanDir} onChange={e => setScanDir(e.target.value)} />
              <button className="btn btn-sm" onClick={handleScan} disabled={loading}>🔍 扫描</button>
              <div style={{ marginLeft: 'auto' }}>
                <button className="btn btn-sm" style={{ color: '#ff4d4f' }} onClick={async () => {
                  if (!confirm('清空全部产品图片？')) return;
                  await req(`${API}/clear`, { method: 'POST' });
                  fetchImages(); fetchStats();
                }}>🗑 清空</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {images.map(img => (
                <div key={img.id} style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: 8, background: img.mapping_status ? '#f6ffed' : 'white' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, wordBreak: 'break-all' }}>{img.filename}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {img.extracted_model && <span style={{ background: '#e6f7ff', padding: '1px 4px', borderRadius: 3, marginRight: 4 }}>{img.extracted_model}</span>}
                    {img.extracted_serial && <span style={{ background: '#fff7e6', padding: '1px 4px', borderRadius: 3, marginRight: 4 }}>#{img.extracted_serial}</span>}
                  </div>
                  {img.reference && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>→ {img.reference}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'matching' && (
          <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="btn btn-sm" onClick={handleMatch} disabled={loading}>🔗 自动匹配</button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setSelectedIds(new Set(matching.map(r => r.id)))}>全选</button>
                <button className="btn btn-sm" onClick={() => setSelectedIds(new Set())}>取消全选</button>
                {selectedIds.size > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: '28px' }}>{selectedIds.size}</span>}
              </div>
              {selectedIds.size > 0 && <button className="btn btn-sm" style={{ background: '#52c41a', color: 'white', border: 'none' }} onClick={async () => {
                for (const mid of selectedIds) {
                  const m = matching.find(r => r.id === mid);
                  if (m && (m.status === 'suggested' || m.status === 'conflict')) await handleConfirm(m.product_id, m.scan_image_id);
                }
                setSelectedIds(new Set()); fetchMatching();
              }}>✅ 批量确认 ({selectedIds.size})</button>}
            </div>
            <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
              <thead><tr><th style={{ width: 40 }}></th><th>图片</th><th>匹配产品</th><th>类型</th><th>置信度</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {matching.map(r => (
                  <tr key={r.id} style={{ background: selectedIds.has(r.id) ? 'var(--accent-light)' : undefined }}>
                    <td><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => setSelectedIds(prev => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} /></td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.filename}</td>
                    <td><strong>{r.reference || r.product_name}</strong></td>
                    <td>{r.match_type === 'serial_exact' ? '序列号' : r.match_type === 'model_exact' ? '型号' : r.match_type === 'name_contains' ? '品名包含' : r.match_type}</td>
                    <td>{Math.round(r.confidence * 100)}%</td>
                    <td><span style={{ color: r.status === 'confirmed' ? '#52c41a' : r.status === 'conflict' ? '#fa8c16' : '#1677ff' }}>{r.status === 'confirmed' ? '已确认' : r.status === 'conflict' ? '⚠冲突' : '建议'}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {(r.status === 'suggested' || r.status === 'conflict') && <button className="btn btn-sm" style={{ fontSize: 11, background: '#52c41a', color: 'white', border: 'none' }} onClick={() => handleConfirm(r.product_id, r.scan_image_id)}>确认</button>}
                      <button className="btn btn-sm" style={{ fontSize: 11, background: '#ff4d4f', color: 'white', border: 'none', marginLeft: 4 }} onClick={() => handleReject(r.product_id, r.scan_image_id)}>拒绝</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12 }}><button className="btn" onClick={handleUpload} disabled={loading}>🚀 批量上传</button></div>
          </div>
        )}

        {tab === 'upload' && (
          <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="btn" onClick={handleUpload} disabled={loading} style={{ background: '#52c41a', color: 'white', border: 'none' }}>🚀 批量上传</button>
              {batchId && <button className="btn btn-sm" onClick={async () => {
                const r = await req(`${API}/uploads/${batchId}`);
                if (r.success) setBatchStatus(r.data);
              }}>🔄 刷新</button>}
            </div>
            {batchStatus && (
              <div style={{ padding: 12, background: '#f6ffed', borderRadius: 6, marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>📊 {batchStatus.batchId}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, marginTop: 4 }}>
                  <span>总计: {batchStatus.total}</span>
                  <span style={{ color: '#52c41a' }}>成功: {batchStatus.success}</span>
                  <span style={{ color: '#ff4d4f' }}>失败: {batchStatus.failed}</span>
                  <span>队列: {batchStatus.queued}</span>
                </div>
                {batchStatus.failed > 0 && batchStatus.queued === 0 && <button className="btn btn-sm" style={{ marginTop: 8, background: '#fa8c16', color: 'white', border: 'none' }} onClick={async () => {
                  await req(`${API}/uploads/${batchStatus.batchId}/retry-failed`, { method: 'POST' });
                }}>🔁 重试失败项</button>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductImagesPage;
