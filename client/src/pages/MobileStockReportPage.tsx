// 手机端快速缺货上报（v1.7）：扫码/输条码 → 报"剩X件 / 剩X箱 / 已卖完" → 网站红标 + 一键同步
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMobileCaptureSession } from '../hooks/useMobileCaptureSession';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useCameraCapture } from '../hooks/useCameraCapture';
import { useI18n, LangSwitch } from '../i18n';
import { stockReportApi } from '../services/api';
import { fetchWithTimeout } from '../services/network';
import SessionStart from '../components/mobileCapture/SessionStart';
import { useToast } from '../components/ui/ToastProvider';
import { mobileOfflineStore, OfflineStockProduct, OfflineStockReport } from '../services/mobileOfflineStore';

type ReportType = 'pieces' | 'boxes' | 'sold_out';

interface FoundProduct {
  id: number;
  reference: string;
  name: string;
  ean13: string;
  upc?: string;
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

function WebsiteProductImage({ product }: { product: FoundProduct }) {
  const [failed, setFailed] = useState(false);
  if (!product.prestashopProductId || failed) {
    return <div style={{ height: 110, display: 'grid', placeItems: 'center', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 12 }}>暂无网站图片</div>;
  }
  return (
    <img
      src={stockReportApi.websiteImageUrl(product.prestashopProductId)}
      alt={product.name || product.reference}
      onError={() => setFailed(true)}
      style={{ width: '100%', height: 190, objectFit: 'contain', borderRadius: 10, border: '1px solid var(--border-color)', background: '#fff' }}
    />
  );
}

export function MobileStockReportPage() {
  const { t } = useI18n();
  const { auth, error, login, logout } = useMobileCaptureSession();
  const { success, error: toastError, info: toastInfo } = useToast();

  // 扫码（onDetected 通过 ref 调用，避免闭包顺序问题）
  const [scanMode, setScanMode] = useState(true);
  const [manualQuery, setManualQuery] = useState('');
  const handleQueryRef = useRef<(q: string) => void>(() => {});
  const { videoRef, start, stop, active, liveSupported, error: scanError, torchSupported, torchOn, toggleTorch, capturePhotoScan } = useBarcodeScanner((code) => { handleQueryRef.current(code); });

  // 查询结果
  const [product, setProduct] = useState<FoundProduct | null>(null);
  const [searching, setSearching] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('pieces');
  const [quantity, setQuantity] = useState('');
  const [boxSize, setBoxSize] = useState('10');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [networkOk, setNetworkOk] = useState(true);
  const [pendingReportCount, setPendingReportCount] = useState(0);
  const [catalogCount, setCatalogCount] = useState(0);
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState('');
  const [catalogDownloading, setCatalogDownloading] = useState(false);
  const stockDraftHydrated = useRef(false);
  const stockDraftTimer = useRef<number | null>(null);
  const syncingReports = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [queue, setQueue] = useState<OfflineStockReport[]>([]);
  const [saveError, setSaveError] = useState('');
  const syncController = useRef<AbortController | null>(null);

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

  useEffect(() => {
    mobileOfflineStore.countStockProducts().then(setCatalogCount).catch(() => {});
    setCatalogUpdatedAt(localStorage.getItem('stock_offline_catalog_updated_at') || '');
  }, []);

  const downloadOfflineCatalog = useCallback(async () => {
    setCatalogDownloading(true);
    try {
      const res = await stockReportApi.getOfflineCatalog();
      if (!res.success || !Array.isArray(res.data?.products)) throw new Error(res.error || t('stock.catalogDownloadFail'));
      const cachedAt = Date.now();
      const products: OfflineStockProduct[] = res.data.products.map((p: any) => ({
        id: Number(p.id), reference: String(p.reference || ''), name: String(p.name || ''), ean13: String(p.ean13 || ''),
        upc: String(p.upc || ''), prestashopProductId: Number(p.prestashopProductId) || 0,
        brand: String(p.brand || ''), category: String(p.category || ''), websiteQuantity: null, cachedAt,
      }));
      await mobileOfflineStore.replaceStockProducts(products);
      const updatedAt = String(res.data.generatedAt || new Date().toISOString());
      localStorage.setItem('stock_offline_catalog_updated_at', updatedAt);
      localStorage.setItem('stock_offline_catalog_version', String(res.data.version || ''));
      setCatalogCount(products.length);
      setCatalogUpdatedAt(updatedAt);
      success(`${t('stock.catalogDownloaded')}：${products.length}`, { vibrate: true });
    } catch (e: any) {
      toastError(`${t('stock.catalogDownloadFail')}：${e.message}`);
    } finally {
      setCatalogDownloading(false);
    }
  }, [success, toastError, t]);

  const asOfflineProduct = useCallback((p: FoundProduct): OfflineStockProduct => ({
    ...p,
    cachedAt: Date.now(),
  }), []);

  // API 真实可达性检测；浏览器显示 online 不代表局域网电脑一定可访问。
  useEffect(() => {
    const check = () => fetchWithTimeout('/api/health', {}, 5000).then(r => setNetworkOk(r.ok)).catch(() => setNetworkOk(false));
    check();
    const timer = window.setInterval(check, 15000);
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
    };
  }, []);

