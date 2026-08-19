// 采集审核详情面板（文档 16）
import React, { useState } from 'react';
import { mobileCaptureApi, prestashopApi } from '../../services/api';
import { MobileCaptureImage, MobileInventoryItem, MobileProcessedImage, CAPTURE_STATUS_LABELS, SYNC_STATUS_LABELS } from '../../types/mobileCapture';
import { roleLabel, IMAGE_ROLES } from '../../services/mobileColors';
import InventoryReviewPanel from './InventoryReviewPanel';
import VariantDraftPanel from './VariantDraftPanel';
import ColorSelector from './ColorSelector';
import { ColorSwatch, DEFAULT_COLOR_HEX } from './ColorSwatch';
import ProductQuickEdit from './ProductQuickEdit';
import VariantEditPanel from './VariantEditPanel';
import { useToast } from '../ui/ToastProvider';
import { useConfirm } from '../ui/ConfirmProvider';

interface Detail {
  id: number;
  product_name: string;
  reference: string;
  serial_number: string;
  ean13: string;
  model: string;
  brand: string;
  category: string;
  prestashop_id: string;
  prestashop_product_id?: number;
  price: number;
  product_quantity: number;
  capture_status: string;
  review_status: string;
  sync_status: string;
  notes: string;
  colors?: string;
  phone_models?: string;
  created_at: string;
  submitted_at: string | null;
  operator_name: string;
  device_name: string;
  session_code: string;
  area_code: string;
  websiteImageCount: number;
  images: MobileCaptureImage[];
  processedImages: MobileProcessedImage[];
  inventory: MobileInventoryItem[];
}

