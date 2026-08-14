// v1.5 快速盘点：连续型号 × 颜色 × {t('inv.qty')}计数器（一次聚焦一个型号）
import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';

export interface ColorRow {
  color: string;
  quantity: number | null;
  countType: 'exact' | 'estimated' | 'not_counted';
}

interface Props {
  productName: string;
  brand: string;
  models: string[];            // 当前品牌全部型号
  doneModels: Set<string>;     // 已盘型号
  initialIndex: number;
  prevColors: string[];        // 上一型号颜色（自动继承）
  onSave: (model: string, colors: ColorRow[], status: 'counted' | 'skipped') => Promise<boolean>;
  onNext: () => void;          // 前进到下一型号（由父级管理索引）
  onPrev: () => void;
  onDone: () => void;          // 全部完成/返回
}

const COLOR_CHOICES: { zh: string; es: string }[] = [
  { zh: '黑', es: 'Negro' }, { zh: '白', es: 'Blanco' }, { zh: '灰', es: 'Gris' }, { zh: '红', es: 'Rojo' },
  { zh: '橙', es: 'Naranja' }, { zh: '黄', es: 'Amarillo' }, { zh: '绿', es: 'Verde' }, { zh: '蓝', es: 'Azul' },
  { zh: '紫', es: 'Morado' }, { zh: '粉', es: 'Rosa' }, { zh: '棕', es: 'Marrón' }, { zh: '透明', es: 'Transparente' }, { zh: '其他', es: 'Otro' },
];

