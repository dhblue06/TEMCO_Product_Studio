import React, { useState, useEffect, useRef } from 'react';
import { productsApi } from '../services/api';
import { Product } from '../types';
import ImageViewerModal from './ImageViewerModal';
import EditableSelect from './EditableSelect';
import { prestashopApi } from '../services/api';
import VariantEditPanel from './mobileCapture/VariantEditPanel';

interface ProductDetailProps {
  reference: string | null;
  refreshKey?: number;
  onUpdated: () => void;
}

type UploadKind = 'ok' | 'white_bg' | 'scene';

const UPLOAD_KINDS: { id: UploadKind; label: string; desc: string }[] = [
  { id: 'ok', label: '原始产品图', desc: '用于AI参考、白底处理和审核' },
  { id: 'white_bg', label: '白底图', desc: '已处理好的白底主图或包装图' },
  { id: 'scene', label: '场景使用图', desc: '本地上传的使用场景、细节或展示图' },
];

const IMAGE_STATUS_LABELS: Record<string, string> = {
  ok: '原图',
  white_bg: '白底图',
  scene: '场景图',
  processed: '处理图',
  ai_generated: 'AI生成',
};

const ProductDetail: React.FC<ProductDetailProps> = ({ reference, refreshKey, onUpdated }) => {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeLang, setActiveLang] = useState<'es' | 'zh'>('es');
  const [localContent, setLocalContent] = useState<any>(null);
  const [localStatus, setLocalStatus] = useState('');
  const [message, setMessage] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadTarget, setUploadTarget] = useState('');
  const [validatingPS, setValidatingPS] = useState(false);
  const [syncingPS, setSyncingPS] = useState(false);
  const [psSyncMessage, setPsSyncMessage] = useState('');
  const [showVariantEdit, setShowVariantEdit] = useState(false);
  const [uploadKind, setUploadKind] = useState<UploadKind>('ok');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(['white_product', 'white_packaging', 'scene1', 'scene2', 'scene3']));
  const [generating, setGenerating] = useState(false);
  const [genLog, setGenLog] = useState<string[]>([]);
  const [showViewer, setShowViewer] = useState(false);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [allBrands, setAllBrands] = useState<string[]>([]);
  const [savingImageId, setSavingImageId] = useState<number | null>(null);
  const [generatingAlt, setGeneratingAlt] = useState<number | null>(null);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [slotCount, setSlotCount] = useState(6);
  const [showAllImages, setShowAllImages] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const GEN_TYPES = [
    { id: 'white_product', icon: '⬜', label: '产品白底精修图', desc: '基于原始产品图生成白底产品图' },
    { id: 'white_packaging', icon: '📦', label: '包装白底精修图', desc: '基于原始产品图生成白底包装图' },
    { id: 'scene1', icon: '🏠', label: '使用场景图 1', desc: '真实使用环境' },
    { id: 'scene2', icon: '🏢', label: '使用场景图 2', desc: '专业商用场景' },
    { id: 'scene3', icon: '🔍', label: '使用场景图 3', desc: '产品细节特写' },
  ];

const getSlots = (count: number) => {
  const baseSlots = [
    { role: 'main_product', icon: '🖼', label: '产品主图', desc: '产品主体白底精修图' },
    { role: 'packaging', icon: '📦', label: '产品包装图', desc: '产品包装盒展示' },
  ];
  const extraSlots = [
    { role: 'scene1', icon: '🏠', label: '场景图 1', desc: '真实使用环境' },
    { role: 'scene2', icon: '🏢', label: '场景图 2', desc: '专业商用场景' },
    { role: 'scene3', icon: '🔍', label: '场景图 3', desc: '产品细节特写' },
    { role: 'scene4', icon: '📎', label: '场景图 4', desc: '使用场景扩展' },
    { role: 'scene5', icon: '🔬', label: '场景图 5', desc: '功能细节展示' },
    { role: 'scene6', icon: '📋', label: '场景图 6', desc: '说明图' },
    { role: 'scene7', icon: '📐', label: '场景图 7', desc: '尺寸/规格图' },
    { role: 'scene8', icon: '🏷', label: '场景图 8', desc: '标签/包装细节' },
  ];
  const slots = [...baseSlots, ...extraSlots.slice(0, count - 2)];
  return slots;
};

  const fetchDetail = async (targetReference = reference) => {
    if (!targetReference) return;
    setLoading(true);
    try {
      const res = await productsApi.getDetail(targetReference);
      if (res.success) {
        setProduct(res.data);
        setLocalContent(res.data.content);
        setLocalStatus(res.data.status);
        setPriceInput(String(res.data?.price ?? ''));
        setQuantityInput(String(res.data?.quantity ?? 0));
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!reference) return;
    const detail = await productsApi.getDetail(reference);
    if (detail.success) {
      setProduct(detail.data);
      // 刷新后自动更新状态
      const p = detail.data;
      const imgs = p.images || [];
      const content = p.content?.es;
      let newStatus = '待处理';

      if (imgs.some((img: any) => getImageSlot(img) === 'main_product')) newStatus = '已匹配图片';
      if (content?.name) newStatus = '双语文案已生成';
      if (content?.seoTitle && content?.seoDescription) newStatus = 'SEO通过';
      if (p.prestashop_id) {
        if (p.prestashop_sync_status === 'synced') newStatus = '已上传';
        else if (p.prestashop_sync_status === 'failed') newStatus = '上传失败';
        else newStatus = '已上传';
      }

      if (newStatus !== p.status) {
        try { await productsApi.update(reference, { status: newStatus }); } catch {}
        setLocalStatus(newStatus);
      }
    }
  };

  useEffect(() => {
    if (!reference) { setProduct(null); setLocalContent(null); return; }
    fetchDetail(reference);
    // 加载分类和品牌列表
    fetch('/api/products/meta/categories').then(r=>r.json()).then(d=>{if(d.success)setAllCategories(d.data)}).catch(()=>{});
    fetch('/api/products/meta/brands').then(r=>r.json()).then(d=>{if(d.success)setAllBrands(d.data)}).catch(()=>{});
  }, [reference, refreshKey]);

  const getImageUrl = (img: any) => {
    const localPath = img.local_path || img.localPath;
    if (!localPath) return '';
    // 检查是否在产品文件夹中（引用号路由）
    const uploadsRoot = localPath.replace(/\\/g, '/').split('/uploads/')[0] + '/uploads/';
    const relativePath = localPath.replace(/\\/g, '/').split('/uploads/')[1] || '';
    const parts = relativePath.split('/').filter(Boolean);

    if (parts.length >= 2) {
      // 在产品子文件夹中：data/uploads/{reference}/{filename}
      const [, ...rest] = parts;
      const filename = rest.join('/');
      return `/api/upload/file/product/${encodeURIComponent(parts[0])}/${encodeURIComponent(filename)}`;
    }
    // 在根上传文件夹中
    return `/api/upload/file/${encodeURIComponent(parts[0] || '')}`;
  };

  const getImageStatusLabel = (status?: string) => IMAGE_STATUS_LABELS[status || 'ok'] || status || '原图';

  const isSourceImage = (img: any) => !['white_bg', 'scene', 'processed', 'ai_generated'].includes(img.status || 'ok');

  const getImageSlot = (img: any) => img.image_slot || img.imageSlot || img.role || img.role || '';

  const updateLocalImage = (imageId: number, field: string, value: string | number) => {
    setProduct(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        images: (prev.images || []).map((img: any) => img.id === imageId ? { ...img, [field]: value } : img),
      };
    });
  };

  const handleProductFieldChange = (field: 'selling_points' | 'product_intro' | 'video_url', value: string) => {
    setProduct((prev) => prev ? ({ ...prev, [field]: value }) : prev);
  };

  const handleFieldChange = (lang: 'es' | 'zh', field: string, value: string | string[]) => {
    setLocalContent((prev: any) => ({ ...prev, [lang]: { ...(prev?.[lang] || {}), [field]: value } }));
  };

  const buildProductPayload = () => {
    const parsedPrice = parseFloat(String(priceInput).replace(',', '.'));
    const parsedQuantity = parseInt(quantityInput, 10);
    const nextPrice = !isNaN(parsedPrice) && parsedPrice >= 0 ? parsedPrice : ((product as any)?.price ?? 0);
    const nextQuantity = !isNaN(parsedQuantity) && parsedQuantity >= 0 ? parsedQuantity : ((product as any)?.quantity ?? 0);
    return {
      status: localStatus,
      category: product?.category || '',
      brand: product?.brand || '',
      selling_points: product?.selling_points || '',
      product_intro: product?.product_intro || '',
      ean13: product?.ean13 || '',
      upc: product?.upc || '',
      mpn: product?.mpn || '',
      price: nextPrice,
      wholesale_price: (product as any)?.wholesale_price ?? 0,
      quantity: nextQuantity,
      video_url: product?.video_url || '',
      content: localContent,
    };
  };
  const handleSave = async () => {
    if (!reference || !product) return;
    setSaving(true); setMessage('');
    try {
      const payload = buildProductPayload();
      const res = await productsApi.update(reference, payload);
      if (res.success) {
        setProduct(prev => prev ? ({ ...prev, price: payload.price, quantity: payload.quantity } as any) : prev);
        setPriceInput(String(payload.price ?? 0));
        setQuantityInput(String(payload.quantity ?? 0));
        setMessage('✅ 保存成功');
        onUpdated();
      } else setMessage(`❌ ${res.error || '保存失败'}`);
    } catch (err: any) { setMessage(`❌ ${err.message}`); }
    finally { setSaving(false); setTimeout(() => setMessage(''), 3000); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length || !reference) return;
    setUploading(true); setMessage('');
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append('images', f));
      fd.append('status', uploadKind);
      fd.append('image_slot', uploadTarget || '');
      fd.append('role', uploadTarget || 'gallery');
      const res = await fetch(`/api/upload/upload-batch/${encodeURIComponent(reference)}`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ ${data.message}，已标记为${getImageStatusLabel(uploadKind)}`);
        await refreshDetail();
      } else setMessage(`❌ ${data.error || '上传失败'}`);
    } catch (err: any) { setMessage(`❌ ${err.message}`); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleSaveImage = async (img: any) => {
    setSavingImageId(img.id); setMessage('');
    try {
      const res = await fetch(`/api/upload/image/${img.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_name: img.original_name || img.originalName || '',
          export_name: img.export_name || img.exportName || '',
          alt: img.alt || '',
          status: img.status || 'ok',
          role: img.role || 'gallery',
          image_slot: getImageSlot(img),
          image_index: img.image_index || img.imageIndex || 1,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '图片保存失败');
      setMessage('✅ 图片信息已保存');
      await refreshDetail();
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setSavingImageId(null);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleSetMainImage = async (img: any) => {
    updateLocalImage(img.id, 'role', 'main');
    await handleSaveImage({ ...img, role: 'main' });
  };

  const handleDeleteImage = async (img: any) => {
    const name = img.original_name || img.originalName || `#${img.id}`;
    if (!window.confirm(`确定删除图片 #${img.id}？本地文件也会一起删除。`)) return;
    setSavingImageId(img.id); setMessage('');
    try {
      const res = await fetch(`/api/upload/image/${img.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '图片删除失败');
      setMessage('✅ 图片已删除');
      await refreshDetail();
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setSavingImageId(null);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleGenerateCopy = async () => {
    if (!reference) return;
    setGeneratingCopy(true);
    try {
      // 先保存卖点和介绍，防止生成后刷新被覆盖
      if (product) {
        await productsApi.update(reference, {
          selling_points: product.selling_points || '',
          product_intro: product.product_intro || '',
        });
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(`/api/copy/generate/${encodeURIComponent(reference)}`, { method: "POST", signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.success) {
        // 刷新详情以显示生成的文案
        const detailRes = await productsApi.getDetail(reference);
        if (detailRes.success) {
          setProduct(detailRes.data);
          // 同时更新本地内容，使编辑区立即显示新生成的文案
          const esContent = detailRes.data.content?.es || detailRes.data.esContent || null;
          const zhContent = detailRes.data.content?.zh || detailRes.data.zhContent || null;
          setLocalContent({ es: esContent, zh: zhContent });
        }
      }
    } catch (err: any) {
      setMessage(`❌ ${err.message || '生成失败'}`);
    }
    setGeneratingCopy(false);
  };

  const handleGenerateAlt = async (img: any) => {
    if (!reference) return;
    setGeneratingAlt(img.id);
    setMessage('');
    try {
      const res = await fetch(`/api/copy/generate-alt/${encodeURIComponent(reference)}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ ${data.message}`);
        const detailRes = await productsApi.getDetail(reference);
        if (detailRes.success) {
          setProduct(detailRes.data);
        }
      } else {
        setMessage(`❌ ${data.error || '生成失败'}`);
      }
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setGeneratingAlt(null);
    }
  };

  const handleGenerateAllAlt = async () => {
    if (!reference) return;
    setGeneratingAlt(-1); // -1 表示全部生成中
    setMessage('');
    try {
      const res = await fetch(`/api/copy/generate-alt/${encodeURIComponent(reference)}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ ${data.message}`);
        const detailRes = await productsApi.getDetail(reference);
        if (detailRes.success) setProduct(detailRes.data);
      } else {
        setMessage(`❌ ${data.error || '生成失败'}`);
      }
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setGeneratingAlt(null);
    }
  };

  const handleBatchGenerate = async () => {
    if (!reference || !product || !selectedTypes.size) return;
    setGenerating(true);
    setGenLog([]);

    const images = product.images || [];
    if (!images.length) {
      setGenLog(l => [...l, '❌ 请先上传至少一张原始产品图或参考图']);
      setGenerating(false); return;
    }

    const sourceImages = images.filter((img: any) => isSourceImage(img));
    const generationSources = sourceImages.length ? sourceImages : images;
    const mainSource = generationSources.find((img: any) => img.role === 'main') || generationSources[0];
    const types = GEN_TYPES.filter(t => selectedTypes.has(t.id));
    setGenLog(l => [...l, `🔄 开始生成 ${types.length} 种图片类型，参考图 ${generationSources.length} 张...`]);

    for (const t of types) {
      setGenLog(l => [...l, `⏳ ${t.icon} ${t.label}...`]);

      if (t.id === 'white_product' || t.id === 'white_packaging') {
        let done = 0;
        for (const img of generationSources) {
          try {
            const res = await fetch(`/api/upload/white-bg/${encodeURIComponent(reference)}/${img.id}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) done++;
          } catch { }
        }
        setGenLog(l => [...l, `  ✅ 已完成 ${done}/${generationSources.length} 张 ${t.label}`]);
      } else {
        try {
          setGenLog(l => [...l, `  ⏳ ${t.label} KIE 生成中（约 30-60 秒）...`]);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 180000);
          const res = await fetch(`/api/upload/scene/${encodeURIComponent(reference)}/${mainSource.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sceneType: t.id }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          const data = await res.json();
          if (data.success) setGenLog(l => [...l, `  ✅ ${t.label} 完成：${data.message || ''}`]);
          else setGenLog(l => [...l, `  ❌ ${t.label} 失败: ${data.error}`]);
        } catch (err: any) {
          setGenLog(l => [...l, `  ❌ ${t.label} ${err.name === 'AbortError' ? '超时' : '失败: ' + err.message}`]);
        }
      }
    }

    setGenLog(l => [...l, '✅ 全部完成，图片库已刷新']);
    await refreshDetail();
    setGenerating(false);
  };

  // 获取当前 AI 模型名称
  const selectedModel = React.useMemo(() => {
    const m = GEN_TYPES.find(t => t.id);
    return 'nano-banana-2';
  }, []);

  // 单个槽位 AI 生成
  const handleAiGenerate = async (role: string) => {
    if (!reference || !product) return;
    setGenerating(true);
    setGenLog([`⏳ 为 ${role} 生成...`]);
    try {
      const images = product.images || [];
      const sourceImg = images.find((img: any) => img.local_path);
      if (sourceImg) {
        const res = await fetch(`/api/upload/scene/${encodeURIComponent(reference)}/${sourceImg.id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sceneType: role }),
        });
        const data = await res.json();
        if (data.success) setGenLog(l => [...l, `✅ ${role} 生成完成`]);
        else setGenLog(l => [...l, `❌ ${data.error}`]);
      } else {
        setGenLog(l => [...l, '❌ 请先上传一张原始图片作为参考']);
      }
      await refreshDetail();
    } catch (err: any) {
      setGenLog(l => [...l, `❌ ${err.message}`]);
    }
    setGenerating(false);
  };

  // 一键生成所有空缺槽位
  const handleBatchGenerateAll = async () => {
    const images = product?.images || [];
    const missingRoles = getSlots(slotCount).filter(s => !images.find((img: any) => getImageSlot(img) === s.role));
    if (missingRoles.length === 0) {
      setGenLog(['✅ 所有槽位已有图片']);
      return;
    }
    setSelectedTypes(new Set(missingRoles.map(s => s.role)));
    await handleBatchGenerate();
  };

  // PrestaShop 同步
  const handleValidatePS = async () => {
    if (!reference) return;
    setValidatingPS(true); setPsSyncMessage('');
    try {
      const res = await prestashopApi.validateProduct(reference);
      const lines = [];
      if (res.errors?.length) lines.push(`❌ ${res.errors.length} 个错误:`, ...res.errors.map((e: string) => `  • ${e}`));
      if (res.warnings?.length) lines.push(`⚠️ ${res.warnings.length} 个警告:`, ...res.warnings.map((w: string) => `  • ${w}`));
      if (res.canSync) lines.push('✅ 可以同步到 PrestaShop');
      setPsSyncMessage(lines.join('\n'));
    } catch (err: any) { setPsSyncMessage(`❌ ${err.message}`); }
    finally { setValidatingPS(false); }
  };

  const handleSyncPS = async () => {
    if (!reference) return;
    setSyncingPS(true); setPsSyncMessage('⏳ 正在保存当前价格、条形码、库存并同步到 PrestaShop...');
    try {
      if (product) {
        const payload = buildProductPayload();
        const saveRes = await productsApi.update(reference, payload);
        if (!saveRes.success) throw new Error(saveRes.error || '保存当前产品信息失败');
        setProduct(prev => prev ? ({ ...prev, price: payload.price, quantity: payload.quantity } as any) : prev);
        setPriceInput(String(payload.price ?? 0));
        setQuantityInput(String(payload.quantity ?? 0));
      }
      const res = await prestashopApi.syncProduct(reference, {
        syncContent: true,
        syncSeo: true,
        syncCategory: true,
        syncBrand: true,
        syncPrice: true,
        syncStock: true,
      });
      if (res.success) {
        setPsSyncMessage(`✅ ${res.data?.details || '同步成功'}`);
        onUpdated();
        await refreshDetail();
      } else {
        setPsSyncMessage(`❌ ${res.data?.error || res.error || '同步失败'}`);
      }
    } catch (err: any) { setPsSyncMessage(`❌ ${err.message}`); }
    finally { setSyncingPS(false); }
  };

  const handleSyncImages = async () => {
    if (!reference) return;
    setSyncingPS(true); setPsSyncMessage('⏳ 正在同步图片到 PrestaShop...');
    try {
      const res = await prestashopApi.syncImages(reference, 'append');
      if (res.success) {
        const msg = `✅ ${res.successCount}/${res.total} 张图片同步成功（跳过 ${res.skippedCount}，失败 ${res.failedCount}）`;
        if (res.failedCount > 0 && res.results) {
          const errors = res.results.filter((r: any) => r.status === 'failed').map((r: any) => `  • ${r.role}: ${r.error || '未知错误'}`);
          setPsSyncMessage(msg + '\n❌ 失败详情:\n' + errors.join('\n'));
        } else {
          setPsSyncMessage(msg);
        }
        onUpdated();
      } else {
        setPsSyncMessage(`❌ ${res.error || '同步失败'}`);
      }
    } catch (err: any) { setPsSyncMessage(`❌ ${err.message}`); }
    finally { setSyncingPS(false); }
  };

  const handleToggleActive = async () => {
    if (!reference || !product?.prestashop_id) return;
    const newActive = product.active === '0' ? '1' : '0';
    if (!window.confirm(`确定${newActive === '1' ? '激活' : '停用'}此商品？`)) return;
    setTogglingActive(true);
    try {
      const res = await fetch(`/api/prestashop/toggle-active/${encodeURIComponent(reference)}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setProduct(prev => prev ? { ...prev, active: data.data?.newActive || newActive } as any : prev);
        setMessage(`✅ 已${newActive === '1' ? '激活' : '停用'}`);
      } else {
        setMessage(`❌ ${data.error || '操作失败'}`);
      }
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setTogglingActive(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  if (!reference) return (
    <div className="detail-panel"><div className="detail-empty"><div className="empty-icon">👈</div><div>选择一个商品查看详情</div></div></div>
  );

  if (loading) return <div className="detail-panel"><div className="loading">加载中...</div></div>;
  if (!product) return <div className="detail-panel"><div className="detail-empty"><div>商品未找到</div></div></div>;

  const currentContent = localContent?.[activeLang] || {};
  const otherLang = activeLang === 'es' ? 'zh' : 'es';
  const productImages = product.images || [];

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <h2>{product.reference}</h2>
          <a href={`/api/upload/open-folder/${encodeURIComponent(reference||'')}`} target="_blank" rel="noreferrer"
            className="btn btn-sm" style={{ marginLeft: 8, textDecoration: 'none', cursor: 'pointer' }} title="打开 Windows 文件夹"
            onClick={(e) => { e.stopPropagation(); }}>
            📂 文件夹
          </a>
          {product.prestashop_id && (
            <a href={`https://temcostar.com/index.php?id_product=${product.prestashop_id}&controller=product`} target="_blank" rel="noreferrer"
              className="btn btn-sm" style={{ marginLeft: 4, textDecoration: 'none', cursor: 'pointer' }} title="在网店中查看">
              🌐 网页
            </a>
          )}
          {product.prestashop_id && (
            <button className="btn btn-sm" style={{ marginLeft: 4, cursor: 'pointer' }}
              onClick={handleToggleActive} disabled={togglingActive}
              title={product.active === '0' ? '点击激活' : '点击停用'}>
              {togglingActive ? '⏳' : product.active === '0' ? '🔴 未激活' : '🟢 已激活'}
            </button>
          )}
          <a href={`/api/upload/export-data/${encodeURIComponent(reference||"")}`} target="_blank" rel="noreferrer"
            className="btn btn-sm" style={{ marginLeft: 4, textDecoration: "none", cursor: "pointer" }} title="导出产品数据到文件夹">
            💾 导出数据
          </a>
          <button className="btn btn-sm" style={{ marginLeft: 4, cursor: "pointer" }} title="将旧图片复制到产品文件夹"
            onClick={(e) => { e.stopPropagation();
              fetch(`/api/upload/migrate-images/${encodeURIComponent(reference||"")}`, { method: "POST" })
                .then(r => r.json()).then(d => { if (d.success) alert(d.message); }).catch(() => {});
            }}>
            📦 整理图片
          </button>
          <button className="btn btn-sm" style={{ marginLeft: 4, cursor: "pointer" }} title="验证图片文件是否存在，删除已不存在的图片记录"
            onClick={(e) => { e.stopPropagation();
              fetch(`/api/upload/verify-images/${encodeURIComponent(reference||"")}`, { method: "POST" })
                .then(r => r.json()).then(d => {
                  if (d.success) alert(`文件验证完成\n删除 ${d.data.deleted} 条失效记录\n保留 ${d.data.valid} 条有效记录`);
                  if (d.success && d.data.deleted > 0) window.location.reload();
                }).catch(() => {});
            }}>
            🔄 同步
          </button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '💾 保存'}</button>
          <button className="btn btn-danger btn-sm" onClick={async () => {
            if (!window.confirm(`确定删除 ${product.reference}？`)) return;
            try { const r = await productsApi.delete(product.reference); if (r.success) onUpdated(); } catch (e: any) { alert(e.message); }
          }}>🗑 删除</button>
        </div>
      </div>
      <div className="detail-body">
        {message && (
          <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 4, fontSize: 13,
            background: message.includes('❌') ? '#fff2f0' : '#f6ffed' }}>{message}</div>
        )}

        <div className="detail-section">
          <h4>基本信息</h4>
          <div className="detail-field"><label>Reference</label><input value={product.reference} disabled /></div>
          <div className="detail-field"><label>价格 (€)</label><input type="text" inputMode="decimal" step="0.01" min="0" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} onBlur={() => { const p = parseFloat(priceInput); if (!isNaN(p) && p >= 0) setProduct({...product, price: p} as any); else setPriceInput('0'); }} /></div>
          <div className="detail-field"><label>库存数量</label><input type="number" inputMode="numeric" min="0" step="1" value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} onBlur={() => { const q = parseInt(quantityInput, 10); if (!isNaN(q) && q >= 0) setProduct({...product, quantity: q} as any); else setQuantityInput('0'); }} /></div>
          <div className="detail-field"><label>分类</label><EditableSelect value={product.category || ''} options={allCategories} placeholder="选择或新增分类" onChange={v => setProduct(prev => prev ? { ...prev, category: v } : prev)} /></div>
          <div className="detail-field"><label>品牌</label><EditableSelect value={product.brand || ''} options={allBrands} placeholder="选择或新增品牌" onChange={v => setProduct(prev => prev ? { ...prev, brand: v } : prev)} /></div>
          <div className="detail-field"><label>状态</label>
            <select value={localStatus} onChange={e => setLocalStatus(e.target.value)}>
              {['待处理','缺图片文件夹','已上传图片','已匹配图片','已匹配视频','双语文案待生成','双语文案已生成','西语文案待审核','图片ALT待生成','SEO待检查','SEO通过','已导出','上传失败','已上传','已下架'].map(s =>
                <option key={s} value={s}>{s}</option>
              )}
            </select>
          </div>
          <div className="detail-field"><label>🎬 视频链接</label>
            <input value={product.video_url || ''} onChange={e => handleProductFieldChange('video_url', e.target.value)}
              placeholder="输入 YouTube 或视频文件 URL" />
            {product.video_url && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                <a href={product.video_url} target="_blank" rel="noreferrer">预览视频 ↗</a>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="detail-field"><label>🔢 EAN13 / 条形码</label>
              <input value={product.ean13 || ''} onChange={e => setProduct(prev => prev ? {...prev, ean13: e.target.value} : prev)} />
            </div>
            <div className="detail-field"><label>UPC</label>
              <input value={product.upc || ''} onChange={e => setProduct(prev => prev ? {...prev, upc: e.target.value} : prev)} />
            </div>
          </div>
          <div className="detail-section" style={{ marginTop: 8, padding: 8, border: '1px dashed var(--accent)', borderRadius: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>🛒 PrestaShop 同步</div>
            {product.prestashop_id && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                PS ID: {product.prestashop_id} · 状态: {product.prestashop_sync_status || '未同步'}
              </div>
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-sm" onClick={handleValidatePS} disabled={validatingPS}
                style={{ fontSize: 11, padding: '3px 8px' }}>
                {validatingPS ? '检查中...' : '🔍 同步前检查'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSyncPS} disabled={syncingPS}
                style={{ fontSize: 11, padding: '3px 8px' }}>
                {syncingPS ? '同步中...' : '📤 同步到 PrestaShop'}
              </button>
              <button className="btn btn-sm" onClick={handleSyncImages} disabled={syncingPS}
                style={{ fontSize: 11, padding: '3px 8px' }}>
                🖼 同步图片
              </button>
            </div>
            {psSyncMessage && (
              <div style={{ marginTop: 4, fontSize: 11, color: psSyncMessage.includes('❌') ? 'var(--error)' : psSyncMessage.includes('✅') ? 'var(--success)' : 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                {psSyncMessage}
              </div>
            )}
          </div>

          {/* 网站变体（组合）编辑 */}
          <div className="detail-section" style={{ marginTop: 8, padding: 8, border: '1px dashed var(--accent)', borderRadius: 6 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShowVariantEdit(s => !s)}
              style={{ marginBottom: showVariantEdit ? 8 : 0, background: showVariantEdit ? 'var(--accent)' : undefined, color: showVariantEdit ? '#fff' : undefined }}
            >
              {showVariantEdit ? '收起变体编辑' : '🧬 编辑网站变体'}
            </button>
            {showVariantEdit && (
              <VariantEditPanel prestashopProductId={product.prestashop_id ? Number(product.prestashop_id) || null : null} />
            )}
          </div>
        </div>

        <div className="detail-section" style={{ borderTop: '2px solid var(--accent)', paddingTop: 12 }}>
          <h4 style={{ color: 'var(--accent)' }}>AI 生成素材</h4>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.6 }}>
            文案、SEO、图片 ALT 和生图提示词都会优先读取这里。先填这里并保存，再生成文案或图片。
          </div>
          <div className="detail-field">
            <label>产品卖点</label>
            <textarea value={product.selling_points || ''} onChange={(e) => handleProductFieldChange('selling_points', e.target.value)} rows={4}
              placeholder="例如：Tres cables de carga rápida integrados；Cable C1 multifuncional e intercambiable；Pantalla LED..." />
          </div>
          <div className="detail-field">
            <label>产品介绍</label>
            <textarea value={product.product_intro || ''} onChange={(e) => handleProductFieldChange('product_intro', e.target.value)} rows={5}
              placeholder="补充产品用途、适用场景、包装、目标客户等。中文或西语都可以。" />
          </div>
          <button className="btn btn-sm" onClick={handleSave} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
            {saving ? '保存中...' : '保存卖点和介绍'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleGenerateCopy} disabled={generatingCopy}
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            {generatingCopy ? '⏳ AI 生成中...' : '✍️ AI 生成文案'}
          </button>
          {generatingCopy && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              正在生成西语正式文案和中文内部对照版...
            </div>
          )}
          <button className="btn btn-primary btn-sm" onClick={handleSyncPS} disabled={syncingPS}
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            {syncingPS ? '⏳ 同步中...' : '📤 同步到 PrestaShop'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className={`btn btn-sm ${activeLang === 'es' ? 'btn-primary' : ''}`} onClick={() => setActiveLang('es')}>🇪🇸 西班牙语</button>
          <button className={`btn btn-sm ${activeLang === 'zh' ? 'btn-primary' : ''}`} onClick={() => setActiveLang('zh')}>🇨🇳 中文</button>
        </div>
        <div className="detail-section">
          <h4>{activeLang === 'es' ? '西班牙语内容' : '中文内容'}</h4>
          <div className="detail-field"><label>商品名</label><input value={currentContent.name || ''} onChange={e => handleFieldChange(activeLang, 'name', e.target.value)} /></div>
          <div className="detail-field"><label>短描述</label><textarea value={currentContent.descriptionShort || ''} onChange={e => handleFieldChange(activeLang, 'descriptionShort', e.target.value)} rows={3} /></div>
          <div className="detail-field"><label>长描述 (HTML)</label><textarea value={currentContent.description || ''} onChange={e => handleFieldChange(activeLang, 'description', e.target.value)} rows={6} /></div>
          <div className="detail-field"><label>SEO 标题</label><input value={currentContent.seoTitle || ''} onChange={e => handleFieldChange(activeLang, 'seoTitle', e.target.value)} /></div>
          <div className="detail-field"><label>SEO 描述</label><textarea value={currentContent.seoDescription || ''} onChange={e => handleFieldChange(activeLang, 'seoDescription', e.target.value)} rows={3} /></div>
        </div>

                {/* ========== 5 槽位图片管理 ========== */}
        <div className="detail-section" style={{ borderTop: '2px solid var(--accent)', paddingTop: 12 }}>
          <h4 style={{ color: 'var(--accent)' }}>📸 产品图片（{slotCount} 槽位）
            {[6, 8, 10].map(n => (
              <button key={n} className={`btn btn-sm ${slotCount === n ? 'btn-primary' : ''}`}
                style={{ fontSize: 10, padding: '2px 6px', marginLeft: n === 6 ? 8 : 2 }}
                onClick={() => setSlotCount(n)}>{n}槽</button>
            ))}</h4>
          <button className="btn btn-sm" style={{ fontSize: 11, cursor: 'pointer', marginLeft: 4 }}
            onClick={(e) => { e.stopPropagation(); handleGenerateAllAlt(); }}
            disabled={generatingAlt !== null}>
            {generatingAlt === -1 ? '⏳' : '🤖'} 一键ALT
          </button>
          <button className="btn btn-sm" style={{ fontSize: 11, cursor: 'pointer', marginLeft: 4 }}
            onClick={(e) => { e.stopPropagation(); handleSyncImages(); }} disabled={syncingPS}>
            🖼 同步图片
          </button>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.6 }}>
            每个产品有 5 个固定图片槽位。每个槽位可以上传本地图片或 AI 生成。
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
          {getSlots(slotCount).map(slot => {
            const slotImg = productImages.find((img: any) => getImageSlot(img) === slot.role);
            const url = slotImg ? getImageUrl(slotImg) : '';
            return (
              <div key={slot.role} style={{
                border: `1px solid ${slotImg ? 'var(--accent)' : 'var(--border-color)'}`,
                borderRadius: 6, padding: 8, marginBottom: 8,
                background: slotImg ? '#f6ffed' : '#fafafa',
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 80, height: 80, borderRadius: 4, overflow: 'hidden',
                    border: '1px solid var(--border-color)', flex: '0 0 auto',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                    {url ? (
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <span style={{ fontSize: 28, opacity: 0.3 }}>{slot.icon}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{slot.icon} {slot.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{slot.desc}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px' }}
                        onClick={() => { setUploadTarget(slot.role); fileInputRef.current?.click(); }}
                        disabled={uploading}>
                        📤 上传
                      </button>
                      <button className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px' }}
                        onClick={() => handleAiGenerate(slot.role)}
                        disabled={generating}>
                        🤖 AI 生成
                      </button>
                      {slotImg && (
                        <button className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--error)' }}
                          onClick={() => handleDeleteImage(slotImg)}
                          disabled={savingImageId === slotImg.id}>
                          🗑 删除
                        </button>
                      )}
                      {slotImg && (
                      <button className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px' }}
                        onClick={(e) => { e.stopPropagation(); handleGenerateAlt(slotImg); }}
                        disabled={generatingAlt === slotImg.id}>
                        {generatingAlt === slotImg.id ? '⏳' : '🤖'} ALT
                      </button>
                      )}
                    </div>
                  </div>
                </div>
                {slotImg && (
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                    <span style={{ color: slotImg.alt ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                      {slotImg.alt ? '✅' : '⚠'} ALT
                    </span>
                    <input value={slotImg.alt || ''} placeholder="添加图片ALT文本..."
                      onChange={(e) => {
                        // 本地更新 ALT
                        setProduct(prev => {
                          if (!prev) return prev;
                          const updatedImages = (prev as any).images?.map((img: any) =>
                            img.id === slotImg.id ? { ...img, alt: e.target.value } : img
                          ) || [];
                          return { ...prev, images: updatedImages } as any;
                        });
                      }}
                      style={{ flex: 1, fontSize: 11, padding: '2px 6px', border: '1px solid var(--border-color)', borderRadius: 3, background: 'transparent', color: 'var(--text-primary)', minWidth: 0 }}
                    />
                    {slotImg.alt && slotImg.alt.length > 60 && (
                      <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{slotImg.alt.length}字</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>当前 AI 模型：{selectedModel}</div>
            <button className="btn btn-primary" onClick={handleBatchGenerateAll}
              disabled={generating}
              style={{ width: '100%', justifyContent: 'center', padding: '8px 0' }}>
              {generating ? '⏳ 正在 AI 生成...' : '🚀 AI 一键生成全部空缺槽位'}
            </button>
          </div>
          {genLog.length > 0 && (
            <div style={{ marginTop: 8, padding: 8, borderRadius: 4, fontSize: 12, maxHeight: 120, overflowY: 'auto',
              background: '#fafafa', border: '1px solid var(--border-color)' }}>
              {genLog.map((line, i) => (
                <div key={i} style={{ marginBottom: 2, color: line.includes('❌') ? 'var(--error)' : line.includes('✅') ? 'var(--success)' : 'var(--text-secondary)' }}>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ========== 全部图片管理 ========== */}
        <div className="detail-section" style={{ borderTop: '2px solid var(--accent)', paddingTop: 12 }}>
          <h4 style={{ color: 'var(--accent)' }}>🖼 全部图片（共 {productImages.length} 张）
            <button className="btn btn-sm" style={{ marginLeft: 8, fontSize: 11, cursor: 'pointer' }}
              onClick={() => setShowAllImages(!showAllImages)}>
              {showAllImages ? '收起' : '展开'}
            </button>
          </h4>
          {showAllImages && productImages.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {productImages.map((img: any) => {
                const url = getImageUrl(img);
                return (
                  <div key={img.id} style={{ display: 'flex', gap: 8, padding: 8, border: '1px solid var(--border-color)', borderRadius: 6, background: '#fff' }}>
                    <div style={{ width: 60, height: 60, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-color)', flex: '0 0 auto', background: '#fafafa' }}>
                      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <div style={{ fontSize: 20, textAlign: 'center', lineHeight: '60px' }}>🖼</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ padding: '1px 6px', borderRadius: 999, background: getImageSlot(img) === 'main_product' ? '#e6f4ff' : '#f5f5f5', fontSize: 11 }}>{getImageSlot(img) || img.role}</span>
                        <span style={{ color: img.alt ? 'var(--success)' : 'var(--warning)', fontSize: 11 }}>{img.alt ? '✅ALT' : '⚠无ALT'}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>#{img.image_index || img.imageIndex}</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={img.original_name || img.originalName}>{img.original_name || img.originalName || '-'}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <input value={img.alt || ''} placeholder="ALT..."
                          onChange={(e) => {
                            setProduct((prev: any) => prev ? { ...prev, images: (prev.images || []).map((i: any) => i.id === img.id ? { ...i, alt: e.target.value } : i) } : prev);
                          }}
                          style={{ flex: 1, fontSize: 11, padding: '2px 6px', border: '1px solid var(--border-color)', borderRadius: 3, background: 'transparent', color: 'var(--text-primary)' }} />
                        <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 6px', color: 'var(--error)' }}
                          onClick={(e) => { e.stopPropagation(); handleDeleteImage(img); }}
                          disabled={savingImageId === img.id}>
                          🗑 删除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {showAllImages && productImages.length === 0 && (
            <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>暂无图片</div>
          )}
        </div>

        <div className="detail-section">
          <h4>{otherLang === 'es' ? '🇪🇸 西语参考' : '🇨🇳 中文参考'}</h4>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <div><strong>名称:</strong> {localContent?.[otherLang]?.name || '-'}</div>
            <div style={{ marginTop: 4 }}><strong>短描述:</strong> {localContent?.[otherLang]?.descriptionShort || '-'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;