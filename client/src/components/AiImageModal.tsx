import React, { useState, useEffect } from 'react';
import './Modal.css';

const API_BASE = '/api';

interface AiImageModalProps {
  onClose: () => void;
}

const IMAGE_TYPES = [
  { id: 'product', label: '产品图', description: '白底电商风格产品主图' },
  { id: 'packaging', label: '包装图', description: '产品包装盒展示' },
  { id: 'scene1', label: '使用场景 1', description: '真实使用环境图' },
  { id: 'scene2', label: '使用场景 2', description: '专业商用场景图' },
  { id: 'scene3', label: '使用场景 3', description: '产品细节特写图' },
];

const AiImageModal: React.FC<AiImageModalProps> = ({ onClose }) => {
  const [tab, setTab] = useState<'generate' | 'prompts'>('generate');
  const [reference, setReference] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<Record<string, string> | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingPrompts, setSavingPrompts] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-images/config`);
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
        setPrompts(data.data.prompts || {});
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const savePrompts = async (silent = false) => {
    setSavingPrompts(true);
    if (!silent) {
      setError('');
      setNotice('');
    }
    try {
      const res = await fetch(`${API_BASE}/ai-images/prompts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '提示词保存失败');
      if (!silent) setNotice('提示词已保存');
      return true;
    } catch (err: any) {
      if (!silent) setError(err.message);
      return false;
    } finally {
      setSavingPrompts(false);
    }
  };

  const handlePreview = async () => {
    if (!reference.trim()) return;
    setError('');
    setNotice('');
    setResult(null);
    const saved = await savePrompts(true);
    if (!saved) {
      setError('提示词保存失败，无法预览');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/ai-images/preview-prompts/${encodeURIComponent(reference.trim())}`);
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
        setNotice('已根据当前提示词、产品卖点和产品介绍生成预览');
      } else {
        setError(data.error || '预览失败');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGenerate = async () => {
    if (!reference.trim()) return;
    setGenerating(true);
    setError('');
    setNotice('');
    setResult(null);
    const saved = await savePrompts(true);
    if (!saved) {
      setError('提示词保存失败，无法生成');
      setGenerating(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/ai-images/generate/${encodeURIComponent(reference.trim())}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        if (data.data?.prompts) setPreview(data.data.prompts);
      } else {
        setError(data.error || '生成失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSavePrompts = async () => {
    await savePrompts(false);
  };

  const handleResetPrompts = async () => {
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${API_BASE}/ai-images/prompts/reset`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await fetchConfig();
        setNotice('已重置为默认提示词');
      } else {
        setError(data.error || '重置失败');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const renderPromptCards = (items: Record<string, string>) => (
    <div style={{ marginTop: 12 }}>
      <h4 style={{ fontSize: 13, marginBottom: 8 }}>提示词预览</h4>
      {Object.entries(items).map(([type, prompt]) => {
        const t = IMAGE_TYPES.find(x => x.id === type);
        return (
          <div key={type} style={{ marginBottom: 8, padding: 8, background: '#fafafa', borderRadius: 4, fontSize: 12, border: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{t?.label || type}</div>
            <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{prompt}</div>
          </div>
        );
      })}
    </div>
  );

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-body"><div className="loading">加载中...</div></div>
        </div>
      </div>
    );
  }

  const images = result?.data?.images || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>AI 图片生成</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13, background: config?.enabled ? '#f6ffed' : '#fffbe6' }}>
            {config?.enabled
              ? `图片 API 已启用：${config.provider} / ${config.model || '默认模型'}`
              : '图片 API 未启用：可以先生成提示词；启用并配置 API Key 后才会生成真实图片。'}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className={`btn btn-sm ${tab === 'generate' ? 'btn-primary' : ''}`} onClick={() => setTab('generate')}>
              生成/预览
            </button>
            <button className={`btn btn-sm ${tab === 'prompts' ? 'btn-primary' : ''}`} onClick={() => setTab('prompts')}>
              提示词模板
            </button>
          </div>

          {tab === 'generate' && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                流程：先保存当前提示词模板，再读取该产品的卖点/介绍，生成 5 类图片提示词；API 可用时继续生成图片并写入商品图库。
              </div>

              <div className="detail-field">
                <label>商品 Reference</label>
                <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="如 BPT1753-N 或 182869" />
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" onClick={handlePreview} disabled={!reference.trim() || savingPrompts || generating}>
                  预览当前提示词
                </button>
                <button className="btn btn-primary" onClick={handleGenerate} disabled={generating || !reference.trim() || savingPrompts}>
                  {generating ? '生成中...' : config?.enabled ? '生成真实图片' : '生成提示词'}
                </button>
              </div>

              {preview && renderPromptCards(preview)}

              {result && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 6, background: '#f6ffed', fontSize: 13 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{result.message}</div>
                  {images.map((img: any, i: number) => (
                    <div key={i} style={{ marginBottom: 10, padding: 8, background: '#fff', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                        <strong>{img.label}</strong>
                        <span>{img.status}</span>
                      </div>
                      {img.error && <div style={{ color: 'var(--error)', marginBottom: 4 }}>{img.error}</div>}
                      {img.imageUrls?.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                          {img.imageUrls.map((file: string) => (
                            <a key={file} href={`/api/upload/file/${encodeURIComponent(file)}`} target="_blank" rel="noreferrer">
                              <img src={`/api/upload/file/${encodeURIComponent(file)}`} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border-color)' }} />
                            </a>
                          ))}
                        </div>
                      )}
                      <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{img.prompt}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'prompts' && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                可用占位符：{'{reference}'}、{'{category}'}、{'{name}'}、{'{selling_points}'}、{'{product_intro}'}。预览和生成会自动先保存这里的模板。
              </p>
              {IMAGE_TYPES.map(t => (
                <div className="detail-field" key={t.id}>
                  <label>{t.label}</label>
                  <textarea
                    value={prompts[t.id] || ''}
                    onChange={(e) => setPrompts(prev => ({ ...prev, [t.id]: e.target.value }))}
                    rows={4}
                    placeholder={t.description}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn" onClick={handleResetPrompts}>重置默认</button>
                <button className="btn btn-primary" onClick={handleSavePrompts} disabled={savingPrompts}>
                  {savingPrompts ? '保存中...' : '保存提示词模板'}
                </button>
              </div>
            </div>
          )}

          {notice && <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: '#f6ffed', fontSize: 13 }}>{notice}</div>}
          {error && <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: '#fff2f0', fontSize: 13 }}>❌ {error}</div>}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>关闭</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiImageModal;