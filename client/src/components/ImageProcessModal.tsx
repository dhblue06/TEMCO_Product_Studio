import React, { useState } from 'react';
import './Modal.css';

const API_BASE = '/api';

interface ImageProcessModalProps {
  onClose: () => void;
}

const ImageProcessModal: React.FC<ImageProcessModalProps> = ({ onClose }) => {
  const [reference, setReference] = useState('');
  const [batchRefs, setBatchRefs] = useState('');
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleProcessSingle = async () => {
    if (!reference.trim()) return;
    setProcessing(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/images/process/${encodeURIComponent(reference.trim())}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || '处理失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handlePreview = async () => {
    if (!reference.trim()) return;
    setProcessing(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/images/preview/${encodeURIComponent(reference.trim())}`);
      const data = await res.json();
      if (data.success) {
        setResult({ preview: true, data: data.data });
      } else {
        setError(data.error || '获取预览失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleBatchProcess = async () => {
    const refs = batchRefs.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    if (refs.length === 0) return;
    setProcessing(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/images/process-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ references: refs }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || '批量处理失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🖼 图片处理 & ALT 生成</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            <strong>功能说明：</strong>
            <ul style={{ marginTop: 6, paddingLeft: 20 }}>
              <li>生成 SEO 文件名（如 <code>bpt1753-n-accesorio-movil-temco-1.jpg</code>）</li>
              <li>生成图片 ALT 文本（主图/附图各不同）</li>
              <li>sharp 处理：白底、居中、压缩、统一 1000x1000</li>
            </ul>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className={`btn btn-sm ${mode === 'single' ? 'btn-primary' : ''}`} onClick={() => setMode('single')}>单个处理</button>
            <button className={`btn btn-sm ${mode === 'batch' ? 'btn-primary' : ''}`} onClick={() => setMode('batch')}>批量处理</button>
          </div>

          {mode === 'single' && (
            <div>
              <div className="detail-field">
                <label>商品 Reference</label>
                <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="如 BPT1753-N" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={handlePreview} disabled={processing || !reference.trim()}>
                  {processing ? '加载中...' : '👁 预览'}
                </button>
                <button className="btn btn-primary" onClick={handleProcessSingle} disabled={processing || !reference.trim()}>
                  {processing ? '处理中...' : '🚀 处理图片 & 生成 ALT'}
                </button>
              </div>
            </div>
          )}

          {mode === 'batch' && (
            <div>
              <div className="detail-field">
                <label>商品 References（每行一个）</label>
                <textarea value={batchRefs} onChange={(e) => setBatchRefs(e.target.value)} rows={6} placeholder="BPT1753-N&#10;BPT1751-N" />
              </div>
              <button className="btn btn-primary" onClick={handleBatchProcess} disabled={processing || !batchRefs.trim()}>
                {processing ? '批量处理中...' : '🚀 批量处理'}
              </button>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: '#fff2f0', fontSize: 13 }}>
              ❌ {error}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 12 }}>
              {result.preview ? (
                <div>
                  <h4 style={{ fontSize: 13, marginBottom: 8 }}>预览结果</h4>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#fafafa' }}>
                        <th style={{ padding: 6, textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>原始文件名</th>
                        <th style={{ padding: 6, textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>SEO 文件名</th>
                        <th style={{ padding: 6, textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>ALT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.map((item: any, i: number) => (
                        <tr key={i}>
                          <td style={{ padding: 6, borderBottom: '1px solid var(--border-color)', fontFamily: 'monospace' }}>{item.originalName}</td>
                          <td style={{ padding: 6, borderBottom: '1px solid var(--border-color)', fontFamily: 'monospace' }}>{item.exportName}</td>
                          <td style={{ padding: 6, borderBottom: '1px solid var(--border-color)' }}>{item.alt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : result.message ? (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: '#f6ffed', fontSize: 13 }}>
                  ✅ {result.message}
                  {result.data?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {result.data.map((item: any, i: number) => (
                        <div key={i} style={{ marginBottom: 4, fontSize: 12 }}>
                          <code>{item.originalName}</code> → <code>{item.exportName}</code>
                          <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{item.alt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : result.data && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: '#f6ffed', fontSize: 13 }}>
                  批量处理完成
                  <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                    {Object.entries(result.data).map(([ref, info]: any) => (
                      <div key={ref} style={{ marginBottom: 4 }}>
                        <strong>{ref}</strong>: {info.status === 'ok' ? `✅ ${info.count} 张` : info.status === 'no_images' ? '⚠ 无图片' : `❌ ${info.error}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>关闭</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageProcessModal;
