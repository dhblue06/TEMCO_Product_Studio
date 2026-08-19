// 手机端快速缺货上报（v1.7）：扫码/输条码 → 报"剩X件 / 剩X箱 / 已卖完" → 网站红标 + 一键同步
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMobileCaptureSession } from '../hooks/useMobileCaptureSession';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useI18n, LangSwitch } from '../i18n';
import { stockReportApi } from '../services/api';
import SessionStart from '../components/mobileCapture/SessionStart';
import { useToast } from '../components/ui/ToastProvider';

type ReportType = 'pieces' | 'boxes' | 'sold_out';

interface FoundProduct {
  id: number;
  reference: string;
  name: string;
  ean13: string;
  prestashopProductId: number;
  brand: string;
  category: string;
  websiteQuantity: number | null;
}

const TYPE_LABEL: Record<ReportType, { zh: string; es: string }> = {
  pieces: { zh: '剩余件数', es: 'Unidades restantes' },
  boxes: { zh: '剩余箱数', es: 'Cajas restantes' },
  sold_out: { zh: '已卖完', es: 'Agotado' },
};

export function MobileStockReportPage() {
  const { t } = useI18n();
  const { auth, error, login, logout } = useMobileCaptureSession();
  const { success, error: toastError } = useToast();

  // 扫码（onDetected 通过 ref 调用，避免闭包顺序问题）
  const [scanMode, setScanMode] = useState(true);
  const [manualQuery, setManualQuery] = useState('');
  const handleQueryRef = useRef<(q: string) => void>(() => {});
  const { videoRef, start, stop, active, liveSupported, capturePhotoScan } = useBarcodeScanner((code) => { handleQueryRef.current(code); });

  // 查询结果
  const [product, setProduct] = useState<FoundProduct | null>(null);
  const [searching, setSearching] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('pieces');
  const [quantity, setQuantity] = useState('');
  const [boxSize, setBoxSize] = useState('10');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 搜索产品（条码/reference/名称，只读查询不创建记录）
  const handleQuery = useCallback(async (q: string) => {
    const query = String(q || '').trim();
    if (!query) return;
    setSearching(true);
    try {
      const res = await stockReportApi.find(query);
      if (res.success) {
        setProduct(res.data);
        setQuantity('');
        setNote('');
        setReportType('pieces');
        stop();
      } else {
        toastError(res.error || '未找到产品', { vibrate: true });
        setProduct(null);
      }
    } catch (e: any) {
      toastError('查询失败: ' + e.message);
      setProduct(null);
    } finally {
      setSearching(false);
    }
  }, [toastError, stop]);

  // 保持 ref 指向最新 handleQuery（供扫码回调调用）
  useEffect(() => { handleQueryRef.current = handleQuery; }, [handleQuery]);

  return (
    <div className="mobile-safe-top" style={{ minHeight: '100vh', background: 'var(--bg-primary)', maxWidth: 480, margin: '0 auto', position: 'relative', paddingBottom: 30 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end', padding: '6px 12px 0', background: 'var(--bg-primary)' }}>
        <LangSwitch />
      </div>

      {!auth.token ? (
        <SessionStart
          loading={false}
          error={error}
          hasActiveSession={false}
          onStart={async (pin, op, dev) => { await login(pin, op, dev, ''); }}
        />
      ) : (
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 顶栏 */}
          <div className="mobile-topbar" style={{ margin: '-14px -14px 0', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>📉 缺货上报</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.9)' }}>{auth.operatorName} · {auth.deviceName}</div>
            </div>
            <button type="button" onClick={logout} className="btn btn-sm" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', border: '1px solid rgba(255,255,255,.35)' }}>
              {t('session.logout')}
            </button>
          </div>

          {/* 扫码/手动切换 */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={scanMode ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setScanMode(true)}>📷 扫码</button>
            <button type="button" className={!scanMode ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setScanMode(false)}>⌨️ 输条码</button>
          </div>

          {scanMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {liveSupported ? (
                <button type="button" onClick={active ? stop : start} className={active ? 'btn' : 'btn btn-primary'} style={{ padding: '10px 16px' }}>
                  {active ? '⏹ 停止扫码' : '▶ 开始扫码'}
                </button>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>此网络环境不支持实时摄像头，可用"拍照扫码"或手动输入</span>
              )}
              {active && <video ref={videoRef} style={{ width: '100%', borderRadius: 12, background: '#000', maxHeight: 220, objectFit: 'cover' }} muted playsInline />}
              <button type="button" className="btn btn-primary" onClick={async () => {
                const code = await capturePhotoScan();
                if (code) await handleQuery(code);
              }} style={{ padding: 12 }}>📷 拍照扫码</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="mobile-field"
                value={manualQuery}
                onChange={e => setManualQuery(e.target.value)}
                placeholder="输入条码 / 编号 / 名称"
                style={{ flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter') handleQuery(manualQuery); }}
              />
              <button type="button" className="btn btn-primary mobile-btn" onClick={() => handleQuery(manualQuery)} disabled={searching}>
                {searching ? '...' : '查询'}
              </button>
            </div>
          )}

          {/* 已找到产品 */}
          {product && (
            <div className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{product.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{product.reference}{product.ean13 ? ` · EAN ${product.ean13}` : ''}</div>
              </div>

              <div className="ui-section-title">缺货类型</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {(['pieces', 'boxes', 'sold_out'] as ReportType[]).map(rt => (
                  <button
                    key={rt}
                    type="button"
                    className={reportType === rt ? 'btn btn-primary mobile-btn' : 'btn mobile-btn'}
                    onClick={() => setReportType(rt)}
                  >
                    {TYPE_LABEL[rt].zh}
                  </button>
                ))}
              </div>

              {reportType !== 'sold_out' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="ui-section-title" style={{ marginBottom: 0 }}>
                    {reportType === 'boxes' ? '剩余箱数' : '剩余件数'}
                  </label>
                  <input
                    className="mobile-field"
                    type="number"
                    min={0}
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    placeholder={reportType === 'boxes' ? '例如 3 箱' : '例如 5 件'}
                    style={{ width: '100%' }}
                  />
                  {reportType === 'boxes' && (
                    <>
                      <label className="ui-section-title" style={{ marginBottom: 0 }}>每箱件数</label>
                      <input className="mobile-field" type="number" min={1} value={boxSize} onChange={e => setBoxSize(e.target.value)} style={{ width: '100%' }} />
                    </>
                  )}
                </div>
              )}
              {reportType === 'sold_out' && (
                <div style={{ padding: 10, borderRadius: 8, background: 'var(--error-bg)', color: '#991b1b', fontSize: 13, fontWeight: 600 }}>
                  ⚠️ 标记为已卖完（同步后网站库存将为 0）
                </div>
              )}

              <textarea className="mobile-field" value={note} onChange={e => setNote(e.target.value)} placeholder="备注（可选）" rows={2} style={{ resize: 'vertical' }} />

              <button
                type="button"
                className="btn btn-cta mobile-btn"
                disabled={submitting || (reportType !== 'sold_out' && !quantity)}
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    const res = await stockReportApi.create({
                      productId: product.id,
                      reportType,
                      quantity: reportType === 'sold_out' ? 0 : Number(quantity) || 0,
                      boxSize: reportType === 'boxes' ? Number(boxSize) || 0 : undefined,
                      operatorName: auth.operatorName,
                      deviceName: auth.deviceName,
                      note,
                    });
                    if (res.success) {
                      success('✅ 缺货已记录，网站红标已更新', { vibrate: true });
                      // 清空继续下一个
                      setProduct(null); setQuantity(''); setNote('');
                      if (active) stop();
                    } else {
                      toastError(res.error || '提交失败');
                    }
                  } catch (e: any) {
                    toastError('提交失败: ' + e.message, { vibrate: true });
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? '提交中...' : reportType === 'sold_out' ? '🚫 标记已卖完' : '✅ 提交缺货上报'}
              </button>
            </div>
          )}

          {!product && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              📷 扫描或输入条码后，选择缺货类型提交
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MobileStockReportPage;
