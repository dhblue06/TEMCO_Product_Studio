import React, { useState, useRef } from 'react';

interface WebsiteImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

const WebsiteImportModal: React.FC<WebsiteImportModalProps> = ({ onClose, onImported }) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'confirm' | 'done'>('upload');
  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [activationAssumption, setActivationAssumption] = useState<'active_only' | 'snapshot_only'>('active_only');
  const [importMode] = useState<'replace' | 'append'>('replace');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvContent(text);
      // 预览
      fetch('/api/website-import/preview', {
        method: 'POST',
        body: (() => {
          const fd = new FormData();
          fd.append('file', new Blob([text], { type: 'text/csv' }), file.name);
          return fd;
        })(),
      }).then(r => r.json()).then(d => {
        if (d.success) {
          setPreview(d.data);
          setStep('preview');
        } else {
          setError(d.error || '预览失败');
        }
      }).catch(err => setError(err.message));
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    setError('');
    try {
      const res = await fetch('/api/website-import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvContent,
          sourceName: fileName,
          importMode,
          activationAssumption,
          updateWebsiteStatus: true,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setResult(d.data);
        setStep('done');
        onImported();
      } else {
        setError(d.error || '导入失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h3>📥 导入 PrestaShop 网站商品</h3>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

          {step === 'upload' && (
            <div>
              <p style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
                上传从 PrestaShop 后台导出的 CSV 文件，系统会自动匹配本地商品。
              </p>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileSelect} style={{ display: 'none' }} />
              <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} style={{ width: '100%', justifyContent: 'center', padding: '12px 0' }}>
                📂 选择 CSV 文件
              </button>
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                <div>• 支持 PrestaShop 导出的 CSV（分号分隔）</div>
                <div>• 文件需包含：Product ID、Referencia、Nombre</div>
                <div>• 最大 20MB，最多 100,000 行</div>
              </div>
            </div>
          )}

          {step === 'preview' && preview && (
            <div>
              <div style={{ marginBottom: 12, padding: 12, background: 'var(--bg-primary)', borderRadius: 6, fontSize: 13 }}>
                <div><strong>文件：</strong>{fileName}</div>
                <div><strong>数据行：</strong>{preview.statistics.totalRows}</div>
                <div><strong>字段：</strong>{preview.headers.length}（{preview.headers.join('、')}）</div>
                <div><strong>唯一 Reference：</strong>{preview.statistics.uniqueReferences}</div>
                <div><strong>唯一 Product ID：</strong>{preview.statistics.uniqueProductIds}</div>
                <div><strong>分类数量：</strong>{preview.statistics.categories}</div>
              </div>

              <div style={{ margin: '12px 0', padding: 12, background: '#fff7e6', borderRadius: 6, fontSize: 13, border: '1px solid #ffe0a0' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>⚠️ 该文件没有 "Active" 字段</div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', marginTop: 8 }}>
                  <input type="radio" checked={activationAssumption === 'active_only'} onChange={() => setActivationAssumption('active_only')} />
                  <div><strong>是，文件中的产品全部视为已激活</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>导入后这些产品将在列表中显示绿色 ✓</div></div>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', marginTop: 6 }}>
                  <input type="radio" checked={activationAssumption === 'snapshot_only'} onChange={() => setActivationAssumption('snapshot_only')} />
                  <div><strong>不确定，只保存快照</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>仅保存网站数据，不更新 "已在网站" 状态</div></div>
                </label>
              </div>

              <div style={{ margin: '12px 0', padding: 12, background: 'var(--bg-primary)', borderRadius: 6, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>预计匹配</div>
                <div>按 Reference 匹配：{preview.estimatedMatch.byReference}</div>
                <div>按 Product ID 匹配：{preview.estimatedMatch.byPrestashopId}</div>
                <div>本地不存在：{preview.estimatedMatch.unmatched}</div>
                <div>冲突：{preview.estimatedMatch.conflicts}</div>
              </div>

              {error && <div style={{ color: 'var(--error)', marginTop: 8, fontSize: 13 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn" onClick={() => setStep('upload')} style={{ flex: 1, justifyContent: 'center' }}>重新选择</button>
                <button className="btn btn-primary" onClick={handleImport} disabled={importing} style={{ flex: 2, justifyContent: 'center' }}>
                  {importing ? '⏳ 导入中...' : '✅ 确认导入'}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && result && (
            <div>
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>导入完成</div>
              </div>
              <div style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 6, fontSize: 13, lineHeight: 2 }}>
                <div>总产品：<strong>{result.stats.total}</strong></div>
                <div>已匹配：<strong>{result.stats.matched}</strong></div>
                <div>未匹配：<strong>{result.stats.unmatched}</strong></div>
                <div>冲突：<strong>{result.stats.conflicts}</strong></div>
              </div>
              <button className="btn btn-primary" onClick={onClose} style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
                完成
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default WebsiteImportModal;
