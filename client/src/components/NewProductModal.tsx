import React, { useCallback, useEffect, useState } from 'react';
import { prestashopApi, productsApi } from '../services/api';
import './Modal.css';

interface WebsiteOption { id: string | number; name: any; active?: string | number }

interface Props {
  onClose: () => void;
  onCreated: (reference: string) => void;
}

function optionName(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value).trim();
  if (Array.isArray(value)) return optionName(value[0]);
  return optionName(value['#text'] ?? value.language ?? value.name ?? '');
}

export default function NewProductModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({ reference: '', name: '', ean13: '', price: '', categoryId: '', manufacturerId: '' });
  const [categories, setCategories] = useState<WebsiteOption[]>([]);
  const [manufacturers, setManufacturers] = useState<WebsiteOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    setError('');
    try {
      const [categoryRes, manufacturerRes] = await Promise.all([
        prestashopApi.getCategories(),
        prestashopApi.getManufacturers(),
      ]);
      if (!categoryRes.success || !manufacturerRes.success) {
        throw new Error(categoryRes.error || manufacturerRes.error || '无法读取网站分类或品牌');
      }
      setCategories((categoryRes.data || []).filter((item: WebsiteOption) => String(item.active ?? '1') !== '0'));
      setManufacturers((manufacturerRes.data || []).filter((item: WebsiteOption) => String(item.active ?? '1') !== '0'));
    } catch (e: any) {
      setError(`无法读取 PrestaShop 分类和品牌：${e.message}`);
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => { void loadOptions(); }, [loadOptions]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const price = form.price.trim() === '' ? NaN : Number(form.price.replace(',', '.'));
    if (!form.reference.trim() || !form.name.trim()) return setError('请填写商品 Reference 和商品名称');
    if (!Number.isFinite(price) || price < 0) return setError('请填写有效的销售价格');
    const category = categories.find(item => String(item.id) === form.categoryId);
    const manufacturer = manufacturers.find(item => String(item.id) === form.manufacturerId);
    if (!category || !manufacturer) return setError('请选择网站分类和品牌');

    setSaving(true);
    setError('');
    try {
      const result = await productsApi.create({
        reference: form.reference.trim(),
        name: form.name.trim(),
        ean13: form.ean13.trim(),
        price,
        category: optionName(category.name),
        brand: optionName(manufacturer.name),
        prestashopCategoryId: Number(category.id),
        prestashopManufacturerId: Number(manufacturer.id),
      });
      if (!result.success) throw new Error(result.error || '创建失败');
      onCreated(form.reference.trim());
    } catch (e: any) {
      setError(e.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle: React.CSSProperties = { width: '100%', padding: '9px 10px', border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--bg-primary)', color: 'var(--text-primary)' };

  return (
    <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="new-product-title">
        <div className="modal-header">
          <h3 id="new-product-title">新增产品</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving} aria-label="关闭">✕</button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={{ fontSize: 13 }}>Reference *
              <input autoFocus value={form.reference} onChange={e => setForm(prev => ({ ...prev, reference: e.target.value }))} style={fieldStyle} placeholder="例如 AY-49Z" maxLength={128} />
            </label>
            <label style={{ fontSize: 13 }}>EAN / 条形码
              <input value={form.ean13} onChange={e => setForm(prev => ({ ...prev, ean13: e.target.value }))} style={fieldStyle} inputMode="numeric" maxLength={32} />
            </label>
            <label style={{ fontSize: 13, gridColumn: '1 / -1' }}>商品名称（西语） *
              <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} style={fieldStyle} maxLength={255} />
            </label>
            <label style={{ fontSize: 13 }}>销售价格 (€) *
              <input value={form.price} onChange={e => setForm(prev => ({ ...prev, price: e.target.value }))} style={fieldStyle} inputMode="decimal" placeholder="0.00" />
            </label>
            <div />
            <label style={{ fontSize: 13 }}>PrestaShop 分类 *
              <select value={form.categoryId} onChange={e => setForm(prev => ({ ...prev, categoryId: e.target.value }))} style={fieldStyle} disabled={loadingOptions}>
                <option value="">请选择分类</option>
                {categories.map(item => <option key={item.id} value={item.id}>{optionName(item.name) || `分类 #${item.id}`}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>PrestaShop 品牌 *
              <select value={form.manufacturerId} onChange={e => setForm(prev => ({ ...prev, manufacturerId: e.target.value }))} style={fieldStyle} disabled={loadingOptions}>
                <option value="">请选择品牌</option>
                {manufacturers.map(item => <option key={item.id} value={item.id}>{optionName(item.name) || `品牌 #${item.id}`}</option>)}
              </select>
            </label>
            {loadingOptions ? <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-muted)' }}>正在读取网站分类和品牌…</div> : null}
            {error ? <div role="alert" style={{ gridColumn: '1 / -1', color: '#dc2626', fontSize: 12 }}>
              {error} {!loadingOptions && categories.length === 0 ? <button type="button" className="btn btn-sm" onClick={() => void loadOptions()}>重试</button> : null}
            </div> : null}
          </div>
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={saving || loadingOptions || categories.length === 0 || manufacturers.length === 0}>{saving ? '正在创建…' : '创建产品'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
