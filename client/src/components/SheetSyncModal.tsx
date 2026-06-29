import React, { useState } from 'react';
import { sheetApi } from '../services/api';
import './Modal.css';

interface SheetSyncModalProps {
  onClose: () => void;
}

const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/10C954V-_NJU7dCO9M7Ts1pLudCk8F8BrhCXcsRqT12M/edit?gid=0#gid=0';

const API_BASE = '/api';

const SheetSyncModal: React.FC<SheetSyncModalProps> = ({ onClose }) => {
  const [sheetUrl, setSheetUrl] = useState(DEFAULT_SHEET_URL);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncResultData, setSyncResultData] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [mode, setMode] = useState<'url' | 'csv' | 'file'>('url');
  const [csvText, setCsvText] = useState('');
  const [filePath, setFilePath] = useState('C:\\Users\\xjm06\\Desktop\\prestashop_products_import.csv');
  const [importingFile, setImportingFile] = useState(false);

  const handleTest = async () => {
    if (!sheetUrl) return;
    setTesting(true);
    setSyncResult(null);
    setSyncResultData(null);
    try {
      const res = await sheetApi.test(sheetUrl);
      if (res.success) {
        const headerStr = res.data.headers?.slice(0, 15).join(', ') + (res.data.headers?.length > 15 ? '...' : '');
        setSyncResult(`✅ 连接成功！发现 ${res.data.rowCount} 行数据，${res.data.headers?.length || 0} 个字段`);
        setSyncResultData({ headers: res.data.headers, detectedColumns: {} });
      } else {
        setSyncResult(`❌ ${res.message}`);
      }
    } catch (err: any) {
      setSyncResult(`❌ 连接失败: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    if (!sheetUrl) return;
    setSyncing(true);
    setSyncResult(null);
    setSyncResultData(null);
    try {
      const res = await sheetApi.sync(sheetUrl);
      if (res.success) {
        setSyncResult(`✅ ${res.message}`);
        setSyncResultData(res.data);
      } else {
        setSyncResult(`❌ ${res.message || '同步失败'}`);
      }
    } catch (err: any) {
      setSyncResult(`❌ 同步失败: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncCsv = async () => {
    if (!csvText.trim()) return;
    setSyncing(true);
    setSyncResult(null);
    setSyncResultData(null);
    try {
      const res = await fetch(`${API_BASE}/sheet/sync-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncResult(`✅ ${data.message}`);
        setSyncResultData(data.data);
      } else {
        setSyncResult(`❌ ${data.error || '导入失败'}`);
      }
    } catch (err: any) {
      setSyncResult(`❌ 导入失败: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleImportFile = async () => {
    if (!filePath.trim()) return;
    setImportingFile(true);
    setSyncResult(null);
    setSyncResultData(null);
    try {
      const res = await fetch(`${API_BASE}/import/import-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncResult(`✅ ${data.message}`);
        setSyncResultData({ fields: data.data?.fields, sample: data.data?.sample });
      } else {
        setSyncResult(`❌ ${data.error || '导入失败'}`);
      }
    } catch (err: any) {
      setSyncResult(`❌ 导入失败: ${err.message}`);
    } finally {
      setImportingFile(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Google Sheet 同步</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* 模式切换 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className={`btn btn-sm ${mode === 'url' ? 'btn-primary' : ''}`} onClick={() => setMode('url')}>
              🔗 Sheet URL
            </button>
            <button className={`btn btn-sm ${mode === 'csv' ? 'btn-primary' : ''}`} onClick={() => setMode('csv')}>
              📋 粘贴 CSV
            </button>
            <button className={`btn btn-sm ${mode === 'file' ? 'btn-primary' : ''}`} onClick={() => setMode('file')}>
              📁 导入 CSV 文件
            </button>
          </div>

          {mode === 'url' ? (
          <>
          <div className="detail-field">
            <label>Sheet URL</label>
            <input
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="输入 Google Sheet URL..."
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            支持公开 Sheet 的 CSV 导出模式。如果 Sheet 未公开，请切换到「粘贴 CSV」模式。
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn" onClick={handleTest} disabled={testing || syncing}>
              {testing ? '测试中...' : '🔍 测试连接'}
            </button>
            <button className="btn btn-primary" onClick={handleSync} disabled={syncing || testing}>
              {syncing ? '同步中...' : '📥 开始同步'}
            </button>
          </div>
          </>
          ) : mode === 'csv' ? (
          <>
          <div className="detail-field">
            <label>粘贴 CSV 数据（含表头）</label>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`reference,name_es,category,brand,model\nBPT1753-N,Accesorio móvil,手机配件,TEMCO,\nBPT1751-N,Cable datos,手机配件,TEMCO,`}
              rows={12}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            第一行必须是列名。字段映射规则同 Sheet URL 模式。
          </div>
          <button className="btn btn-primary" onClick={handleSyncCsv} disabled={syncing || !csvText.trim()}>
            {syncing ? '导入中...' : '📥 导入 CSV'}
          </button>
          </>
          ) : (
          <>
          <div className="detail-field">
            <label>CSV 文件路径</label>
            <input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="输入 CSV 文件的完整路径"
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            支持 PrestaShop 导出的分号分隔 CSV 文件（如桌面的 prestashop_products_import.csv）
          </div>
          <button className="btn btn-primary" onClick={handleImportFile} disabled={importingFile || !filePath.trim()}>
            {importingFile ? '导入中...' : '📥 从文件导入'}
          </button>
          </>
          )}

          {syncResult && (
            <div
              style={{
                marginTop: 16,
                padding: '10px 14px',
                borderRadius: 6,
                background: syncResult.includes('✅') ? '#f6ffed' : '#fff2f0',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
              }}
            >
              {syncResult}
            </div>
          )}

          {/* 导入结果 - 字段映射 */}
          {syncResultData?.fields && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>字段映射</h4>
              <div style={{ fontSize: 12, border: '1px solid var(--border-color)', borderRadius: 4, padding: 8 }}>
                {Object.entries(syncResultData.fields).map(([field, col]) => (
                  <div key={field} style={{ marginBottom: 3 }}>
                    <code style={{ color: 'var(--accent)' }}>{field}</code>
                    <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>←</span>
                    <code>{(col as string) || '未找到'}</code>
                  </div>
                ))}
              </div>
              {syncResultData.sample && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                  示例: {syncResultData.sample.reference} | {syncResultData.sample.name}
                </div>
              )}
            </div>
          )}

          {/* CSV 粘贴模式的列名映射 */}
          {syncResultData?.detectedColumns && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>字段映射检测</h4>
              <div style={{ fontSize: 12, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 4, padding: 8 }}>
                {Object.entries(syncResultData.detectedColumns).map(([field, col]) => (
                  <div key={field} style={{ marginBottom: 3 }}>
                    <code style={{ color: 'var(--accent)' }}>{field}</code>
                    <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>←</span>
                    <code>{col as string}</code>
                  </div>
                ))}
              </div>
              {syncResultData.headers && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                  检测到 {syncResultData.headers.length} 列: {syncResultData.headers.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SheetSyncModal;