  // 恢复未完成表单及照片。
  useEffect(() => {
    let active = true;
    Promise.all([mobileOfflineStore.getStockDraft(), mobileOfflineStore.listStockReports()]).then(([draft, reports]) => {
      if (!active) return;
      setPendingReportCount(reports.length);
      setQueue(reports);
      if (draft) {
        setProduct(draft.product);
        setReportType(draft.reportType);
        setQuantity(draft.quantity);
        setBoxSize(draft.boxSize);
        setNote(draft.note);
        const photos = draft.photos.map(photo => {
          const previewUrl = URL.createObjectURL(photo.file);
          objectUrlsRef.current.push(previewUrl);
          return { ...photo, previewUrl };
        });
        setPendingPhotos(photos);
        toastInfo(t('stock.draftRestored'));
      }
      stockDraftHydrated.current = true;
    }).catch((e) => { setSaveError(e.message); });
    return () => { active = false; };
  }, []);

  // 表单每次变化后保存到手机；照片以 Blob/File 形式一同持久化。
  useEffect(() => {
    if (!stockDraftHydrated.current || !product) return;
    if (stockDraftTimer.current) window.clearTimeout(stockDraftTimer.current);
    stockDraftTimer.current = window.setTimeout(() => {
      mobileOfflineStore.putStockDraft({
        id: 'current',
        product: asOfflineProduct(product),
        reportType,
        quantity,
        boxSize,
        note,
        photos: pendingPhotos.map(photo => ({ id: photo.id, file: photo.file })),
        updatedAt: Date.now(),
      }).then(() => setSaveError('')).catch(e => setSaveError(e.message));
    }, 0);
    return () => { if (stockDraftTimer.current) window.clearTimeout(stockDraftTimer.current); };
  }, [product, reportType, quantity, boxSize, note, pendingPhotos, asOfflineProduct]);

  const syncPendingReports = useCallback(async (announce = false) => {
    if (syncingReports.current) return;
    syncingReports.current = true;
    setSyncing(true);
    const controller = new AbortController();
    syncController.current = controller;
    let completed = 0;
    try {
      const reports = await mobileOfflineStore.listStockReports();
      for (const report of reports.sort((a, b) => a.createdAt - b.createdAt)) {
        if (controller.signal.aborted) break;
        if (report.status === 'conflict') continue;
        let current = { ...report, status: 'syncing' as const, error: undefined };
        await mobileOfflineStore.putStockReport(current);
        try {
          let reportId = current.serverReportId;
          if (!reportId) {
            const created = await stockReportApi.create({
              clientId: current.clientId,
              capturedAt: current.createdAt,
              productId: current.product.id,
              reportType: current.reportType,
              quantity: current.quantity,
              boxSize: current.boxSize,
              operatorName: current.operatorName,
              deviceName: current.deviceName,
              note: current.note,
            }, controller.signal);
            if (!created.success || !created.data?.id) throw new Error(created.error || t('stock.submitFail'));
            reportId = created.data.id;
            current = { ...current, serverReportId: reportId };
            await mobileOfflineStore.putStockReport(current);
          }
          if (!reportId) throw new Error(t('stock.submitFail'));
          const uploadedPhotoIds = new Set(current.uploadedPhotoIds || []);
          for (const photo of current.photos) {
            if (uploadedPhotoIds.has(photo.id)) continue;
            const uploaded = await stockReportApi.uploadImage(reportId, photo.file, photo.id, controller.signal);
            if (!uploaded.success) throw new Error(uploaded.error || t('stock.submitFail'));
            uploadedPhotoIds.add(photo.id);
            current = { ...current, uploadedPhotoIds: Array.from(uploadedPhotoIds) };
            await mobileOfflineStore.putStockReport(current);
          }
          await mobileOfflineStore.deleteStockReport(current.clientId);
          completed++;
        } catch (e: any) {
          const conflict = e.status === 409 || (e.status >= 400 && e.status < 500);
          await mobileOfflineStore.putStockReport({ ...current, status: conflict ? 'conflict' : 'failed', error: e.message });
          if (!conflict) break;
        }
      }
    } catch (e: any) {
      toastError(e.message);
    } finally {
      syncingReports.current = false;
      setSyncing(false);
      syncController.current = null;
      try {
        const remaining = await mobileOfflineStore.listStockReports();
        setPendingReportCount(remaining.length);
        setQueue(remaining);
      } catch (e: any) { setSaveError(e.message); }
      if (announce && completed > 0) success(`✅ ${t('stock.done')} (${completed})`, { vibrate: true });
    }
  }, [success, toastError, t]);