export function InventoryModelCounter({ productName, brand, models, doneModels, initialIndex, prevColors, onSave, onNext, onPrev, onDone }: Props) {
  const { t, lang } = useI18n();
  const [index, setIndex] = useState(Math.min(initialIndex, models.length - 1));
  const [rows, setRows] = useState<ColorRow[]>([]);
  const [autoInherit, setAutoInherit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const model = models[index] || '';
  const total = models.length;

  // 切换型号：颜色自动继承上一型号
  useEffect(() => {
    setIndex(Math.min(initialIndex, Math.max(0, models.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand]);

  const applyColors = (colors: string[]) => {
    setRows(colors.map(c => ({ color: c, quantity: null, countType: 'exact' as const })));
  };

  // 初始或型号变化时初始化颜色行
  useEffect(() => {
    if (!model) return;
    setRows(prevRows => {
      const existing = doneModels.has(model);
      if (existing && prevRows.length === 0) return prevRows; // {t('inv.counted')}：由父级提供数据
      // 自动继承上一型号颜色
      if (autoInherit && prevColors.length && prevRows.length === 0) {
        return prevColors.map(c => ({ color: c, quantity: null, countType: 'exact' as const }));
      }
      if (prevRows.length > 0) return prevRows;
      return [{ color: '', quantity: null, countType: 'exact' as const }];
    });
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // 自动保存（800ms debounce，修改即存）
  const persist = (m: string, r: ColorRow[], status: 'counted' | 'skipped') => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const ok = await onSave(m, r, status);
      if (ok) { setLastSaved(new Date()); setDirty(false); }
    }, 800);
  };

  const updateRow = (i: number, patch: Partial<ColorRow>) => {
    setRows(prev => {
      const next = prev.map((r, idx) => idx === i ? { ...r, ...patch } : r);
      setDirty(true);
      persist(model, next, 'counted');
      return next;
    });
  };

  const addColor = () => {
    setRows(prev => {
      const next = [...prev, { color: '', quantity: null, countType: 'exact' as const }];
      setDirty(true);
      return next;
    });
  };

  const removeColor = (i: number) => {
    setRows(prev => {
      const next = prev.filter((_, idx) => idx !== i);
      setDirty(true);
      persist(model, next, 'counted');
      return next;
    });
  };

  const stepQty = (i: number, delta: number) => {
    updateRow(i, { quantity: Math.max(0, (rows[i]?.quantity ?? 0) + delta) });
  };

  const saveAndNext = async () => {
    setSaving(true);
    await onSave(model, rows, 'counted');
    setSaving(false);
    onNext();
  };

  const skip = async () => {
    setSaving(true);
    await onSave(model, [], 'skipped');
    setSaving(false);
    onNext();
  };

  if (!model) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>{t('inv.none')}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 90 }}>
      {/* 顶部：产品 + 品牌 + 进度 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{productName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{brand} · {index + 1} / {total}</div>
        </div>
        <div style={{ fontSize: 12, color: dirty ? '#f59e0b' : '#10b981' }}>
          {dirty ? t('inv.saving') : lastSaved ? `✓ ${lastSaved.toLocaleTimeString()}` : ''}
        </div>
      </div>

      {/* 进度条 */}
      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-hover)', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--accent)', width: `${((index + 1) / total) * 100}%`, transition: 'width .2s' }} />
      </div>

      {/* 当前型号 */}
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{model}</div>

      {/* 已盘型号（横向小条） */}
      {doneModels.size > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
          {t('inv.counted')}：{[...doneModels].slice(-8).map(m => <span key={m} style={{ background: 'rgba(16,185,129,.1)', color: '#059669', padding: '2px 6px', borderRadius: 8 }}>✓ {m}</span>)}
        </div>
      )}

      {/* 颜色行 */}
      {rows.map((r, i) => (
        <div key={i} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 8, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={r.color}
              onChange={e => updateRow(i, { color: e.target.value })}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: 14, color: 'var(--text-primary)' }}
            >
              <option value="">{t('inv.pickColor')}</option>
              {COLOR_CHOICES.map(c => <option key={c.es} value={c.es}>{lang === 'es' ? c.es : c.zh}</option>)}
            </select>
            <button type="button" onClick={() => removeColor(i)} style={{ border: 'none', background: 'transparent', color: '#dc2626', fontSize: 16, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={() => stepQty(i, -5)} style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', cursor: 'pointer' }}>-5</button>
            <button type="button" onClick={() => stepQty(i, -1)} style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', cursor: 'pointer' }}>-1</button>
            <input
              type="number"
              value={r.quantity ?? ''}
              onChange={e => updateRow(i, { quantity: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })}
              placeholder="{t('inv.qty')}"
              style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 8, border: `1px solid ${r.quantity === 0 ? '#dc2626' : 'var(--border-color)'}`, fontSize: 18, fontWeight: 700, background: r.quantity === 0 ? '#fef2f2' : 'var(--bg-primary)', color: r.quantity === 0 ? '#dc2626' : 'var(--text-primary)' }}
            />
            <button type="button" onClick={() => stepQty(i, 1)} style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', cursor: 'pointer' }}>+1</button>
            <button type="button" onClick={() => stepQty(i, 5)} style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', cursor: 'pointer' }}>+5</button>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button type="button" onClick={() => updateRow(i, { countType: 'exact' })} className="btn btn-sm" style={r.countType === 'exact' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}>{t('inv.exact')}</button>
            <button type="button" onClick={() => updateRow(i, { countType: 'estimated' })} className="btn btn-sm" style={r.countType === 'estimated' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}>{t('inv.estimated')}</button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('inv.zeroHint')}</span>
          </div>
        </div>
      ))}

      <button type="button" onClick={addColor} className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>{t('inv.addColor')}</button>

      {/* 颜色自动继承开关 */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={autoInherit} onChange={e => setAutoInherit(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--accent)' }} />
        {t('inv.inherit')}
      </label>

      {/* 底部固定操作栏 */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '10px 14px', background: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8, zIndex: 20, maxWidth: 480, margin: '0 auto' }}>
        <button type="button" className="btn" onClick={onPrev} disabled={index === 0 || saving} style={{ flex: 1, padding: 12 }}>{t('inv.prev')}</button>
        <button type="button" className="btn" onClick={skip} disabled={saving} style={{ flex: 1, padding: 12, color: '#f59e0b' }}>{t('inv.skip')}</button>
        <button type="button" className="btn btn-primary" onClick={saveAndNext} disabled={saving} style={{ flex: 1.5, padding: 12 }}>
          {saving ? t('common.loading') : index === total - 1 ? t('inv.done') : t('inv.saveNext')}
        </button>
      </div>
    </div>
  );
}

export default InventoryModelCounter;
