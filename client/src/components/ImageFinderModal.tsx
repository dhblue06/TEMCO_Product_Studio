import React, { useState, useEffect } from 'react';

interface ImageFinderModalProps {
  refs: string[];
  onClose: () => void;
}

const ImageFinderModal: React.FC<ImageFinderModalProps> = ({ refs, onClose }) => {
  const [sourceFolder, setSourceFolder] = useState('');
  const [targetFolder, setTargetFolder] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState({ total: 0, found: 0, fileCount: 0 });
  const [copyMode, setCopyMode] = useState<'best' | 'all'>('best');

  // 加载已保存的文件夹路径
  useEffect(() => {
    fetch('/api/product-list-import/folder-settings').then(r => r.json()).then(d => {
      if (d.success && d.data) {
        if (d.data.sourceFolder) setSourceFolder(d.data.sourceFolder);
        if (d.data.targetFolder) setTargetFolder(d.data.targetFolder);
      }
    }).catch(() => {});
  }, []);

  const handleSearch = async () => {
    if (!sourceFolder.trim()) { setMessage('请输入源文件夹路径'); return; }
    // 保存路径
    fetch('/api/product-list-import/folder-settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ sourceFolder: sourceFolder.trim() }) }).catch(()=>{});
    setSearching(true); setMessage('');
    try {
      const res = await fetch('/api/product-list-import/find-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refs, sourceFolder: sourceFolder.trim() }),
      });
      const d = await res.json();
      if (d.success) {
        setResults(d.data.results);
        const totalFiles = d.data.results.filter((r: any) => r.found).reduce((s: number, r: any) => s + (r.files?.length || 0), 0);
        setStats({ total: d.data.total, found: d.data.found, fileCount: totalFiles });
        setMessage(`搜索完成：找到 ${d.data.found}/${d.data.total} 个产品有匹配图片（共 ${totalFiles} 张）`);
      } else {
        setMessage(d.error || '搜索失败');
      }
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleCopyAll = async () => {
    if (!targetFolder.trim()) { setMessage('请指定目标文件夹路径'); return; }
    const foundResults = results.filter(r => r.found);
    // 根据模式选择文件：best=每个产品只取第一个匹配，all=所有匹配
    const allFiles = copyMode === 'best'
      ? foundResults.map(r => r.files[0]).filter(Boolean)
      : foundResults.flatMap(r => r.files);
    if (allFiles.length === 0) { setMessage('没有找到可复制的图片'); return; }
    if (!window.confirm(`确定将 ${allFiles.length} 张图片复制到 ${targetFolder.trim()}？${copyMode === 'best' ? '（每个产品1张）' : ''}`)) return;
    fetch('/api/product-list-import/folder-settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ targetFolder: targetFolder.trim() }) }).catch(()=>{});
    setCopying(true); setMessage('');
    try {
      const res = await fetch('/api/product-list-import/copy-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: allFiles, targetFolder: targetFolder.trim() }),
      });
      const d = await res.json();
      if (d.success) {
        setMessage(`✅ 已复制 ${d.data.copied}/${d.data.total} 张图片到目标文件夹` +
          (d.data.errors?.length ? `\n${d.data.errors.join('\n')}` : ''));
      } else {
        setMessage(d.error || '复制失败');
      }
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <h3>🔍 按型号查找产品图片</h3>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ marginBottom: 12 }}>
            <div className="detail-field">
              <label>源文件夹（存放产品图片的目录）</label>
              <input value={sourceFolder} onChange={e => setSourceFolder(e.target.value)}
                placeholder={'C:\\Users\\...\\product_images'} style={{ width: '100%' }} />
            </div>
            <div className="detail-field">
              <label>目标文件夹（复制匹配图片到此处）</label>
              <input value={targetFolder} onChange={e => setTargetFolder(e.target.value)}
                placeholder={'C:\\Users\\...\\selected_images'} style={{ width: '100%' }} />
            </div>
            <button className="btn btn-primary" onClick={handleSearch} disabled={searching}
              style={{ width: '100%', justifyContent: 'center' }}>
              {searching ? '⏳ 搜索中...' : `🔍 搜索 ${refs.length} 个产品的图片`}
            </button>
          </div>

          {stats.total > 0 && (
            <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
              <div>找到 <strong>{stats.found}</strong> / {stats.total} 个产品的匹配图片（共 <strong>{stats.fileCount}</strong> 张）</div>
              <div style={{ marginTop: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
                <label style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="radio" checked={copyMode === 'best'} onChange={() => setCopyMode('best')} />
                  每产品1张（最佳匹配）
                </label>
                <label style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="radio" checked={copyMode === 'all'} onChange={() => setCopyMode('all')} />
                  全部 {stats.fileCount} 张
                </label>
                {stats.found > 0 && (
                  <button className="btn btn-sm" onClick={handleCopyAll} disabled={copying} style={{ marginLeft: 'auto' }}>
                    {copying ? '⏳ 复制中...' : '📋 一键复制'}
                  </button>
                )}
              </div>
            </div>
          )}

          {message && (
            <div style={{ padding: 8, marginBottom: 8, fontSize: 12, whiteSpace: 'pre-wrap',
              background: message.includes('✅') ? '#f0fdf4' : message.includes('❌') ? '#fef2f2' : '#fffbeb',
              borderRadius: 4 }}>{message}</div>
          )}

          {results.length > 0 && (
            <div style={{ maxHeight: 400, overflowY: 'auto', fontSize: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>编号</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>型号</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>状态</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>匹配文件</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '4px 8px', fontWeight: 500 }}>{r.ref}</td>
                      <td style={{ padding: '4px 8px' }}>{r.model || '-'}</td>
                      <td style={{ padding: '4px 8px' }}>
                        {r.found ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>✅ 找到</span> :
                         r.error ? <span style={{ color: 'var(--warning)' }}>⚠ {r.error}</span> :
                         <span style={{ color: 'var(--text-muted)' }}>❌ 未找到</span>}
                      </td>
                      <td style={{ padding: '4px 8px', fontSize: 11 }}>
                        {r.files?.map((f: any, j: number) => (
                          <div key={j} style={{ color: 'var(--text-secondary)' }}>{f.name}</div>
                        )) || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageFinderModal;