interface Props {
  captureId: number;
  onBack: () => void;
  onChanged: () => void;
  onPushed: (message: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280', submitted: '#3b82f6', reviewing: '#8b5cf6', approved: '#10b981',
  rejected: '#ef4444', processing: '#f59e0b', ready: '#059669', synced: '#0d9488', cancelled: '#9ca3af',
};

export function CaptureReviewPanel({ captureId, onBack, onChanged, onPushed }: Props) {
  const { error: toastError, success } = useToast();
  const { confirm } = useConfirm();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [expandedImage, setExpandedImage] = useState<MobileCaptureImage | null>(null);
  const [largeImage, setLargeImage] = useState<MobileCaptureImage | null>(null);
  const [largeProcessed, setLargeProcessed] = useState<MobileProcessedImage | null>(null);
  // 补传原图（照片导出到电脑后补回任务）
  const [showReupload, setShowReupload] = useState(false);
  const [reuploadFiles, setReuploadFiles] = useState<File[]>([]);
  const [reuploadRole, setReuploadRole] = useState('front');
  const [reuploadColors, setReuploadColors] = useState<string[]>([]);
  const [reuploading, setReuploading] = useState(false);
  // 产品属性编辑（与产品属性编辑页面打通）
  const [showProductEdit, setShowProductEdit] = useState(false);
  // 网站变体编辑 + 同步到网站
  const [showVariantEdit, setShowVariantEdit] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // 网站颜色名 → hex / 纹理图（颜色色块显示用）
  const [colorHex, setColorHex] = useState<Record<string, string>>({});
  const [colorTexture, setColorTexture] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await mobileCaptureApi.reviewCaptureDetail(captureId);
      if (res.success) setDetail(res.data);
    } catch (e: any) {
      toastError('加载失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, [captureId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 加载网站颜色属性值（hex + 纹理图），用于各颜色徽章/选择器的色块显示
  React.useEffect(() => {
    let mounted = true;
    prestashopApi.getOptionValues('color').then(res => {
      if (!mounted || !res.success || !res.data?.length) return;
      const hex: Record<string, string> = {};
      const tex: Record<string, string> = {};
      for (const v of res.data as any[]) {
        if (v.color && !hex[v.name]) hex[v.name] = v.color;
        if (v.textureUrl && !tex[v.name]) tex[v.name] = v.textureUrl;
      }
      setColorHex(hex);
      setColorTexture(tex);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  if (loading && !detail) return <div style={{ padding: 20, color: 'var(--text-muted)' }}>加载中...</div>;
  if (!detail) return <div style={{ padding: 20, color: 'var(--text-muted)' }}>采集任务不存在</div>;

  const doAction = async (fn: () => Promise<any>, successMsg: string) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.success) { success(successMsg); load(); onChanged(); }
      else toastError(res.error || '操作失败');
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // 电脑端补传原图（照片导出到电脑后补回任务）
  const doReupload = async () => {
    if (reuploadFiles.length === 0) { toastError('请先选择照片'); return; }
    setReuploading(true);
    let ok = 0, dup = 0;
    const failMsgs: string[] = [];
    for (const f of reuploadFiles) {
      try {
        const res = await mobileCaptureApi.reuploadImage(detail.id, f, { role: reuploadRole, colors: reuploadColors });
        if (res.success) { if (res.duplicate) dup++; else ok++; }
        else failMsgs.push(`${f.name}: ${res.error || '失败'}`);
      } catch (e: any) {
        failMsgs.push(`${f.name}: ${e.message}`);
      }
    }
    success(`补传完成：成功 ${ok} 张${dup ? `，重复跳过 ${dup} 张` : ''}${failMsgs.length ? `，失败 ${failMsgs.length} 张\n${failMsgs.join('\n')}` : ''}`, { duration: 8000 });
    setReuploadFiles([]);
    setShowReupload(false);
    setReuploading(false);
    load();
    onChanged();
  };

  const imgUrl = (id: number) => mobileCaptureApi.reviewImageFileUrl(id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 头部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn btn-sm" onClick={onBack}>← 返回列表</button>
        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, background: `${STATUS_COLORS[detail.capture_status]}1a`, color: STATUS_COLORS[detail.capture_status], fontWeight: 600 }}>
          {CAPTURE_STATUS_LABELS[detail.capture_status] || detail.capture_status}
        </span>
      </div>

      {/* 16.1 产品基本信息 */}
      <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{detail.product_name || detail.reference}</div>
        <InfoRow label="Reference" value={detail.reference} />
        {detail.serial_number && <InfoRow label="序列号" value={detail.serial_number} />}
        {detail.ean13 && <InfoRow label="EAN" value={detail.ean13} />}
        {detail.model && <InfoRow label="型号" value={detail.model} />}
        {detail.category && <InfoRow label="分类" value={detail.category} />}
        {detail.brand && <InfoRow label="品牌" value={detail.brand} />}
        <InfoRow label="PrestaShop ID" value={detail.prestashop_id || '未绑定'} />
        <InfoRow label="价格" value={detail.price ? `€${detail.price}` : '—'} />
        <InfoRow label="网站库存" value={String(detail.product_quantity ?? '—')} />
        <InfoRow label="网站图片" value={`${detail.websiteImageCount} 张`} />
        <InfoRow label="采集" value={`${detail.operator_name} (${detail.device_name}) · ${detail.session_code}`} />
        <InfoRow label="时间" value={`${(detail.created_at || '').slice(0, 16).replace('T', ' ')}${detail.submitted_at ? ` · 提交 ${(detail.submitted_at || '').slice(0, 16).replace('T', ' ')}` : ''}`} />
        <InfoRow label="同步" value={SYNC_STATUS_LABELS[detail.sync_status] || detail.sync_status} />
        {detail.notes && <InfoRow label="备注" value={detail.notes} />}
      </div>

      {/* 产品属性编辑（与产品属性编辑页面打通） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setShowProductEdit(s => !s)}
          style={{ alignSelf: 'flex-start', background: showProductEdit ? 'var(--accent)' : undefined, color: showProductEdit ? '#fff' : undefined }}
        >
          {showProductEdit ? '收起产品属性编辑' : '✏️ 编辑产品属性 / 上传产品图片'}
        </button>
        {showProductEdit && (
          <ProductQuickEdit reference={detail.reference} onChanged={() => { load(); onChanged(); }} />
        )}
      </div>

      {/* 网站变体编辑 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setShowVariantEdit(s => !s)}
          style={{ alignSelf: 'flex-start', background: showVariantEdit ? 'var(--accent)' : undefined, color: showVariantEdit ? '#fff' : undefined }}
        >
          {showVariantEdit ? '收起变体编辑' : '🧬 编辑网站变体'}
        </button>
        {showVariantEdit && (
          <VariantEditPanel
            prestashopProductId={Number(detail.prestashop_product_id || detail.prestashop_id || 0) || null}
            captureId={detail.id}
            reference={detail.reference}
            ean13={detail.ean13}
          />
        )}
      </div>

      {/* 16.2 原始照片区 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>🖼 原始照片（{detail.images.length} 张）</div>
          <button type="button" className="btn btn-sm" onClick={() => setShowReupload(s => !s)}>
            {showReupload ? '取消' : '⬆️ 补传照片'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          补传：把手机里的照片导出到电脑，选好用途后上传，可补回文件缺失的照片
        </div>

        {showReupload && (
          <div style={{ border: '1px dashed var(--border-color)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-secondary)' }}>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={e => setReuploadFiles(Array.from(e.target.files || []))}
              style={{ fontSize: 12, color: 'var(--text-primary)' }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>用途：</label>
              <select value={reuploadRole} onChange={e => setReuploadRole(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                {IMAGE_ROLES.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}
              </select>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>颜色（可选）：</span>
              <div style={{ flex: 1, minWidth: 220 }}>
                <ColorSelector selected={reuploadColors} onChange={setReuploadColors} allowSpecial={false} colorHex={colorHex} colorTexture={colorTexture} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>已选 {reuploadFiles.length} 个文件</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={doReupload} disabled={reuploading}>
                {reuploading ? '上传中...' : '开始补传'}
              </button>
            </div>
          </div>
        )}

        {detail.images.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>无照片</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
          {detail.images.map(img => (
            <div key={img.id} style={{ border: `2px solid ${img.status === 'approved' ? '#10b981' : img.status === 'rejected' ? '#ef4444' : 'var(--border-color)'}`, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
              {img.fileExists === false ? (
                <div style={{ width: '100%', height: 90, background: 'repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb 8px,#d1d5db 8px,#d1d5db 16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <span style={{ fontSize: 10, color: '#6b7280' }}>文件缺失</span>
                </div>
              ) : (
                <img src={imgUrl(img.id)} alt={img.filename} onClick={() => setLargeImage(img)} style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block', cursor: 'zoom-in' }} />
              )}
              <div style={{ position: 'absolute', top: 4, left: 4, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: 'rgba(0,0,0,.6)', color: '#fff' }}>{roleLabel(img.role)}</span>
                {img.is_cover_candidate === 1 && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: '#f59e0b', color: '#fff' }}>⭐</span>}
              </div>
              {img.color_names && (
                <div style={{ position: 'absolute', bottom: 4, left: 4, right: 4, fontSize: 9, color: '#fff', background: 'rgba(0,0,0,.55)', padding: '1px 5px', borderRadius: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {img.color_names}
                </div>
              )}
              <button
                type="button"
                onClick={() => setExpandedImage(img)}
                style={{ position: 'absolute', bottom: 4, right: 4, fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(0,0,0,.65)', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                操作
              </button>
              {img.fileExists !== false && (
                <a
                  href={mobileCaptureApi.reviewImageDownloadUrl(img.id, img.filename)}
                  download={img.filename}
                  title="下载原图到本地，AI 精修后上传为处理后照片"
                  onClick={e => e.stopPropagation()}
                  style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(59,130,246,.85)', color: '#fff', textDecoration: 'none' }}
                >
                  ⬇ 下载
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 处理后照片（文档 17：下载原图 → AI 精修 → 上传） */}
      <ProcessedImagesSection
        captureId={detail.id}
        sourceImages={detail.images}
        processedImages={detail.processedImages || []}
        onChanged={() => { load(); onChanged(); }}
      />

      {/* 16.3 颜色标注（capture.colors + 图片颜色合并，可修改） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>🎨 手机标注颜色</div>
        {(() => {
          const captureColors: string[] = (() => {
            try { const v = JSON.parse(detail.colors || ''); return Array.isArray(v) ? v : []; } catch { return []; }
          })();
          const imageColors = detail.images.flatMap(i => (i.color_names || '').split(',').map(s => s.trim()).filter(Boolean));
          const colors = Array.from(new Set<string>([...captureColors, ...imageColors]));
          return colors.length > 0
            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{colors.map(c => (
              <span key={c} title={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 10px 3px 6px', borderRadius: 12, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                <ColorSwatch hex={colorHex[c] || DEFAULT_COLOR_HEX[c] || ''} textureUrl={colorTexture[c]} size={12} />{c}
              </span>
            ))}</div>
            : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>未标注颜色</div>;
        })()}
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            const captureColors: string[] = (() => {
              try { const v = JSON.parse(detail.colors || ''); return Array.isArray(v) ? v : []; } catch { return []; }
            })();
            const next = window.prompt('修改产品颜色（逗号分隔，如：Negro, Azul, Rojo）', captureColors.join(', '));
            if (next === null) return;
            const list = next.split(',').map(s => s.trim()).filter(Boolean);
            await mobileCaptureApi.reviewUpdateCapture(detail.id, { colors: list });
            success('✅ 颜色已保存');
            load();
            onChanged();
          }}
          style={{ alignSelf: 'flex-start' }}
        >
          ✏️ 修改颜色
        </button>
      </div>

      {/* 手机壳点货：勾选的手机型号（仅统计，不同步网站） */}
      {(() => {
        try {
          const v = JSON.parse(detail.phone_models || '');
          if (!Array.isArray(v) || !v.length) return null;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>📱 手机型号（点货统计）</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {v.map((m: any, i: number) => {
                  const ms = Array.isArray(m.colors) ? m.colors : [];
                  return (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 10px', borderRadius: 12, background: '#f3e8ff', color: '#7c3aed', fontWeight: 600 }}>
                      {m.model}
                      {ms.length > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          {ms.map((c: string, j: number) => (
                            <span key={j} title={c} style={{ display: 'inline-flex' }}>
                              <ColorSwatch hex={colorHex[c] || DEFAULT_COLOR_HEX[c] || ''} textureUrl={colorTexture[c]} size={12} />
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        } catch { return null; }
      })()}

      {/* 16.4 库存审核 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>📦 库存审核</div>
        <InventoryReviewPanel
          items={detail.inventory}
          websiteQuantity={detail.product_quantity}
          onApprove={async (items) => {
            await mobileCaptureApi.approveInventory(detail.id, items);
            success('库存已审核');
            load();
          }}
        />
      </div>

      {/* 变体草稿（19 基础） */}
      <VariantDraftPanel captureId={detail.id} colorHex={colorHex} colorTexture={colorTexture} />

      {/* 操作按钮 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border-color)' }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy}
          onClick={() => doAction(() => mobileCaptureApi.startReview(detail.id), '已开始审核')}>开始审核</button>
        <button type="button" className="btn btn-sm" disabled={busy}
          onClick={() => doAction(() => mobileCaptureApi.approveCapture(detail.id), '✅ 审核通过')}>审核通过</button>
        {!showRejectInput ? (
          <button type="button" className="btn btn-sm" onClick={() => setShowRejectInput(true)}>退回补采</button>
        ) : (
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="退回原因" style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 12, width: 160, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            <button type="button" className="btn btn-sm" disabled={busy}
              onClick={() => doAction(() => mobileCaptureApi.rejectCapture(detail.id, rejectReason), '已退回补采')}>确认退回</button>
            <button type="button" className="btn btn-sm" onClick={() => setShowRejectInput(false)}>取消</button>
          </span>
        )}
        <button type="button" className="btn btn-sm" disabled={busy || detail.capture_status !== 'approved'}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await mobileCaptureApi.pushToProductImages(detail.id);
              if (res.success) { onPushed(res.message || '已推送'); load(); onChanged(); }
              else toastError(res.error || '推送失败');
            } catch (e: any) { toastError(e.message); } finally { setBusy(false); }
          }}>
          📤 推送产品图片模块
        </button>
        <button type="button" className="btn btn-sm" disabled={syncing || !detail.prestashop_id}
          onClick={async () => {
            const ok = await confirm('将当前产品信息（含价格/库存/图片）同步到 PrestaShop 网站？', { title: '同步到网站' });
            if (!ok) return;
            setSyncing(true);
            try {
              const res = await prestashopApi.syncProduct(detail.reference, {
                syncContent: true, syncSeo: true, syncCategory: true, syncBrand: true,
                syncPrice: true, syncStock: true, syncImages: true, forceUpdate: true,
              });
              if (res.success) { success(res.data?.error ? `⚠️ 部分失败: ${res.data.error}` : '🚀 已同步到网站'); load(); onChanged(); }
              else toastError(res.error || '同步失败');
            } catch (e: any) { toastError('同步失败: ' + e.message); } finally { setSyncing(false); }
          }}>
          {syncing ? '同步中...' : '🚀 同步到网站'}
        </button>
        <button type="button" className="btn btn-sm" disabled={syncing || !detail.prestashop_id}
          onClick={async () => {
            const ok = await confirm('把采集审核通过的图片（处理图优先）提升为产品图片并上传到网站？', { title: '同步产品图片' });
            if (!ok) return;
            setSyncing(true);
            try {
              const res = await mobileCaptureApi.syncImagesToWebsite(detail.id);
              if (res.success) { success(res.message || '✅ 图片已同步到网站'); load(); onChanged(); }
              else toastError(res.error || '图片同步失败');
            } catch (e: any) { toastError('图片同步失败: ' + e.message); } finally { setSyncing(false); }
          }}>
          {syncing ? '同步中...' : '🖼 同步产品图片到网站'}
        </button>
        <button type="button" className="btn btn-sm" disabled={busy || detail.capture_status !== 'approved'}
          onClick={() => doAction(() => mobileCaptureApi.markReady(detail.id), '已标记可同步')}>标记可同步</button>
      </div>

      {/* 图片操作抽屉 */}
      {expandedImage && (
        <ImageActionDrawer
          image={expandedImage}
          imageUrl={imgUrl(expandedImage.id)}
          onClose={() => setExpandedImage(null)}
          onAction={async (action, data) => {
            try {
              if (action === 'approve') await mobileCaptureApi.reviewApproveImage(expandedImage.id);
              if (action === 'reject') await mobileCaptureApi.reviewRejectImage(expandedImage.id, data?.reason || '');
              if (action === 'role') await mobileCaptureApi.reviewUpdateImage(expandedImage.id, { role: data?.role });
              if (action === 'cover') await mobileCaptureApi.reviewUpdateImage(expandedImage.id, { isCoverCandidate: data?.cover });
              load();
              onChanged();
            } catch (e: any) {
              toastError('操作失败: ' + e.message);
            }
          }}
        />
      )}

      {/* 大图预览 */}
      {largeImage && (
        <div onClick={() => setLargeImage(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={imgUrl(largeImage.id)} alt={largeImage.filename} style={{ maxWidth: '94%', maxHeight: '94%', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
          <button type="button" onClick={() => setLargeImage(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 20, width: 40, height: 40, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 80 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function ImageActionDrawer({ image, imageUrl, onClose, onAction }: {
  image: MobileCaptureImage;
  imageUrl: string;
  onClose: () => void;
  onAction: (action: string, data?: any) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (action: string, data?: any) => {
    setBusy(true);
    try { await onAction(action, data); } finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 900, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-primary)', width: '100%', maxWidth: 720, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <img src={imageUrl} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1, fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>{image.filename}</div>
            <div style={{ color: 'var(--text-muted)' }}>{image.width}×{image.height} · {Math.round(image.file_size / 1024)}KB · 状态 {image.status}</div>
            {image.color_names && <div style={{ color: 'var(--text-secondary)' }}>颜色：{image.color_names}</div>}
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose}>关闭</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run('approve')}>✅ 通过</button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run('reject', { reason })}>❌ 拒绝</button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run('cover', { cover: image.is_cover_candidate === 1 ? 0 : 1 })}>
            {image.is_cover_candidate === 1 ? '取消主图候选' : '⭐ 设为主图候选'}
          </button>
        </div>
        {image.status !== 'approved' && image.status !== 'rejected' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="拒绝原因（可选）" style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>修改用途：</span>
          {IMAGE_ROLES.map(r => (
            <button
              key={r.role}
              type="button"
              className="btn btn-sm"
              style={image.role === r.role ? { background: 'var(--accent)', color: '#fff' } : undefined}
              disabled={busy}
              onClick={() => run('role', { role: r.role })}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== 处理后照片区（文档 17） ====================

function ProcessedImagesSection({ captureId, sourceImages, processedImages, onChanged }: {
  captureId: number;
  sourceImages: MobileCaptureImage[];
  processedImages: MobileProcessedImage[];
  onChanged: () => void;
}) {
  const { error: toastError, success } = useToast();
  const { confirm } = useConfirm();
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sourceImageId, setSourceImageId] = useState(0);
  const [role, setRole] = useState('front');
  const [isCover, setIsCover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [large, setLarge] = useState<MobileProcessedImage | null>(null);

  const doUpload = async () => {
    if (selectedFiles.length === 0) { toastError('请先选择要上传的图片'); return; }
    setUploading(true);
    let ok = 0, dup = 0;
    const failMsgs: string[] = [];
    for (const f of selectedFiles) {
      try {
        const res = await mobileCaptureApi.uploadProcessedImage(captureId, f, {
          sourceImageId: sourceImageId || undefined,
          role,
          isCover,
        });
        if (res.success) { if (res.duplicate) dup++; else ok++; }
        else failMsgs.push(`${f.name}: ${res.error || '失败'}`);
      } catch (e: any) {
        failMsgs.push(`${f.name}: ${e.message}`);
      }
    }
    success(`处理图上传完成：成功 ${ok} 张${dup ? `，重复跳过 ${dup} 张` : ''}${failMsgs.length ? `，失败 ${failMsgs.length} 张\n${failMsgs.join('\n')}` : ''}`, { duration: 8000 });
    setSelectedFiles([]);
    setShowUpload(false);
    setUploading(false);
    onChanged();
  };

  const setCover = async (img: MobileProcessedImage, cover: boolean) => {
    await mobileCaptureApi.updateProcessedImage(img.id, { isCover: cover });
    onChanged();
  };
  const setRoleOf = async (img: MobileProcessedImage, r: string) => {
    await mobileCaptureApi.updateProcessedImage(img.id, { role: r });
    onChanged();
  };
  const remove = async (img: MobileProcessedImage) => {
    const ok = await confirm(`删除处理图 ${img.filename}？`, { title: '删除处理图', danger: true });
    if (!ok) return;
    await mobileCaptureApi.deleteProcessedImage(img.id);
    onChanged();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>🖼 处理后照片（{processedImages.length} 张）</div>
        <button type="button" className="btn btn-sm" onClick={() => setShowUpload(s => !s)}>
          {showUpload ? '取消' : '⬆️ 上传处理后照片'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        操作流程：在原始照片上点「⬇ 下载」→ 本地 AI 精修成电商图 → 这里上传 → 推送网站时优先使用处理图
      </div>

      {showUpload && (
        <div style={{ border: '1px dashed var(--border-color)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-secondary)' }}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={e => setSelectedFiles(Array.from(e.target.files || []))}
            style={{ fontSize: 12, color: 'var(--text-primary)' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>对应原图：</label>
            <select value={sourceImageId} onChange={e => setSourceImageId(parseInt(e.target.value, 10) || 0)}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', maxWidth: 220 }}>
              <option value={0}>不关联（独立处理图）</option>
              {sourceImages.map(s => (
                <option key={s.id} value={s.id}>{s.filename}</option>
              ))}
            </select>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>用途：</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
              {IMAGE_ROLES.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}
            </select>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" checked={isCover} onChange={e => setIsCover(e.target.checked)} /> 设为主图
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>已选 {selectedFiles.length} 个文件</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={doUpload} disabled={uploading}>
              {uploading ? '上传中...' : '开始上传'}
            </button>
          </div>
        </div>
      )}

      {processedImages.length === 0 && !showUpload ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无处理后照片</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
          {processedImages.map(p => (
            <div key={p.id} style={{ border: `2px solid ${p.is_cover ? '#f59e0b' : 'var(--border-color)'}`, borderRadius: 8, overflow: 'hidden', position: 'relative', background: '#000' }}>
              <img
                src={mobileCaptureApi.processedImageFileUrl(p.id)}
                alt={p.filename}
                onClick={() => setLarge(p)}
                style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
              />
              <div style={{ position: 'absolute', top: 4, left: 4, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: 'rgba(0,0,0,.65)', color: '#fff' }}>{roleLabel(p.role)}</span>
                {p.is_cover === 1 && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: '#f59e0b', color: '#fff' }}>⭐ 主图</span>}
                {p.status === 'pushed' && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: '#10b981', color: '#fff' }}>已推送</span>}
              </div>
              {p.source_filename && (
                <div style={{ position: 'absolute', bottom: 26, left: 4, right: 4, fontSize: 9, color: '#fff', background: 'rgba(0,0,0,.55)', padding: '1px 5px', borderRadius: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  原图：{p.source_filename}
                </div>
              )}
              <button
                type="button"
                onClick={() => remove(p)}
                style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(220,38,38,.85)', color: '#fff', border: 'none', borderRadius: 6, width: 22, height: 22, fontSize: 11, cursor: 'pointer' }}
              >✕</button>
              <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(0,0,0,.75)' }}>
                <select
                  value={p.role}
                  onChange={e => setRoleOf(p, e.target.value)}
                  title="修改用途"
                  style={{ flex: 1, fontSize: 10, padding: '2px 4px', borderRadius: 4, background: '#1f2937', color: '#fff', border: '1px solid #374151' }}
                >
                  {IMAGE_ROLES.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setCover(p, p.is_cover === 1 ? false : true)}
                  title={p.is_cover === 1 ? '取消主图' : '设为主图'}
                  style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: p.is_cover === 1 ? '#f59e0b' : '#374151', color: '#fff', border: 'none', cursor: 'pointer' }}
                >⭐</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {large && (
        <div onClick={() => setLarge(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={mobileCaptureApi.processedImageFileUrl(large.id)} alt={large.filename} style={{ maxWidth: '94%', maxHeight: '94%', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
          <button type="button" onClick={() => setLarge(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 20, width: 40, height: 40, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
      )}
    </div>
  );
}

export default CaptureReviewPanel;
