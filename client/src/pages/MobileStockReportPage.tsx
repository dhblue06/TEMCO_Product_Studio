// 手机端快速缺货上报（v1.7）：扫码/输条码 → 报"剩X件 / 剩X箱 / 已卖完" → 网站红标 + 一键同步
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMobileCaptureSession } from '../hooks/useMobileCaptureSession';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useCameraCapture } from '../hooks/useCameraCapture';
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

interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

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

  // 拍照暂存（提交时一起上传；不强制）
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const objectUrlsRef = useRef<string[]>([]);
  const { trigger: triggerCamera } = useCameraCapture((files) => {
    const items = files.map(f => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
    }));
    objectUrlsRef.current.push(...items.map(i => i.previewUrl));
    setPendingPhotos(prev => [...prev, ...items]);
  });

  // 清理 object URLs
  useEffect(() => {
    return () => { objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u)); };
  }, []);

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
        setPendingPhotos([]);
        stop();
      } else {
        toastError(res.error || t('stock.notFound'), { vibrate: true });
        setProduct(null);
      }
    } catch (e: any) {
      toastError(t('stock.queryFail') + ': ' + e.message);
      setProduct(null);
    } finally {
      setSearching(false);
    }
  }, [toastError, stop, t]);

  // 保持 ref 指向最新 handleQuery（供扫码回调调用）
  useEffect(() => { handleQueryRef.current = handleQuery; }, [handleQuery]);

  return (
    <div className="mobile-safe-top" style={{ minHeight: '100vh', background: 'var(--bg-primary)', maxWidth: 480, margin: '0 auto', position: 'relative', paddingBottom: 30 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px 0', background: 'var(--bg-primary)' }}>
        <button
          type="button"
          onClick={() => { window.location.href = '/mobile'; }}
          style={{ border: '1px solid var(--border-color)', background: 'var(--bg-hover)', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}
          title="返回入口 / Volver al menú"
        >
          🏠 {t('hub.backHome')}
        </button>
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
              <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>📉 {t('stock.title')}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.9)' }}>{auth.operatorName} · {auth.deviceName}</div>
            </div>
            <button type="button" onClick={logout} className="btn btn-sm" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', border: '1px solid rgba(255,255,255,.35)' }}>
              {t('session.logout')}
            </button>
          </div>

          {/* 扫码/手动切换 */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={scanMode ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setScanMode(true)}>{t('stock.scan')}</button>
            <button type="button" className={!scanMode ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setScanMode(false)}>{t('stock.manual')}</button>
          </div>

          {scanMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {liveSupported ? (
                <button type="button" onClick={active ? stop : start} className={active ? 'btn' : 'btn btn-primary'} style={{ padding: '10px 16px' }}>
                  {active ? t('stock.stopScan') : t('stock.startScan')}
                </button>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('stock.noCameraHint')}</span>
              )}
              {active && <video ref={videoRef} style={{ width: '100%', borderRadius: 12, background: '#000', maxHeight: 220, objectFit: 'cover' }} muted playsInline />}
              <button type="button" className="btn btn-primary" onClick={async () => {
                const code = await capturePhotoScan();
                if (code) await handleQuery(code);
              }} style={{ padding: 12 }}>{t('stock.photoScan')}</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="mobile-field"
                value={manualQuery}
                onChange={e => setManualQuery(e.target.value)}
                placeholder={t('stock.queryPh')}
                style={{ flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter') handleQuery(manualQuery); }}
              />
              <button type="button" className="btn btn-primary mobile-btn" onClick={() => handleQuery(manualQuery)} disabled={searching}>
                {searching ? '...' : t('stock.query')}
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

              <div className="ui-section-title">{t('stock.type')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {(['pieces', 'boxes', 'sold_out'] as ReportType[]).map(rt => (
                  <button
                    key={rt}
                    type="button"
                    className={reportType === rt ? 'btn btn-primary mobile-btn' : 'btn mobile-btn'}
                    onClick={() => setReportType(rt)}
                  >
                    {rt === 'pieces' ? t('stock.typePieces') : rt === 'boxes' ? t('stock.typeBoxes') : t('stock.typeSoldOut')}
                  </button>
                ))}
              </div>

              {reportType !== 'sold_out' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="ui-section-title" style={{ marginBottom: 0 }}>
                    {reportType === 'boxes' ? t('stock.qtyBoxes') : t('stock.qtyPieces')}
                  </label>
                  <input
                    className="mobile-field"
                    type="number"
                    min={0}
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    placeholder={reportType === 'boxes' ? t('stock.qtyPhBoxes') : t('stock.qtyPhPieces')}
                    style={{ width: '100%' }}
                  />
                  {reportType === 'boxes' && (
                    <>
                      <label className="ui-section-title" style={{ marginBottom: 0 }}>{t('stock.boxSize')}</label>
                      <input className="mobile-field" type="number" min={1} value={boxSize} onChange={e => setBoxSize(e.target.value)} style={{ width: '100%' }} />
                    </>
                  )}
                </div>
              )}
              {reportType === 'sold_out' && (
                <div style={{ padding: 10, borderRadius: 8, background: 'var(--error-bg)', color: '#991b1b', fontSize: 13, fontWeight: 600 }}>
                  {t('stock.soldOutWarn')}
                </div>
              )}

              <textarea className="mobile-field" value={note} onChange={e => setNote(e.target.value)} placeholder={t('stock.notePh')} rows={2} style={{ resize: 'vertical' }} />

              {/* 拍照上传（可选，不强制） */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="ui-section-title" style={{ marginBottom: 0 }}>{t('stock.photo')}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn mobile-btn" onClick={() => triggerCamera(true)} style={{ flex: 1 }}>📷 {t('stock.photoTake')}</button>
                  <button type="button" className="btn mobile-btn" onClick={() => triggerCamera(false)} style={{ flex: 1 }}>🖼 {t('stock.photoAlbum')}</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('stock.photoHint')}</div>
                {pendingPhotos.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {pendingPhotos.map(p => (
                      <div key={p.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                        <img src={p.previewUrl} alt="" style={{ width: '100%', height: 72, objectFit: 'cover', display: 'block' }} />
                        <button
                          type="button"
                          onClick={() => setPendingPhotos(prev => prev.filter(x => x.id !== p.id))}
                          style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(220,38,38,.85)', color: '#fff', border: 'none', borderRadius: 6, width: 20, height: 20, fontSize: 11, cursor: 'pointer', lineHeight: 1 }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
                      // 提交成功 → 上传暂存的照片（逐张，失败不阻断主流程）
                      const reportId = res.data?.id;
                      let photoFail = 0;
                      if (reportId && pendingPhotos.length > 0) {
                        for (const p of pendingPhotos) {
                          try {
                            const up = await stockReportApi.uploadImage(reportId, p.file);
                            if (!up.success) photoFail++;
                          } catch { photoFail++; }
                        }
                      }
                      success('✅ ' + t('stock.done') + (photoFail > 0 ? `（${photoFail} 张照片上传失败）` : ''), { vibrate: true });
                      // 清空继续下一个
                      setProduct(null); setQuantity(''); setNote(''); setPendingPhotos([]);
                      if (active) stop();
                    } else {
                      toastError(res.error || t('stock.submitFail'));
                    }
                  } catch (e: any) {
                    toastError(t('stock.submitFail') + ': ' + e.message, { vibrate: true });
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? t('stock.submitting') : reportType === 'sold_out' ? t('stock.submitSoldOut') : t('stock.submit')}
              </button>
            </div>
          )}

          {!product && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              {t('stock.hint')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MobileStockReportPage;
