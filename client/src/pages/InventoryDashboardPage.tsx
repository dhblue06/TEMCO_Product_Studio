// v1.5 电脑端仓库盘点仪表盘：当前盘点 / 历史记录 / 库存差异
import React, { useCallback, useEffect, useState } from 'react';
import { inventoryApi } from '../services/api';

type Tab = 'current' | 'history' | 'diffs';

export function InventoryDashboardPage() {
  const [tab, setTab] = useState<Tab>('current');
  const [session, setSession] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [allDiffs, setAllDiffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selProduct, setSelProduct] = useState<any>(null);

  const loadActive = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.listInventorySessions('active');
      if (res.success && res.data?.length) {
        setSession(res.data[0]);
        const sess = await inventoryApi.getInventorySession(res.data[0].id);
        if (sess.success) { setSession(sess.data); setProducts(sess.data.products || []); }
      } else { setSession(null); setProducts([]); }
    } catch { /* 忽略 */ } finally { setLoading(false); }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await inventoryApi.listInventorySessions();
      setHistory((res.data || []).filter((s: any) => s.status !== 'active'));
    } catch { /* 忽略 */ }
  }, []);

  const loadDiffs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.listInventorySessions('active');
      const active = res.data?.[0];
      const diffs: any[] = [];
      if (active) {
        const sess = await inventoryApi.getInventorySession(active.id);
        for (const p of (sess.data?.products || [])) {
          const d = await inventoryApi.getInventoryDifferences(p.id).catch(() => ({ data: [] }));
          (d.data || []).forEach((x: any) => diffs.push({ ...x, product: p.product_name }));
        }
      }
      setAllDiffs(diffs);
    } catch { /* 忽略 */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadActive(); }, [loadActive]);
  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);
  useEffect(() => { if (tab === 'diffs') loadDiffs(); }, [tab, loadDiffs]);

  const openProduct = async (pid: number) => {
    const res = await inventoryApi.getInventoryProduct(pid);
    if (res.success) setSelProduct(res.data);
  };

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>🏭 仓库盘点</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {([['current', '当前盘点'], ['history', '历史记录'], ['diffs', '库存差异']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} className={tab === t ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>加载中...</div>}

      {tab === 'current' && (
        <>
          {session ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{session.session_code} {session.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>操作员 {session.operator_name} · 开始 {session.started_at}</div>
                  </div>
                  <span style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>● 进行中</span>
                </div>
                {session.stats && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                    <Stat label="产品" value={session.stats.products} />
                    <Stat label="型号" value={session.stats.models} />
                    <Stat label="颜色记录" value={session.stats.colors} />
                    <Stat label="数量" value={session.stats.totalQty} />
                    <Stat label="无货" value={session.stats.outOfStock} color="#dc2626" />
                  </div>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>盘点产品</div>
              {products.map(p => (
                <button key={p.id} type="button" onClick={() => openProduct(p.id)}
                  style={{ textAlign: 'left', padding: 12, borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600 }}>{p.product_name} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.reference}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>网站产品 #{p.prestashop_product_id || '—'} · 点击查看汇总</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无进行中的盘点</div>
          )}

          {selProduct && (
            <ProductMatrix product={selProduct} onClose={() => setSelProduct(null)} />
          )}
        </>
      )}

      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.map(h => (
            <div key={h.id} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{h.session_code} {h.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.started_at} · {h.operator_name} · {h.status}</div>
              </div>
              {h.stats && (
                <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                  <span>{h.stats.totalQty} 件</span>
                  <span>{h.stats.models} 型号</span>
                  <span style={{ color: '#dc2626' }}>{h.stats.outOfStock} 缺货</span>
                </div>
              )}
            </div>
          ))}
          {history.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无历史记录</div>}
        </div>
      )}

      {tab === 'diffs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>实盘 vs 网站库存（大差异 = 绝对值 &gt; 3）</div>
          {allDiffs.filter(d => d.status !== 'match').slice(0, 60).map((d, i) => (
            <div key={i} style={{ padding: '8px 12px', borderRadius: 8, background: d.status === 'large' ? '#fef2f2' : 'var(--bg-secondary)', border: '1px solid var(--border-color)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>{d.product} · {d.model} · {d.color}</span>
              <span style={{ color: d.status === 'large' ? '#dc2626' : '#f59e0b' }}>
                实盘 {d.actual} / 网站 {d.website ?? '?'}（{d.difference > 0 ? '+' : ''}{d.difference}）
              </span>
            </div>
          ))}
          {allDiffs.filter(d => d.status !== 'match').length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>无差异记录</div>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: color || 'var(--text-primary)', fontWeight: 600 }}>{label} {value}</span>;
}

// 单产品汇总矩阵
function ProductMatrix({ product, onClose }: { product: any; onClose: () => void }) {
  const [summary, setSummary] = useState<any>(null);
  const [diffs, setDiffs] = useState<any[]>([]);
  useEffect(() => {
    inventoryApi.getInventorySummary(product.id).then(r => { if (r.success) setSummary(r.data); });
    inventoryApi.getInventoryDifferences(product.id).then(r => { if (r.success) setDiffs(r.data || []); });
  }, [product.id]);

  const allColors = Array.from(new Set<string>((summary?.rows || []).flatMap((r: any) => r.colorList.map((c: any) => c.color_name))));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-primary)', borderRadius: 12, padding: 16, maxWidth: 800, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontWeight: 700 }}>📊 {product.product_name}</div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'var(--bg-hover)', borderRadius: 8, width: 28, height: 28, cursor: 'pointer' }}>✕</button>
        </div>
        {summary?.stats && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <Stat label="型号" value={summary.stats.models} />
            <Stat label="颜色记录" value={summary.stats.colorRecords} />
            <Stat label="总数量" value={summary.stats.totalQty} />
            <Stat label="🔴 无货" value={summary.stats.outOfStock} color="#dc2626" />
            <Stat label="🟠 少量" value={summary.stats.lowCount} color="#f59e0b" />
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead><tr style={{ background: 'var(--bg-hover)' }}>
              <th style={{ padding: 8, textAlign: 'left' }}>型号</th>
              {allColors.map(c => <th key={c} style={{ padding: 8 }}>{c}</th>)}
            </tr></thead>
            <tbody>
              {(summary?.rows || []).map((r: any) => (
                <tr key={r.model} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: 8, fontWeight: 600 }}>{r.model}</td>
                  {allColors.map(c => {
                    const cell = r.colors[c];
                    return <td key={c} style={{ padding: 8, textAlign: 'center', color: cell?.quantity === 0 ? '#dc2626' : cell ? 'inherit' : 'var(--text-muted)' }}>{cell ? cell.quantity : '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {diffs.filter(d => d.status === 'large').length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>⚠ 与网站差异较大</div>
            {diffs.filter(d => d.status === 'large').slice(0, 10).map((d, i) => (
              <div key={i} style={{ fontSize: 12, padding: '4px 8px', background: '#fef2f2', borderRadius: 6, marginBottom: 2, color: '#b91c1c' }}>
                {d.model} · {d.color}：实盘 {d.actual} / 网站 {d.website}（{d.difference > 0 ? '+' : ''}{d.difference}）
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default InventoryDashboardPage;
