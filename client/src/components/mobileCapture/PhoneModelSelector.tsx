// 手机壳点货：手机型号选择器（品牌 → 型号 → 颜色，勾选统计用，不同步网站）
import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import { ColorSwatch, DEFAULT_COLOR_HEX } from './ColorSwatch';

export interface PhoneModelGroup {
  brand: string;
  models: string[];
}

export interface SelectedPhoneModel {
  model: string;
  colors: string[];
}

interface Props {
  groups: PhoneModelGroup[];
  selected: SelectedPhoneModel[];
  onChange: (models: SelectedPhoneModel[]) => void;
  /** 网站变体颜色列表（优先显示，直接使用网站色名；为空时用默认点货颜色） */
  colorOptions?: string[];
  /** 产品固定颜色：点击型号时自动勾选这些颜色 */
  defaultColors?: string[];
  /** 颜色名 → hex 色值（网站属性值颜色；缺省时用内置默认色） */
  colorHex?: Record<string, string>;
  /** 颜色名 → 纹理小图片 URL（网站上传了图片的颜色；有图时优先于 hex 色块） */
  colorTexture?: Record<string, string>;
}

const PREVIEW_LIMIT = 15;

// 点货用常用颜色（存储统一中文便于统计；显示按界面语言翻译，键见 i18n 'color.*'）
const COLOR_CHOICES: { key: string; zh: string }[] = [
  { key: 'color.red', zh: '红' },
  { key: 'color.orange', zh: '橙' },
  { key: 'color.yellow', zh: '黄' },
  { key: 'color.green', zh: '绿' },
  { key: 'color.blue', zh: '蓝' },
  { key: 'color.purple', zh: '紫' },
  { key: 'color.pink', zh: '粉' },
  { key: 'color.black', zh: '黑' },
  { key: 'color.white', zh: '白' },
  { key: 'color.gray', zh: '灰' },
  { key: 'color.transparent', zh: '透明' },
  { key: 'color.other', zh: '其他' },
];

