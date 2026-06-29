import React, { useState } from 'react';
import './Modal.css';

const API_BASE = '/api';

const ExportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/export/prestashop-csv`);
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || '导出失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📤 导出 PrestaShop CSV</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            导出完整的 PrestaShop CSV 文件，包含已更新的品牌名（TEMCO / HOPECOM），可直接用于 PrestaShop 批量导入。
          </div>

          <button className="btn btn-primary" onClick={handleExport} disabled={exporting} style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}>
            {exporting ? '⏳ 导出中...' : '📤 导出 PrestaShop CSV'}
          </button>

          {error && (
            <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: '#fff2f0', fontSize: 13 }}>
              ❌ {error}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 16 }}>
              <div style={{ padding: 12, borderRadius: 6, background: '#f6ffed', fontSize: 13 }}>
                ✅ {exporting ? '' : '导出完成！'}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.8 }}>
                <div>📦 商品总数：<strong>{result.productCount}</strong></div>
                <div>🏷 已更新品牌：<strong>{result.updatedBrands}</strong> 个</div>
                <div>📁 文件路径：<code style={{ fontSize: 11, wordBreak: 'break-all' }}>{result.filePath}</code></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <a
                  href={`${API_BASE}/export/download/prestashop_products_export.csv`}
                  className="btn btn-primary"
                  style={{ textDecoration: 'none', display: 'inline-flex' }}
                  download
                >
                  ⬇️ 下载 CSV 文件
                </a>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                将此 CSV 文件上传到 PrestaShop 即可批量导入。
              </div>
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

export default ExportModal;
