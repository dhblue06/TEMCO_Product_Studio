// 变体（组合）编辑面板：读取网站现有变体 → 增删改
import React, { useEffect, useState } from 'react';
import { prestashopApi, mobileCaptureApi } from '../../services/api';
import { ColorSwatch, DEFAULT_COLOR_HEX } from './ColorSwatch';
import { useToast } from '../ui/ToastProvider';
import { useConfirm } from '../ui/ConfirmProvider';

export interface PSCombination {
  id: number;
  reference: string;
  ean13: string;
  quantity: number;
  price: number;
  attributeValueIds: number[];
}

export interface PSOptionValue {
  id: number;
  idAttributeGroup: number;
  name: string;
  /** 属性值颜色 hex（仅颜色组有值） */
  color?: string;
  /** 纹理小图片 URL（惯例 img/co/{id}.jpg，可能不存在） */
  textureUrl?: string;
}

interface Props {
  prestashopProductId: number | null;
  /** 采集任务 ID（传入时显示「同步变体到网站」按钮） */
  captureId?: number;
  /** 原产品 Reference（新增变体默认值） */
  reference?: string;
  /** 原产品 EAN（新增变体默认值） */
  ean13?: string;
}

export function VariantEditPanel({ prestashopProductId, captureId, reference, ean13 }: Props) {
  const { success, error: toastError, warning: toastWarning } = useToast();
  const { confirm } = useConfirm();
  const [combinations, setCombinations] = useState<PSCombination[]>([]);
  const [optionValues, setOptionValues] = useState<PSOptionValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // 权限自检
  const [permCheck, setPermCheck] = useState<{ resource: string; ok: boolean; error?: string }[] | null>(null);
  const [checkingPerm, setCheckingPerm] = useState(false);

  const checkPerm = async () => {
    setCheckingPerm(true);
    try {
      const res = await prestashopApi.checkPermissions();
      if (res.success) setPermCheck(res.data || []);
      else setPermCheck([{ resource: '?', ok: false, error: res.error || '检测失败' }]);
    } catch (e: any) {
      setPermCheck([{ resource: '?', ok: false, error: e.message }]);
    } finally {
      setCheckingPerm(false);
    }
  };

  // 新增表单
  const [newAttrs, setNewAttrs] = useState<number[]>([]);
  const [newRef, setNewRef] = useState('');
  const [newEan, setNewEan] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newPrice, setNewPrice] = useState('');

  // 编辑草稿
  const [draft, setDraft] = useState<Record<string, string>>({});
  // 每行独立库存输入
  const [stockDraft, setStockDraft] = useState<Record<number, string>>({});
  const [stockSaving, setStockSaving] = useState<number | null>(null);
  // 同步变体到网站
  const [syncingVariants, setSyncingVariants] = useState(false);

  const colorName = (ids: number[]): string =>
    (ids || []).map(id => optionValues.find(v => v.id === id)?.name || `#${id}`).join(' + ') || '—';

  const load = async () => {
    if (!prestashopProductId) return;
    setLoading(true);
    setError('');
    try {
      const [ov, cmb] = await Promise.all([
        prestashopApi.getOptionValues(),
        prestashopApi.getCombinations(prestashopProductId),
      ]);
      if (ov.success) setOptionValues(ov.data || []);
      if (cmb.success) setCombinations(cmb.data || []);
      else setError(cmb.error || '读取变体失败');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [prestashopProductId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!prestashopProductId) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>产品未绑定 PrestaShop ID，无法管理变体</div>;
  }

  const toggleNewAttr = (id: number) => {
    setNewAttrs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const create = async () => {
    if (newAttrs.length === 0) { toastWarning('请选择至少一个属性值（颜色）', { vibrate: true }); return; }
    setBusy(true);
    let ok = 0;
    const failMsgs: string[] = [];
    const nameOf = (id: number) => optionValues.find(v => v.id === id)?.name || `#${id}`;
    // 每个勾选的颜色创建一个独立变体（组合）
    for (const attrId of newAttrs) {
      try {
        const res = await prestashopApi.createCombination(prestashopProductId, {
          attributeValueIds: [attrId],
          reference: newRef,
          ean13: newEan,
          quantity: newQty === '' ? null : Number(newQty),
          price: newPrice === '' ? null : Number(newPrice),
        });
        if (res.success) ok++;
        else failMsgs.push(`${nameOf(attrId)}: ${res.error || '失败'}`);
      } catch (e: any) {
        failMsgs.push(`${nameOf(attrId)}: ${e.message}`);
      }
    }
    success(`变体创建完成：成功 ${ok} 个${failMsgs.length ? `，失败 ${failMsgs.length} 个\n${failMsgs.join('\n')}` : ''}`, { duration: 8000 });
    setShowAdd(false);
    setNewAttrs([]);
    setNewRef(''); setNewEan(''); setNewQty(''); setNewPrice('');
    load();
    setBusy(false);
  };

  const startEdit = (c: PSCombination) => {
    setEditingId(c.id);
    setDraft({
      reference: c.reference || '',
      ean13: c.ean13 || '',
      quantity: c.quantity ? String(c.quantity) : '',
      price: c.price ? String(c.price) : '',
    });
  };

  const saveEdit = async (c: PSCombination) => {
    setBusy(true);
    try {
      const res = await prestashopApi.updateCombination(c.id, {
        productId: prestashopProductId,
        reference: draft.reference,
        ean13: draft.ean13,
        quantity: draft.quantity === '' ? null : Number(draft.quantity),
        price: draft.price === '' ? null : Number(draft.price),
      });
      if (res.success) { success('✅ 变体已更新'); setEditingId(null); load(); }
      else toastError(res.error || '更新失败');
    } catch (e: any) { toastError('更新失败: ' + e.message); }
    finally { setBusy(false); }
  };

  const remove = async (c: PSCombination) => {
    const ok = await confirm(`删除变体「${colorName(c.attributeValueIds)}」（ID ${c.id}）？此操作会同步删除网站上的组合。`, { title: '删除变体', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await prestashopApi.deleteCombination(c.id);
      if (res.success) { success('✅ 变体已删除'); load(); }
      else toastError(res.error || '删除失败');
    } catch (e: any) { toastError('删除失败: ' + e.message); }
    finally { setBusy(false); }
  };

  // 单独保存某个变体的库存（同步网站 stock_available）
  const saveStock = async (c: PSCombination) => {
    const qty = stockDraft[c.id];
    if (qty === undefined || qty === '') { toastWarning('请输入库存数量'); return; }
    setStockSaving(c.id);
    try {
      const res = await prestashopApi.updateCombination(c.id, { productId: prestashopProductId, quantity: Number(qty) });
      if (res.success) { success(`✅ ${colorName(c.attributeValueIds)} 库存已更新为 ${Number(qty)}`); setStockDraft(d => { const n = { ...d }; delete n[c.id]; return n; }); load(); }
      else toastError(res.error || '库存更新失败');
    } catch (e: any) { toastError('库存更新失败: ' + e.message); }
    finally { setStockSaving(null); }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>🧬 网站变体（组合）</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-sm" onClick={checkPerm} disabled={checkingPerm}>
            {checkingPerm ? '检测中...' : '🔍 检查 API 权限'}
          </button>
          <button type="button" className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? '读取中...' : '🔄 读取网站变体'}
          </button>
          {captureId && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={syncingVariants}
              onClick={async () => {
                const ok = await confirm('把采集任务标注的颜色+库存同步为网站变体？\n（已有颜色更新库存，新颜色创建变体）', { title: '同步变体到网站' });
                if (!ok) return;
                setSyncingVariants(true);
                try {
                  const res = await mobileCaptureApi.syncVariantsToWebsite(captureId);
                  if (res.success) { success(res.message || '✅ 变体已同步'); load(); }
                  else toastError(res.error || '同步失败');
                } catch (e: any) { toastError('同步失败: ' + e.message); }
                finally { setSyncingVariants(false); }
              }}
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {syncingVariants ? '同步中...' : '📤 同步变体到网站'}
            </button>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        变体操作（读取 / 新增 / 编辑 / 删除 / 库存）均<b style={{ color: 'var(--accent)' }}>实时读写 PrestaShop 网站</b>，保存即同步生效，无需单独"同步"按钮；网站图片的同步请使用上方操作区的「🖼 同步产品图片到网站」。
      </div>

      {error && <div style={{ fontSize: 12, color: '#dc2626' }}>⚠️ {error}</div>}

      {/* 权限自检结果 */}
      {permCheck && (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--bg-primary)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>API 权限状态：</div>
          {permCheck.map(p => (
            <div key={p.resource} style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: p.ok ? '#10b981' : '#dc2626', fontWeight: 700 }}>{p.ok ? '✅' : '❌'}</span>
              <span style={{ color: 'var(--text-primary)', minWidth: 150 }}>{p.resource}</span>
              {!p.ok && <span style={{ color: 'var(--text-muted)', flex: 1 }}>{p.error}</span>}
            </div>
          ))}
          {permCheck.some(p => !p.ok) && (
            <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '6px 8px', borderRadius: 6, lineHeight: 1.5 }}>
              请在 PrestaShop 后台勾选这些资源权限：高级参数 → Web 服务 → 编辑 API Key → 权限 → 勾选对应资源（GET/POST/PUT/DELETE）→ 保存，然后重新点「检查」。
            </div>
          )}
        </div>
      )}

      {combinations.length === 0 && !loading && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>网站暂无变体，点击「读取网站变体」或下方「新增变体」</div>
      )}

      {/* 变体列表 */}
      {combinations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {combinations.map(c => (
            <div key={c.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 8, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                  {c.attributeValueIds.map(id => {
                    const v = optionValues.find(o => o.id === id);
                    const name = v?.name || `#${id}`;
                    return (
                      <span key={id} title={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {(v?.color || v?.textureUrl || DEFAULT_COLOR_HEX[name]) && (
                          <ColorSwatch hex={v?.color || DEFAULT_COLOR_HEX[name] || ''} textureUrl={v?.textureUrl} size={14} />
                        )}
                        {name}
                      </span>
                    );
                  })}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID {c.id}</span>
              </div>
              {editingId === c.id ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6 }}>
                  <input value={draft.reference} onChange={e => setDraft(d => ({ ...d, reference: e.target.value }))} placeholder="Reference" style={inp} />
                  <input value={draft.ean13} onChange={e => setDraft(d => ({ ...d, ean13: e.target.value }))} placeholder="EAN" style={inp} />
                  <input value={draft.quantity} onChange={e => setDraft(d => ({ ...d, quantity: e.target.value }))} placeholder="数量" type="number" style={inp} />
                  <input value={draft.price} onChange={e => setDraft(d => ({ ...d, price: e.target.value }))} placeholder="价格" type="number" step="0.01" style={inp} />
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>Ref: {c.reference || '—'}</span>
                  <span>EAN: {c.ean13 || '—'}</span>
                  <span>价格: {c.price}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ color: 'var(--text-secondary)' }}>库存：</label>
                    <input
                      type="number"
                      min={0}
                      value={stockDraft[c.id] ?? c.quantity}
                      onChange={e => setStockDraft(d => ({ ...d, [c.id]: e.target.value }))}
                      style={{ ...inp, width: 64 }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={stockSaving !== null || stockDraft[c.id] === undefined}
                      onClick={() => saveStock(c)}
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      {stockSaving === c.id ? '...' : '💾 保存库存'}
                    </button>
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                {editingId === c.id ? (
                  <>
                    <button type="button" className="btn btn-sm" disabled={busy} onClick={() => saveEdit(c)} style={{ background: 'var(--accent)', color: '#fff' }}>保存</button>
                    <button type="button" className="btn btn-sm" onClick={() => setEditingId(null)}>取消</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn-sm" onClick={() => startEdit(c)}>✏️ 编辑</button>
                    <button type="button" className="btn btn-sm" onClick={() => remove(c)} disabled={busy} style={{ color: '#dc2626' }}>🗑 删除</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增变体 */}
      {!showAdd ? (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            // 默认值：复制原产品 Reference/EAN，库存默认 99
            setShowAdd(true);
            setNewRef(reference || '');
            setNewEan(ean13 || '');
            setNewQty('99');
            setNewPrice('');
          }}
          style={{ alignSelf: 'flex-start' }}
        >
          ＋ 新增变体
        </button>
      ) : (
        <div style={{ border: '1px dashed var(--border-color)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-primary)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            选择属性值（颜色，可多选）—— <b>勾选 N 个颜色 = 创建 N 个独立变体</b>：
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
            {optionValues.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>未读取到属性值，请先点「🔄 读取网站变体」</span>}
            {optionValues.map(v => (
              <label key={v.id} style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer', color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={newAttrs.includes(v.id)} onChange={() => toggleNewAttr(v.id)} style={{ accentColor: 'var(--accent)' }} />
                {(v.color || v.textureUrl || DEFAULT_COLOR_HEX[v.name]) && (
                  <ColorSwatch hex={v.color || DEFAULT_COLOR_HEX[v.name] || ''} textureUrl={v.textureUrl} size={14} />
                )}
                {v.name}
              </label>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
            <input value={newRef} onChange={e => setNewRef(e.target.value)} placeholder="Reference" style={inp} />
            <input value={newEan} onChange={e => setNewEan(e.target.value)} placeholder="EAN" style={inp} />
            <input value={newQty} onChange={e => setNewQty(e.target.value)} placeholder="数量" type="number" style={inp} />
            <input value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="价格" type="number" step="0.01" style={inp} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={create} style={{ background: 'var(--accent)', color: '#fff' }}>
              {busy ? '创建中...' : `创建变体（${newAttrs.length} 个）`}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setShowAdd(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 12,
  background: 'var(--bg-primary)', color: 'var(--text-primary)',
};

export default VariantEditPanel;
