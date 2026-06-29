import React, { useState, useEffect } from 'react';
import './Modal.css';

const API_BASE = '/api';

interface CopyGenerationModalProps {
  onClose: () => void;
}

const CopyGenerationModal: React.FC<CopyGenerationModalProps> = ({ onClose }) => {
  const [mode, setMode] = useState<'config' | 'single' | 'batch'>('config');
  const [configInfo, setConfigInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reference, setReference] = useState('');
  const [batchRefs, setBatchRefs] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/copy/config`);
      const data = await res.json();
      if (data.success) setConfigInfo(data.data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSingle = async () => {
    if (!reference.trim()) return;
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/copy/generate/${encodeURIComponent(reference.trim())}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || '生成失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateBatch = async () => {
    const refs = batchRefs
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    if (refs.length === 0) return;

    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/copy/generate-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ references: refs }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || '批量生成失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-body"><div className="loading">加载中...</div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📝 双语文案生成</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* 配置状态 */}
          <div style={{
            padding: '8px 12px', borderRadius: 6, marginBottom: 16,
            background: configInfo?.hasApiKey ? '#f6ffed' : '#fffbe6',
            fontSize: 13
          }}>
            <strong>当前模式：</strong>
            {configInfo?.hasApiKey
              ? `🤖 API 模式（${configInfo.provider} / ${configInfo.model}）`
              : '📄 模板生成模式（未配置 API Key）'}
            {!configInfo?.hasApiKey && (
              <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
                — 可到设置页配置 DeepSeek 或 OpenAI Key
              </span>
            )}
          </div>

          {/* 模式切换 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              className={`btn btn-sm ${mode === 'single' ? 'btn-primary' : ''}`}
              onClick={() => setMode('single')}
            >
              单个生成
            </button>
            <button
              className={`btn btn-sm ${mode === 'batch' ? 'btn-primary' : ''}`}
              onClick={() => setMode('batch')}
            >
              批量生成
            </button>
          </div>

          {mode === 'single' && (
            <div>
              <div className="detail-field">
                <label>商品 Reference</label>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="输入商品 reference，如 BPT1753-N"
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleGenerateSingle}
                disabled={generating || !reference.trim()}
              >
                {generating ? '生成中...' : '🚀 生成文案'}
              </button>
            </div>
          )}

          {mode === 'batch' && (
            <div>
              <div className="detail-field">
                <label>商品 References（每行一个，最多 50 个）</label>
                <textarea
                  value={batchRefs}
                  onChange={(e) => setBatchRefs(e.target.value)}
                  placeholder={`BPT1753-N\nBPT1751-N\nLS23-M\nLY01`}
                  rows={8}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleGenerateBatch}
                disabled={generating || !batchRefs.trim()}
              >
                {generating ? '批量生成中...' : '🚀 批量生成'}
              </button>
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 16, padding: '10px 14px', borderRadius: 6,
              background: '#fff2f0', fontSize: 13, color: 'var(--error)'
            }}>
              ❌ {error}
            </div>
          )}

          {/* 生成结果 */}
          {result && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                ✅ 生成结果
              </h4>
              {result.success ? (
                <div style={{
                  padding: 12, borderRadius: 6, background: '#f6ffed',
                  fontSize: 13, maxHeight: 200, overflowY: 'auto'
                }}>
                  <div>成功：{result.success.length} 个</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {result.success.join(', ')}
                  </div>
                  {result.failed?.length > 0 && (
                    <>
                      <div style={{ marginTop: 8, color: 'var(--error)' }}>
                        失败：{result.failed.length} 个
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {result.failed.join(', ')}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div style={{
                  padding: 12, borderRadius: 6, background: '#fafafa',
                  fontSize: 13, maxHeight: 300, overflowY: 'auto'
                }}>
                  <div style={{ marginBottom: 8 }}>
                    <strong>🇪🇸 西语商品名：</strong>
                    {result.es?.name}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>🇨🇳 中文商品名：</strong>
                    {result.zh?.name}
                  </div>
                  <details>
                    <summary style={{ cursor: 'pointer', marginBottom: 4, color: 'var(--accent)' }}>
                      查看完整 JSON
                    </summary>
                    <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </details>
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

export default CopyGenerationModal;
