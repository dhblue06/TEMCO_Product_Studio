import React, { useState, useEffect } from 'react';
import { productsApi } from '../services/api';
import './Modal.css';

interface DriveScanModalProps {
  onClose: () => void;
}

const API_BASE = '/api';

const DriveScanModal: React.FC<DriveScanModalProps> = ({ onClose }) => {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch(`${API_BASE}/drive/summary`);
      const data = await res.json();
      if (data.success) setSummary(data.data);
    } catch (err: any) {
      console.error('Failed to fetch summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    setError('');
    setScanResult(null);
    try {
      const res = await fetch(`${API_BASE}/drive/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setScanResult(data.data);
        fetchSummary();
      } else {
        setError(data.error || '扫描失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📁 Drive 素材匹配</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* 当前匹配概况 */}
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>当前素材概况</h4>
            {loadingSummary ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>加载中...</div>
            ) : summary ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ padding: 12, background: '#f6ffed', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--success)' }}>{summary.matchedProducts}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>已匹配主图</div>
                </div>
                <div style={{ padding: 12, background: '#fff7e6', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#d46b08' }}>{summary.missingFolders}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>缺图片文件夹</div>
                </div>
                <div style={{ padding: 12, background: '#fff2f0', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--error)' }}>{summary.abnormalImages}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>图片异常</div>
                </div>
                <div style={{ padding: 12, background: '#e6f4ff', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#0958d9' }}>{summary.totalImages}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>总图片数</div>
                </div>
                <div style={{ padding: 12, background: '#f9f0ff', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#531dab' }}>{summary.totalVideos}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>总视频数</div>
                </div>
                <div style={{ padding: 12, background: '#fffbe6', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#ad8b00' }}>{summary.orphanAssets}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>孤立素材</div>
                </div>
              </div>
            ) : null}
          </div>

          {/* 扫描按钮 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={handleScan} disabled={scanning}>
              {scanning ? '🔍 扫描中...' : '🔍 开始扫描素材'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            系统将根据商品 reference 自动匹配 Images 文件夹中的图片和 Videos 文件夹中的视频。
          </div>

          {/* 错误信息 */}
          {error && (
            <div style={{
              padding: '10px 14px', marginBottom: 12, borderRadius: 6,
              background: '#fff2f0', fontSize: 13, color: 'var(--error)'
            }}>
              ❌ {error}
            </div>
          )}

          {/* 扫描结果 */}
          {scanResult && (
            <div>
              <h4 style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                扫描结果（共 {scanResult.folders?.length || 0} 个文件夹）
              </h4>
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Reference</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>图片数</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>主图</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>问题</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanResult.folders?.map((folder: any) => (
                      <tr key={folder.reference}>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color)', fontWeight: 500 }}>
                          {folder.reference}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color)' }}>
                          {folder.images?.length || 0}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color)' }}>
                          {folder.images?.some((i: any) => i.isMain) ? '✅' : '❌'}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color)' }}>
                          {folder.issues?.length > 0 ? (
                            <span style={{ color: 'var(--error)', fontSize: 11 }}>
                              {folder.issues.join('; ')}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--success)' }}>正常</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

export default DriveScanModal;