export function PhoneModelSelector({ groups, selected, onChange, colorOptions, colorHex, colorTexture, defaultColors }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  if (!groups || groups.length === 0) return null;

  // 搜索过滤：匹配品牌名或型号名（不区分大小写）；有搜索词时显示全部匹配型号（不受预览条数限制）
  const q = query.trim().toLowerCase();
  const filterGroups = q
    ? groups
        .map(g => ({
          brand: g.brand,
          models: g.models.filter(m => m.toLowerCase().includes(q) || g.brand.toLowerCase().includes(q)),
        }))
        .filter(g => g.models.length > 0 || g.brand.toLowerCase().includes(q))
    : groups;

  // 颜色选项：有网站变体颜色时直接用它（西语名直存直显）；否则用默认点货色（显示按语言翻译、存储中文）
  const choices: { value: string; label: string }[] =
    colorOptions && colorOptions.length > 0
      ? [...new Set(colorOptions)].map(c => ({ value: c, label: c }))
      : COLOR_CHOICES.map(c => ({ value: c.zh, label: t(c.key) }));

  const getModel = (model: string) => selected.find(s => s.model === model);

  const toggleModel = (model: string) => {
    if (getModel(model)) {
      onChange(selected.filter(s => s.model !== model));
      // 取消勾选时同时收起该型号的色卡
      setExpandedModels(s => { const n = { ...s }; delete n[model]; return n; });
    } else {
      onChange([...selected, { model, colors: defaultColors ? [...defaultColors] : [] }]);
    }
  };

  // 展开/收起单个型号的色卡（+ / -）
  const toggleModelExpand = (model: string) => {
    setExpandedModels(s => ({ ...s, [model]: !s[model] }));
  };

  const toggleColor = (model: string, color: string) => {
    const item = getModel(model);
    if (!item) return;
    const has = item.colors.includes(color);
    onChange(selected.map(s => s.model === model
      ? { ...s, colors: has ? s.colors.filter(c => c !== color) : [...s.colors, color] }
      : s));
  };

  const toggleBrand = (brand: string, models: string[]) => {
    const brandModels = models;
    const selectedBrand = brandModels.filter(m => getModel(m));
    if (selectedBrand.length === brandModels.length) {
      onChange(selected.filter(s => !brandModels.includes(s.model)));
    } else {
      const merged = [...selected];
      for (const m of brandModels) if (!getModel(m)) merged.push({ model: m, colors: [] });
      onChange(merged);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 搜索栏：快速输入型号跳转/过滤 */}
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={t('phone.search')}
        style={{
          padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
          fontSize: 14, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box',
        }}
      />
      {q && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {t('phone.searchResult').replace('{n}', String(filterGroups.reduce((s, g) => s + g.models.length, 0)))}
        </div>
      )}
      {filterGroups.map(g => {
        const brandSelected = g.models.filter(m => getModel(m)).length;
        const allSelected = brandSelected === g.models.length && g.models.length > 0;
        const isExpanded = !!expanded[g.brand];
        const visible = q ? g.models : (isExpanded ? g.models : g.models.slice(0, PREVIEW_LIMIT));
        const showMore = !q && g.models.length > PREVIEW_LIMIT;
        return (
          <div key={g.brand} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 8, background: 'var(--bg-secondary)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 6, padding: 4, minHeight: 36 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => toggleBrand(g.brand, g.models)}
                style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
              />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                {g.brand} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({brandSelected}/{g.models.length})</span>
              </span>
              {showMore && (
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setExpanded(s => ({ ...s, [g.brand]: !isExpanded })); }}
                  style={{ marginLeft: 'auto', fontSize: 13, padding: '8px 6px', border: 'none', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {isExpanded ? t('phone.collapse') : t('phone.expand').replace('{n}', String(g.models.length))}
                </button>
              )}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visible.map(m => {
                const item = getModel(m);
                const checked = !!item;
                return (
                  <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                      <button
                        type="button"
                        onClick={() => toggleModel(m)}
                        style={{
                          flex: 1, textAlign: 'left', fontSize: 14, padding: '10px 12px', minHeight: 44, borderRadius: 8, cursor: 'pointer',
                          border: checked ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                          background: checked ? 'var(--accent-light, rgba(59,130,246,.15))' : 'var(--bg-primary)',
                          color: checked ? 'var(--accent)' : 'var(--text-secondary)',
                          fontWeight: checked ? 600 : 400,
                        }}
                      >
                        {checked ? '☑ ' : '☐ '}{m}
                      </button>
                      {checked && (
                        <button
                          type="button"
                          onClick={() => toggleModelExpand(m)}
                          title={expandedModels[m] ? '− 收起色卡' : '+ 展开色卡'}
                          style={{
                            width: 44, minHeight: 44, borderRadius: 8, cursor: 'pointer', fontSize: 20, lineHeight: 1,
                            border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                            color: 'var(--text-secondary)', flexShrink: 0,
                          }}
                        >
                          {expandedModels[m] ? '−' : '+'}
                        </button>
                      )}
                    </div>
                    {checked && expandedModels[m] && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 10 }}>
                        {choices.map(c => {
                          const cOn = item.colors.includes(c.value);
                          const hex = colorHex?.[c.value] || DEFAULT_COLOR_HEX[c.value] || '';
                          const textureUrl = colorTexture?.[c.value] || '';
                          return (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => toggleColor(m, c.value)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                fontSize: 14, padding: '9px 12px 9px 10px', minHeight: 42, borderRadius: 18, cursor: 'pointer',
                                border: cOn ? '1px solid #10b981' : '1px solid var(--border-color)',
                                background: cOn ? 'rgba(16,185,129,.12)' : 'var(--bg-primary)',
                                color: cOn ? '#059669' : 'var(--text-secondary)',
                                fontWeight: cOn ? 600 : 400,
                              }}
                            >
                              <ColorSwatch hex={hex} textureUrl={textureUrl} selected={cOn} />
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default PhoneModelSelector;
