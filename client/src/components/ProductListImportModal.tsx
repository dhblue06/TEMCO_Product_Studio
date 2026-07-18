import React, { useState, useRef } from 'react';

interface ProductListImportModalProps {
  onClose: () => void;
  onImported: (refs: string[]) => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  on_website: { label: '已在网站', color: '#16a34a' },
  not_on_website: { label: '未在网站', color: '#dc2626' },
  missing_in_local: { label: '本地库不存在', color: '#d97706' },
  local_conflict: { label: '匹配冲突', color: '#f59e0b' },
  website_conflict: { label: '网站冲突', color: '#f59e0b' },
  website_status_unknown: { label: '网站状态未知', color: '#9ca3af' },
  invalid_reference: { label: '编号无效', color: '#9ca3af' },
};

const ProductListImportModal: React.FC<ProductListImportModalProps> = ({ onClose, onImported }) => {
  const [step, setStep] = useState<'upload' | 'result'>('upload');
  const [preview, setPreview] = useState<any>(null);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [checkResult, setCheckResult] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('not_on_website');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError('');
    try {
      // 直接发送到后端解析 + 检查（一步完成）
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/product-list-import/commit-file', {
        method: 'POST',
        body: formData,
      });
      const d = await res.json();
      if (d.success && d.data) {
        setBatchId(d.data.batchId);
        setCheckResult(d.data.stats);
        setStep('result');
        loadItems(d.data.batchId, statusFilter);
      } else {
        setError(d.error || '检查失败: 返回数据异常');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const commitCheck = async (previewData: any) => {
    // 不再使用 - 已合并到 handleFileSelect
  };

  const loadItems = async (bid: number, filter: string) => {
    try {
      const res = await fetch(`/api/product-list-import/batches/${bid}/items?status=${filter}&pageSize=200`);
      const d = await res.json();
      if (d.success) setItems(d.data.items);
    } catch {}
  };

  const handleDeleteProduct = async (reference: string) => {
    if (!window.confirm(`确定删除产品 ${reference}？此操作不可撤销。`)) return;
    try {
      const res = await fetch("/api/products/" + encodeURIComponent(reference), { method: "DELETE" });
      const d = await res.json();
      if (d.success) {
        if (batchId) loadItems(batchId, statusFilter);
      } else {
        setError(d.error || "删除失败");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleFilterChange = (newFilter: string) => {
    setStatusFilter(newFilter);
    if (batchId) loadItems(batchId, newFilter);
  };

  const handleExport = () => {
    if (batchId) window.open(`/api/product-list-import/batches/${batchId}/export?status=${statusFilter}`, '_blank');
  };

  const handleOpenInMainList = () => {
    const refs = items.filter(i => i.check_status === 'not_on_website' && i.local_product_id).map(i => i.reference);
    if (refs.length > 0) {
      onImported(refs);
    } else {
      setError('没有未在网站的产品可在主列表中查看');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
        <div className="modal-header">
          <h3>📋 产品清单检查</h3>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>

          {step === 'upload' && (
            <div>
              <p style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
                导入产品分类 Excel 清单，系统会自动检查各产品在网站上的状态。
              </p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} style={{ display: 'none' }} />
              <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={loading}
                style={{ width: '100%', justifyContent: 'center', padding: '12px 0' }}>
                {loading ? '⏳ 处理中...' : '📂 选择 Excel 文件'}
              </button>
              {error && <div style={{ color: 'var(--error)', marginTop: 8 }}>{error}</div>}
            </div>
          )}

          {step === 'result' && checkResult && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, padding: 12, background: 'var(--bg-primary)', borderRadius: 6, textAlign: 'center', cursor: 'pointer',
                  border: statusFilter === 'all' ? '2px solid var(--accent)' : '2px solid transparent' }}
                  onClick={() => handleFilterChange('all')}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{checkResult.total}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>全部</div>
                </div>
                <div style={{ flex: 1, padding: 12, background: '#f0fdf4', borderRadius: 6, textAlign: 'center', cursor: 'pointer',
                  border: statusFilter === 'on_website' ? '2px solid var(--accent)' : '2px solid transparent' }}
                  onClick={() => handleFilterChange('on_website')}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{checkResult.onWebsite}</div>
                  <div style={{ fontSize: 12, color: '#166534' }}>已在网站</div>
                </div>
                <div style={{ flex: 1, padding: 12, background: '#fef2f2', borderRadius: 6, textAlign: 'center', cursor: 'pointer',
                  border: statusFilter === 'not_on_website' ? '2px solid var(--accent)' : '2px solid transparent' }}
                  onClick={() => handleFilterChange('not_on_website')}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{checkResult.notOnWebsite}</div>
                  <div style={{ fontSize: 12, color: '#991b1b' }}>未在网站</div>
                </div>
                <div style={{ flex: 1, padding: 12, background: '#fffbeb', borderRadius: 6, textAlign: 'center', cursor: 'pointer',
                  border: statusFilter === 'missing_in_local' ? '2px solid var(--accent)' : '2px solid transparent' }}
                  onClick={() => handleFilterChange('missing_in_local')}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706' }}>{checkResult.missingInLocal}</div>
                  <div style={{ fontSize: 12, color: '#92400e' }}>本地库不存在</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button className="btn btn-sm" onClick={handleExport}>📥 导出</button>
                {checkResult.notOnWebsite > 0 && (
                  <button className="btn btn-sm btn-primary" onClick={handleOpenInMainList}>
                    在主列表中查看未上架
                  </button>
                )}
              </div>

              {loading ? (
                <div className="loading">加载中...</div>
              ) : items.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>暂无数据</div>
              ) : (
                <div style={{ maxHeight: 400, overflowY: 'auto', fontSize: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>状态</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>编号</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>西语名称</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>中文名称</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>型号</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>品牌</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--border-color)', width: 50 }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item: any) => {
                        const st = STATUS_LABELS[item.check_status] || { label: item.check_status, color: '#666' };
                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '4px 8px' }}>
                              <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
                            </td>
                            <td style={{ padding: '4px 8px', fontWeight: 500 }}>{item.reference}</td>
                            <td style={{ padding: '4px 8px' }}>{item.label_name_es || '-'}</td>
                            <td style={{ padding: '4px 8px' }}>{item.product_name_zh || '-'}</td>
                            <td style={{ padding: '4px 8px' }}>{item.model || '-'}</td>
                            <td style={{ padding: '4px 8px' }}>{item.brand || '-'}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                              {item.local_product_id && (
                                <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 6px', color: 'var(--error)' }}
                                  onClick={() => handleDeleteProduct(item.reference)}>🗑</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {error && <div style={{ color: 'var(--error)', marginTop: 8 }}>{error}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductListImportModal;
