// 颜色选择器（文档 10：常用颜色 + 特殊选项 + 自定义颜色）
import React, { useState } from 'react';
import { COMMON_COLORS, SPECIAL_COLORS } from '../../services/mobileColors';
import { useI18n } from '../../i18n';
import { ColorSwatch, DEFAULT_COLOR_HEX } from './ColorSwatch';

interface Props {
  selected: string[];
  onChange: (colors: string[]) => void;
  allowSpecial?: boolean;
  multiple?: boolean;
  /** 网站现有变体颜色（优先显示；为空时用默认常用色） */
  options?: string[];
  /** 颜色名 → hex 色值（缺省时用内置默认色） */
  colorHex?: Record<string, string>;
  /** 颜色名 → 纹理小图片 URL（有图时优先于 hex 色块） */
  colorTexture?: Record<string, string>;
}

export function ColorSelector({ selected, onChange, allowSpecial = true, multiple = true, options, colorHex, colorTexture }: Props) {
  const { t } = useI18n();
  const [custom, setCustom] = useState('');
  const colorOptions = options && options.length > 0 ? options : COMMON_COLORS;

  const toggle = (color: string) => {
    if (!multiple) {
      onChange([color]);
      return;
    }
    if (selected.includes(color)) onChange(selected.filter(c => c !== color));
    else onChange([...selected, color]);
  };

  const addCustom = () => {
    const value = custom.trim();
    if (!value) return;
    if (!selected.includes(value)) onChange([...selected, value]);
    setCustom('');
  };

  const isSelected = (c: string) => selected.includes(c);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {colorOptions.map(color => (
          <button
            key={color}
            type="button"
            onClick={() => toggle(color)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 12px 7px 10px', minHeight: 40, borderRadius: 16, border: '1px solid var(--border-color)',
              background: isSelected(color) ? 'var(--accent)' : 'var(--bg-secondary)',
              color: isSelected(color) ? '#fff' : 'var(--text-primary)',
              fontSize: 14, cursor: 'pointer',
            }}
          >
            <ColorSwatch
              hex={colorHex?.[color] || DEFAULT_COLOR_HEX[color] || ''}
              textureUrl={colorTexture?.[color]}
              selected={isSelected(color)}
            />
            {color}
          </button>
        ))}
      </div>

      {allowSpecial && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SPECIAL_COLORS.map(color => (
            <button
              key={color}
              type="button"
              onClick={() => toggle(color)}
              style={{
                padding: '5px 9px', borderRadius: 12, border: '1px dashed var(--border-color)',
                background: isSelected(color) ? 'var(--accent-light)' : 'transparent',
                color: isSelected(color) ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              {color}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          placeholder={t('color.custom')}
          style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <button type="button" onClick={addCustom} className="btn btn-sm">{t('color.add')}</button>
      </div>
    </div>
  );
}

export default ColorSelector;
