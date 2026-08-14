// v1.5 快速盘点：批次 → 产品 → 品牌 → 连续型号×颜色×数量 → 汇总
import React, { useCallback, useEffect, useState } from 'react';
import SessionStart from '../components/mobileCapture/SessionStart';
import InventoryModelCounter, { ColorRow } from '../components/mobileInventory/InventoryModelCounter';
import { useMobileCaptureSession } from '../hooks/useMobileCaptureSession';
import { mobileCaptureApi, inventoryApi } from '../services/api';
import { useI18n, LangSwitch } from '../i18n';

type Step = 'start' | 'product' | 'brand' | 'count' | 'summary';

interface InvProduct {
  id: number;
  product_name: string;
  reference: string;
  prestashop_product_id: number;
  modelGroups: { brand: string; models: string[] }[];
  countedModels: { model: string; status: string; colors: any[] }[];
  snapshot: { fetchedAt: string; combinations: any[] } | null;
  lastCounts: any[];
}

const STORAGE_KEY = 'mobile_inventory_progress';

export function MobileInventoryPage() {
  const { t } = useI18n();
  const { auth, login } = useMobileCaptureSession();
  const [step, setStep] = useState<Step>('start');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 批次
  const [sessions, setSessions] = useState<any[]>([]);
  const [invSession, setInvSession] = useState<any>(null);
  const [newSessionName, setNewSessionName] = useState('');

  // 产品
  const [product, setProduct] = useState<InvProduct | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);

  // 品牌/型号进度
  const [brand, setBrand] = useState('');
  const [brandModels, setBrandModels] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [doneModels, setDoneModels] = useState<Set<string>>(new Set());
  const [prevColors, setPrevColors] = useState<string[]>([]);

  const handleLoggedIn = useCallback(async () => {
    setStep('start');
    try {
      const res = await inventoryApi.listInventorySessions('active');
      if (res.success) setSessions(res.data || []);
    } catch { /* 忽略 */ }
  }, []);

  // 恢复进度（localStorage）
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved?.sessionId) {
        inventoryApi.getInventorySession(saved.sessionId).then(r => {
          if (r.success && r.data.status === 'active') {
            setInvSession(r.data);
            if (saved.productId) {
              inventoryApi.getInventoryProduct(saved.productId).then(p => {
                if (p.success) { setProduct(p.data); setStep('brand'); }
              });
            }
          }
        }).catch(() => {});
      }
    } catch { /* 忽略 */ }
  }, []);

  const saveProgress = (sessId: number, prodId: number) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: sessId, productId: prodId, at: Date.now() }));
  };

  const createSession = async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.createInventorySession({
        name: newSessionName || t('inv.warehouse'),
        inventoryType: 'phone_case',
        operatorName: auth.operatorName,
        deviceName: auth.deviceName,
      });
      if (res.success) {
        setInvSession(res.data);
        setStep('product');
        saveProgress(res.data.id, 0);
      } else alert(res.error || t('alert.createFail'));
    } catch (e: any) { alert(t('alert.createFail') + ': ' + e.message); } finally { setLoading(false); }
  };

  const pickSession = (s: any) => { setInvSession(s); setStep('product'); saveProgress(s.id, 0); };

  const searchProduct = async () => {
    if (!searchQ.trim()) return;
    setLoading(true);
    try {
      const res = await mobileCaptureApi.searchProduct(searchQ.trim());
      if (res.success) setSearchResult(res.data);
      else alert(res.error || t('alert.searchFail'));
    } catch (e: any) { alert(t('alert.searchFail') + ': ' + e.message); } finally { setLoading(false); }
  };

  const addProduct = async (productId: number) => {
    if (!invSession) return;
    setLoading(true);
    try {
      const res = await inventoryApi.addInventoryProduct(invSession.id, { productId });
      if (res.success) {
        const detail = await inventoryApi.getInventoryProduct(res.data.id);
        if (detail.success) {
          setProduct(detail.data);
          setStep('brand');
          setBrand('');
          setCurrentIndex(0);
          saveProgress(invSession.id, res.data.id);
        }
      } else alert(res.error || t('alert.addFail'));
    } catch (e: any) { alert(t('alert.addFail') + ': ' + e.message); } finally { setLoading(false); }
  };

  const enterBrand = (b: string) => {
    setBrand(b);
    const g = product?.modelGroups?.find(x => x.brand === b);
    const models = g?.models || [];
    setBrandModels(models);
    // {t('inv.counted')}型号
    const done = new Set<string>((product?.countedModels || []).filter(m => m.status !== 'skipped').map(m => m.model));
    // 从 done 中排除当前品牌外的？countedModels 是全局——只取当前品牌的
    const doneInBrand = new Set<string>((product?.countedModels || [])
      .filter(m => m.status !== 'skipped' && models.includes(m.model)).map(m => m.model));
    setDoneModels(doneInBrand);
    // 进度：第一个未盘的
    let idx = models.findIndex(m => !doneInBrand.has(m));
    if (idx < 0) idx = 0;
    setCurrentIndex(idx);
    setStep('count');
  };

  const saveModel = async (model: string, colors: ColorRow[], status: 'counted' | 'skipped'): Promise<boolean> => {
    if (!product) return false;
    try {
      const validColors = colors.filter(c => c.color && (c.quantity !== null || status === 'skipped'));
      const res = await inventoryApi.saveInventoryModel(product.id, model, {
        brand,
        colors: validColors.map(c => ({ color: c.color, quantity: c.quantity, countType: c.countType })),
        status: status === 'skipped' ? 'skipped' : undefined,
      });
      if (res.success) {
        setDoneModels(prev => {
          const n = new Set(prev);
          if (status === 'skipped') n.delete(model); else n.add(model);
          return n;
        });
        setPrevColors(colors.map(c => c.color));
        return true;
      }
      return false;
    } catch { return false; }
  };

  const goNext = () => {
    if (currentIndex >= brandModels.length - 1) { setStep('summary'); return; }
    setCurrentIndex(i => i + 1);
  };
  const goPrev = () => { setCurrentIndex(i => Math.max(0, i - 1)); };

  const doneSession = async () => {
    if (!invSession) return;
    if (window.confirm(t('inv.doneConfirm'))) {
      await inventoryApi.completeInventorySession(invSession.id);
      localStorage.removeItem(STORAGE_KEY);
      alert(t('inv.doneMsg'));
      setInvSession(null); setProduct(null); setStep('start');
      handleLoggedIn();
    }
  };

  // ===== 渲染 =====
  const backTarget: Step | null = step === 'count' ? 'brand' : step === 'brand' ? 'product' : step === 'product' ? 'start' : step === 'summary' ? 'brand' : null;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '12px 14px 20px', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'sticky', top: 0, background: 'var(--bg-primary)', padding: '6px 0', zIndex: 10 }}>
        {backTarget && (
          <button type="button" onClick={() => setStep(backTarget)} style={{ border: 'none', background: 'var(--bg-hover)', borderRadius: 8, width: 32, height: 32, fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>←</button>
        )}
        <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{t('inv.title')}</div><LangSwitch />
      </div>
      {!auth.token ? (
        <SessionStart
          loading={loading}
          error={error}
          hasActiveSession={false}
          onStart={async (pin, op, dev) => {
            await login(pin, op, dev, '');
            await handleLoggedIn();
          }}
        />
      ) : (
        <>
          {step === 'start' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {t('inv.hint')}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t('inv.current')}</div>
              {sessions.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('inv.none')}</div>}
              {sessions.map(s => (
                <button key={s.id} type="button" onClick={() => pickSession(s)}
                  style={{ textAlign: 'left', padding: 12, borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{s.session_code}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.name} · {s.operator_name}</div>
                  </div>
                  <span style={{ alignSelf: 'center', color: 'var(--accent)', fontSize: 12 }}>{t('inv.resume')}</span>
                </button>
              ))}
              <div style={{ borderTop: '1px dashed var(--border-color)', margin: '4px 0' }} />
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t('inv.new')}</div>
              <input value={newSessionName} onChange={e => setNewSessionName(e.target.value)} placeholder={t('inv.newPh')}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
              <button type="button" className="btn btn-primary" onClick={createSession} disabled={loading} style={{ padding: 12 }}>{t('inv.start')}</button>
            </div>
          )}

          {step === 'product' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('inv.batch')} {invSession?.session_code}：{t('inv.pickProduct')}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchProduct()}
                  placeholder={t('inv.searchPh')}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 15, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                <button type="button" className="btn btn-primary" onClick={searchProduct} disabled={loading}>{loading ? '...' : t('common.search')}</button>
              </div>
              {searchResult?.match && (
                <button type="button" onClick={() => addProduct(searchResult.match.productId)}
                  style={{ textAlign: 'left', padding: 12, borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--accent-light)', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 700 }}>{searchResult.match.name || searchResult.match.reference}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{searchResult.match.reference} · {t('inv.clickStart')}</div>
                </button>
              )}
              {(searchResult?.candidates || []).map((c: any) => (
                <button key={c.productId} type="button" onClick={() => addProduct(c.productId)}
                  style={{ textAlign: 'left', padding: 12, borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600 }}>{c.name || c.reference}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.reference} · {c.model} · {t('search.confidence')} {(c.confidence * 100).toFixed(0)}%</div>
                </button>
              ))}
              {searchResult && !searchResult.match && searchResult.candidates?.length === 0 && (
                <div style={{ fontSize: 13, color: '#dc2626' }}>{searchResult.message}</div>
              )}
            </div>
          )}

          {step === 'brand' && product && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{product.product_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('inv.selectBrand')}</div>
              {product.modelGroups.map(g => {
                const done = (product.countedModels || []).filter(m => g.models.includes(m.model) && m.status !== 'skipped').length;
                return (
                  <button key={g.brand} type="button" onClick={() => enterBrand(g.brand)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', cursor: 'pointer' }}>
                    <span style={{ fontWeight: 600 }}>{g.brand}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{done} / {g.models.length} {t('inv.counted')}</span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 'count' && product && (
            <InventoryModelCounter
              productName={product.product_name}
              brand={brand}
              models={brandModels}
              doneModels={doneModels}
              initialIndex={currentIndex}
              prevColors={prevColors}
              onSave={saveModel}
              onNext={goNext}
              onPrev={goPrev}
              onDone={() => setStep('summary')}
            />
          )}

          {step === 'summary' && product && <SummaryView product={product} onDone={doneSession} onBack={() => setStep('brand')} />}
        </>
      )}
    </div>
  );
}

// 汇总矩阵 + 统计 + 差异
function SummaryView({ product, onDone, onBack }: { product: InvProduct; onDone: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<any>(null);
  const [diffs, setDiffs] = useState<any[]>([]);
  useEffect(() => {
    inventoryApi.getInventorySummary(product.id).then(r => { if (r.success) setSummary(r.data); });
    inventoryApi.getInventoryDifferences(product.id).then(r => { if (r.success) setDiffs(r.data || []); });
  }, [product.id]);

  const allColors = Array.from(new Set<string>((summary?.rows || []).flatMap((r: any) => r.colorList.map((c: any) => c.color_name))));
  const s = summary?.stats;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>📊 {t('inv.summary')} · {product.product_name}</div>
      {s && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatChip label={t('inv.model')} value={s.models} />
          <StatChip label="{t('inv.colorRecords')}" value={s.colorRecords} />
          <StatChip label="{t('inv.totalQty')}" value={s.totalQty} />
          <StatChip label="{t('inv.outOfStock')}" value={s.outOfStock} color="#dc2626" />
          <StatChip label="{t('inv.lowStock')}" value={s.lowCount} color="#f59e0b" />
        </div>
      )}

      {/* 矩阵 */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr style={{ background: 'var(--bg-hover)' }}>
              <th style={{ padding: 8, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-hover)' }}>{t('inv.models')}</th>
              {allColors.map(c => <th key={c} style={{ padding: 8, whiteSpace: 'nowrap' }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {(summary?.rows || []).map((r: any) => (
              <tr key={r.model} style={{ borderTop: '1px solid var(--border-color)' }}>
                <td style={{ padding: 8, fontWeight: 600, position: 'sticky', left: 0, background: 'var(--bg-primary)' }}>
                  {r.model} {r.status === 'skipped' && <span style={{ color: '#f59e0b', fontSize: 10 }}>{t('inv.skip')}</span>}
                </td>
                {allColors.map(c => {
                  const cell = r.colors[c];
                  return <td key={c} style={{ padding: 8, textAlign: 'center', color: cell?.quantity === 0 ? '#dc2626' : cell ? 'var(--text-primary)' : 'var(--text-muted)' }}>{cell ? cell.quantity : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 差异 */}
      {diffs.filter(d => d.status === 'large').length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{t('inv.diffLarge')}（{diffs.filter(d => d.status === 'large').length} 项）</div>
          {diffs.filter(d => d.status === 'large').slice(0, 8).map((d, i) => (
            <div key={i} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, background: '#fef2f2', color: '#b91c1c' }}>
              {d.model} · {d.color}：{t('inv.real')} {d.actual} / {t('inv.web')} {d.website}（{t('inv.diff')} {d.difference > 0 ? '+' : ''}{d.difference}）
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" onClick={onBack} style={{ flex: 1, padding: 12 }}>{t('inv.continueCount')}</button>
        <button type="button" className="btn btn-primary" onClick={onDone} style={{ flex: 1.5, padding: 12 }}>{t('inv.summaryDone')}</button>
      </div>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <span style={{ fontSize: 12, padding: '6px 10px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: color || 'var(--text-primary)', fontWeight: 600 }}>
      {label} {value}
    </span>
  );
}

export default MobileInventoryPage;
