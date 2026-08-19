// 产品属性快捷编辑（与产品属性编辑页面同 API：改属性 + 传产品图片）
import React, { useEffect, useState } from 'react';
import { productsApi, prestashopApi } from '../../services/api';
import { useToast } from '../ui/ToastProvider';
import { useConfirm } from '../ui/ConfirmProvider';

interface Props {
  reference: string;
  onChanged: () => void;
}

const SLOTS = [
  { role: 'main_product', label: '产品主图', icon: '🖼' },
  { role: 'packaging', label: '产品包装图', icon: '📦' },
  { role: 'scene1', label: '场景图 1', icon: '🏠' },
  { role: 'scene2', label: '场景图 2', icon: '🏢' },
  { role: 'scene3', label: '场景图 3', icon: '🔍' },
  { role: 'scene4', label: '场景图 4', icon: '📎' },
  { role: 'scene5', label: '场景图 5', icon: '🔬' },
  { role: 'scene6', label: '场景图 6', icon: '📋' },
];

function slotLabel(slot: string): string {
  return SLOTS.find(s => s.role === slot)?.label || slot || '其他';
}

export function ProductQuickEdit({ reference, onChanged }: Props) {
  const { success, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const [product, setProduct] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState('');
  const [syncingImages, setSyncingImages] = useState(false);

  const imgUrl = (img: any): string => {
    const localPath = img.local_path || img.localPath || '';
    const parts = localPath.replace(/\\/g, '/').split('/uploads/')[1]?.split('/') || [];
    if (parts.length >= 2) {
      return `/api/upload/file/product/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[parts.length - 1])}`;
    }
    return '';
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await productsApi.getDetail(reference);
      if (res.success) {
        const p = res.data;
        setProduct(p);
        setForm({
          name: p.name || '',
          category: p.category || '',
          brand: p.brand || '',
          model: p.model || '',
          ean13: p.ean13 || '',
          price: p.price !== undefined && p.price !== null ? String(p.price) : '',
          wholesale_price: p.wholesale_price !== undefined && p.wholesale_price !== null ? String(p.wholesale_price) : '',
          quantity: p.quantity !== undefined && p.quantity !== null ? String(p.quantity) : '',
        });
      }
      const imgRes = await fetch(`/api/upload/product/${encodeURIComponent(reference)}`).then(r => r.json());
      if (imgRes.success) setImages(imgRes.data || []);
    } catch (e: any) {
      toastError('加载产品失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [reference]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      await productsApi.update(reference, {
        name: form.name,
        category: form.category,
        brand: form.brand,
        model: form.model,
        ean13: form.ean13,
        price: form.price === '' ? null : Number(form.price),
        wholesale_price: form.wholesale_price === '' ? null : Number(form.wholesale_price),
        quantity: form.quantity === '' ? null : Number(form.quantity),
      });
      success('✅ 产品属性已保存');
      load();
      onChanged();
    } catch (e: any) {
      toastError('保存失败: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  /** 上传图片到指定槽位 */
  const uploadToSlot = async (slotRole: string, file: File) => {
    if (!file) return;
    setUploadingSlot(slotRole);
    const fd = new FormData();
    fd.append('images', file);
    fd.append('status', 'ok');
    fd.append('image_slot', slotRole);
    fd.append('role', slotRole);
    try {
      const res = await fetch(`/api/upload/upload-batch/${encodeURIComponent(reference)}`, { method: 'POST', body: fd }).then(r => r.json());
      if (res.success) {
        success(`✅ ${slotLabel(slotRole)}上传成功（${res.message || ''}）`);
        load();
        onChanged();
      } else {
        toastError(res.error || '上传失败');
      }
    } catch (e: any) {
      toastError('上传失败: ' + e.message);
    } finally {
      setUploadingSlot('');
    }
  };

  const removeImage = async (img: any) => {
    const ok = await confirm(`删除产品图片「${img.filename || img.local_path || ''}」？`, { title: '删除图片', danger: true });
    if (!ok) return;
    try {
      await fetch(`/api/upload/image/${img.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      toastError('删除失败: ' + e.message);
    }
  };

  if (loading && !product) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>加载产品数据...</div>;
  }
  if (!product) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>无法加载产品（Reference: {reference}）</div>;
  }

  const field = (label: string, key: string, placeholder?: string, type = 'text') => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--text-secondary)' }}>
      {label}
      <input
        type={type}
        value={form[key] ?? ''}
        onChange={set(key)}
        placeholder={placeholder}
        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      />
    </label>
  );

  // 每个槽位当前图片（取该槽位第一张；同槽位多张显示数量）
  const slotImages = (role: string) => images.filter(i => (i.image_slot || i.role) === role);
  // 不在 5 个标准槽位里的图片
  const otherImages = images.filter(i => !SLOTS.some(s => s.role === (i.image_slot || i.role)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
      {/* 属性编辑 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>属性编辑</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {field('产品名称', 'name')}
        {field('分类', 'category')}
        {field('品牌', 'brand')}
        {field('型号', 'model')}
        {field('EAN', 'ean13')}
        {field('价格 (€)', 'price', '0.00', 'number')}
        {field('批发价 (€)', 'wholesale_price', '0.00', 'number')}
        {field('库存数量', 'quantity', '0', 'number')}
      </div>
      <div>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? '保存中...' : '💾 保存属性'}
        </button>
      </div>

      {/* 图片槽位：全部列出，每个槽位独立上传（与产品属性编辑页面一致） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>产品图片（点击上传/替换）</div>
        <button
          type="button"
          className="btn btn-sm"
          disabled={syncingImages}
          onClick={async () => {
            const ok = await confirm('把当前产品槽位图上传到 PrestaShop 网站？', { title: '同步图片到网站' });
            if (!ok) return;
            setSyncingImages(true);
            try {
              const res = await prestashopApi.syncImages(reference);
              if (res.success) { success(res.error ? `⚠️ ${res.error}` : `✅ 图片同步完成：成功 ${res.successCount ?? 0} 张${(res.failedCount ?? 0) > 0 ? `，失败 ${res.failedCount}` : ''}`); load(); }
              else toastError(res.error || '同步失败');
            } catch (e: any) { toastError('同步失败: ' + e.message); }
            finally { setSyncingImages(false); }
          }}
        >
          {syncingImages ? '同步中...' : '📤 同步图片到网站'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {SLOTS.map(s => {
          const slotImgs = slotImages(s.role);
          const img = slotImgs[0];
          return (
            <div key={s.role} style={{ border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '6px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{s.icon} {s.label}</span>
                {slotImgs.length > 1 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>×{slotImgs.length}</span>}
              </div>
              {img && imgUrl(img) ? (
                <img src={imgUrl(img)} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: 100, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                  暂无图片
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, padding: 6 }}>
                <label style={{ flex: 1, textAlign: 'center', fontSize: 12, padding: '5px 0', borderRadius: 6, background: 'var(--accent)', color: '#fff', cursor: 'pointer', opacity: uploadingSlot === s.role ? .6 : 1 }}>
                  {uploadingSlot === s.role ? '上传中...' : img ? '🔄 替换' : '⬆️ 上传'}
                  <input
                    type="file"
                    accept="image/*"
                    data-slot={s.role}
                    style={{ display: 'none' }}
                    disabled={uploadingSlot !== ''}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) uploadToSlot(s.role, f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {img && (
                  <button
                    type="button"
                    onClick={() => removeImage(img)}
                    title="删除"
                    style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 其他槽位图片（如场景图 4-8） */}
      {otherImages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>其他图片（{otherImages.length} 张）：</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
            {otherImages.map(img => (
              <div key={img.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                {imgUrl(img) ? (
                  <img src={imgUrl(img)} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: 80, background: 'repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb 8px,#d1d5db 8px,#d1d5db 16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#6b7280' }}>文件缺失</div>
                )}
                <div style={{ position: 'absolute', top: 4, left: 4, fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(0,0,0,.6)', color: '#fff' }}>
                  {slotLabel(img.image_slot || img.role)}
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(img)}
                  style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(220,38,38,.85)', color: '#fff', border: 'none', borderRadius: 6, width: 22, height: 22, fontSize: 11, cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductQuickEdit;