  useEffect(() => {
    if (networkOk && auth.token) void syncPendingReports(false);
  }, [networkOk, auth.token, syncPendingReports]);

  useEffect(() => () => { syncController.current?.abort(); }, []);

  // 搜索产品（条码/reference/名称，只读查询不创建记录）
  const handleQuery = useCallback(async (q: string) => {
    const query = String(q || '').trim();
    if (!query) return;
    setSearching(true);
    try {
      if (!networkOk) throw new Error('offline');
      const res = await stockReportApi.find(query);
      if (res.success) {
        setProduct(res.data);
        await mobileOfflineStore.putStockProduct(asOfflineProduct(res.data)).catch(() => {});
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
      const cached = await mobileOfflineStore.findStockProduct(query).catch(() => undefined);
      if (cached) {
        setProduct(cached);
        setQuantity('');
        setNote('');
        setReportType('pieces');
        setPendingPhotos([]);
        stop();
        toastInfo(t('stock.offlineResult'));
      } else {
        toastError(t('stock.queryFail') + ': ' + e.message);
        setProduct(null);
      }
    } finally {
      setSearching(false);
    }
  }, [toastError, toastInfo, stop, t, asOfflineProduct, networkOk]);

  // 保持 ref 指向最新 handleQuery（供扫码回调调用）
  useEffect(() => { handleQueryRef.current = handleQuery; }, [handleQuery]);

  return (
    <main className="mobile-shell mobile-safe-top" data-network={networkOk ? 'online' : 'offline'}>
      <div className="mobile-utility-bar">
        <button
          type="button"
          className="mobile-home-button"
          onClick={() => { window.location.href = '/mobile'; }}
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
        <div className="mobile-page-content mobile-stack">
          {/* 顶栏 */}
          <div className="mobile-work-header mobile-work-header-danger">
            <div className="mobile-work-header-copy">
              <span className="mobile-work-header-kicker">库存异常</span>
              <strong>{t('stock.title')}</strong>
              <small>{auth.operatorName} · {auth.deviceName}</small>
              <div className="mobile-work-meta">
                <span>{networkOk ? t('network.onlineShort') : t('network.offlineShort')}</span>
                {pendingReportCount > 0 && <span>{t('stock.pendingSync')} {pendingReportCount}</span>}
              </div>
            </div>
            <button type="button" onClick={logout} className="mobile-header-button">
              {t('session.logout')}
            </button>
          </div>

          {pendingReportCount > 0 && (
            <button type="button" className="btn mobile-btn" onClick={() => syncing ? syncController.current?.abort() : void syncPendingReports(true)} disabled={!networkOk && !syncing}>
              {syncing ? t('stock.pauseSync') : networkOk ? `${t('stock.retrySync')} (${pendingReportCount})` : `${t('stock.pendingSync')} ${pendingReportCount}`}
            </button>
          )}
          {saveError && <div role="alert" style={{ color: '#dc2626', padding: 10 }}>{t('stock.saveFailed')}: {saveError}</div>}
          {queue.filter(r => r.error).map(r => <div key={r.clientId} role="status" className="ui-card" style={{ padding: 10 }}>
            <strong>{r.product.reference} · {r.quantity} · {new Date(r.createdAt).toLocaleString()}</strong>
            <div>{r.error}</div>
            {r.status === 'conflict' && <button type="button" className="btn btn-sm" disabled={!!product || syncing} onClick={async () => {
              try {
                const draft = { id: 'current' as const, product: r.product, reportType: r.reportType, quantity: String(r.quantity), boxSize: String(r.boxSize || 10), note: r.note, photos: r.photos, updatedAt: Date.now() };
                await mobileOfflineStore.restoreStockReportDraft(r.clientId, draft);
                setProduct(r.product); setReportType(r.reportType); setQuantity(String(r.quantity)); setBoxSize(draft.boxSize); setNote(r.note);
                setPendingPhotos(r.photos.map(photo => { const previewUrl = URL.createObjectURL(photo.file); objectUrlsRef.current.push(previewUrl); return { ...photo, previewUrl }; }));
                const remaining = await mobileOfflineStore.listStockReports(); setQueue(remaining); setPendingReportCount(remaining.length);
              } catch (e: any) { toastError(e.message); }
            }}>{t('stock.reviewConflict')}</button>}
          </div>)}

          <div className="ui-card" style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{t('stock.catalogReady')}：{catalogCount}</div>
              {catalogUpdatedAt && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(catalogUpdatedAt).toLocaleString()}</div>}
            </div>
            <button type="button" className="btn btn-sm" onClick={downloadOfflineCatalog} disabled={!networkOk || catalogDownloading}>
              {catalogDownloading ? '…' : catalogCount > 0 ? t('stock.updateCatalog') : t('stock.downloadCatalog')}
            </button>
          </div>

          {/* 扫码/手动切换 */}
          <div className="mobile-segmented" role="tablist" aria-label="商品查找方式">
            <button type="button" role="tab" aria-selected={scanMode} className={scanMode ? 'active' : ''} onClick={() => setScanMode(true)}>{t('stock.scan')}</button>
            <button type="button" role="tab" aria-selected={!scanMode} className={!scanMode ? 'active' : ''} onClick={() => setScanMode(false)}>{t('stock.manual')}</button>
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
              {active && <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, background: '#000' }}>
                <video ref={videoRef} style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'cover' }} muted playsInline />
                <div aria-hidden="true" style={{ position: 'absolute', left: '8%', right: '8%', top: '36%', height: '28%', border: '2px solid #22c55e', borderRadius: 10, boxShadow: '0 0 0 999px rgba(0,0,0,.25)' }} />
              </div>}
              {active && torchSupported && <button type="button" className="btn btn-sm" onClick={toggleTorch} aria-pressed={torchOn} title="补光灯 / Linterna">
                {torchOn ? '🔦 关闭补光' : '🔦 开启补光'}
              </button>}
              {scanError && <div role="alert" style={{ fontSize: 12, color: '#dc2626' }}>⚠️ {scanError}</div>}
              <button type="button" className="btn btn-primary" onClick={() => { void capturePhotoScan(); }} style={{ padding: 12 }}>{t('stock.photoScan')}</button>
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
              <WebsiteProductImage product={product} />
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
                    const report: OfflineStockReport = {
                      clientId: `stock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                      product: asOfflineProduct(product),
                      reportType,
                      quantity: reportType === 'sold_out' ? 0 : Number(quantity) || 0,
                      boxSize: reportType === 'boxes' ? Number(boxSize) || 0 : undefined,
                      operatorName: auth.operatorName,
                      deviceName: auth.deviceName,
                      note,
                      photos: pendingPhotos.map(photo => ({ id: photo.id, file: photo.file })),
                      status: 'pending',
                      createdAt: Date.now(),
                    };
                    // 先存手机再清空页面，保证点击提交后即使立即断网也不会丢。
                    if (stockDraftTimer.current) window.clearTimeout(stockDraftTimer.current);
                    await mobileOfflineStore.submitStockDraft(report);
                    setPendingReportCount(count => count + 1);
                    success(t('stock.savedLocally'), { vibrate: true });
                    setProduct(null); setQuantity(''); setNote(''); setPendingPhotos([]);
                    if (active) stop();
                    if (networkOk) void syncPendingReports(true);
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
    </main>
  );
}

export default MobileStockReportPage;
