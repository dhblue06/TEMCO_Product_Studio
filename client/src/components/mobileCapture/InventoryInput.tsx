// 库存录入（文档 11：按颜色录入 + 快速按钮 + 四种模式）
import React from 'react';
import { useI18n } from '../../i18n';

export interface InventoryRow {
  colorName: string;
  quantity: number | null;
  countType: 'exact' | 'estimated' | 'sufficient' | 'unknown';
}

interface Props {
  colors: string[];               // 产品颜色（含特殊选项如 Sin variante de color）
  rows: InventoryRow[];
  onChange: (rows: InventoryRow[]) => void;
}

const QUICK = [0, 1, 2, 5, 10, 20];
const TYPE_KEYS: Record<InventoryRow['countType'], string> = {
  exact: 'inv.exact', estimated: 'inv.estimated', sufficient: 'inv.sufficient', unknown: 'inv.unknown',
};

export function InventoryInput({ colors, rows, onChange }: Props) {
  const { t } = useI18n();
  const effectiveColors = colors.length > 0 ? colors : ['Sin variante de color'];

  const getRow = (color: string) => rows.find(r => r.colorName === color) || { colorName: color, quantity: null, countType: 'unknown' as const };

  const setRow = (color: string, patch: Partial<InventoryRow>) => {
    const next = rows.filter(r => r.colorName !== color);
    next.push({ ...getRow(color), ...patch });
    onChange(next);
  };

  const applyQuick = (color: string, value: number) => {
    setRow(color, { quantity: value, countType: 'exact' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {effectiveColors.map(color => {
        const row = getRow(color);
        return (
          <div key={color} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{color}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['exact', 'estimated', 'sufficient', 'unknown'] as const).map(ct => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => setRow(color, { countType: ct, quantity: ct === 'unknown' || ct === 'sufficient' ? null : row.quantity })}
                    style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 8, cursor: 'pointer',
                      border: row.countType === ct ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                      background: row.countType === ct ? 'var(--accent-light)' : 'var(--bg-secondary)',
                      color: row.countType === ct ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {t(TYPE_KEYS[ct])}
                  </button>
                ))}
              </div>
            </div>

            {(row.countType === 'exact' || row.countType === 'estimated') && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="number"
                  min={0}
                  value={row.quantity ?? ''}
                  placeholder={t('inv.qty')}
                  onChange={e => setRow(color, { quantity: e.target.value === '' ? null : parseInt(e.target.value, 10) || 0 })}
                  style={{ width: 80, padding: '8px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 15, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {QUICK.map(q => (
                    <button key={q} type="button" onClick={() => applyQuick(color, q)} style={quickBtnStyle}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {row.countType === 'sufficient' && <div style={{ fontSize: 13, color: '#10b981' }}>{t('inv.stockEnough')}</div>}
            {row.countType === 'unknown' && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('inv.unknown')}</div>}
          </div>
        );
      })}
    </div>
  );
}

const quickBtnStyle: React.CSSProperties = {
  fontSize: 13, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
};

export default InventoryInput;
