// 已上传图片卡片（文档 9 / 16.2 原始照片区简化版）
import React, { useState } from 'react';
import { MobileCaptureImage } from '../../types/mobileCapture';
import { roleLabel } from '../../services/mobileColors';
import { mobileCaptureApi } from '../../services/api';
import { useI18n } from '../../i18n';
import { useToast } from '../ui/ToastProvider';
import { useConfirm } from '../ui/ConfirmProvider';

interface Props {
  image: MobileCaptureImage;
  imageUrl: string;
  onDeleted: (id: number) => void;
  onUpdated: (image: MobileCaptureImage) => void;
  canEdit?: boolean;
}

export function CaptureImageCard({ image, imageUrl, onDeleted, onUpdated, canEdit = true }: Props) {
  const { t } = useI18n();
  const { error: toastError } = useToast();
  const { confirm } = useConfirm();
  const [showLarge, setShowLarge] = useState(false);

  const handleDelete = async () => {
    const ok = await confirm(t('img.deleteConfirm'), { title: t('img.deleteTitle') || '删除照片', danger: true });
    if (!ok) return;
    try {
      await mobileCaptureApi.deleteImage(image.id);
      onDeleted(image.id);
    } catch (e: any) {
      toastError(t('img.deleteFail') + ': ' + e.message);
    }
  };

  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-color)', background: '#000' }}>
      <img
        src={imageUrl}
        alt={image.filename}
        onClick={() => setShowLarge(true)}
        style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block', cursor: 'pointer' }}
      />
      <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: 'rgba(0,0,0,.65)', color: '#fff' }}>
          {t('img.role.' + image.role)}
        </span>
        {image.is_cover_candidate === 1 && (
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#f59e0b', color: '#fff' }}>{t('img.cover')}</span>
        )}
      </div>
      {image.color_names && (
        <div style={{ position: 'absolute', bottom: 6, left: 6, right: 6, fontSize: 10, color: '#fff', background: 'rgba(0,0,0,.55)', padding: '2px 6px', borderRadius: 8 }}>
          {image.color_names}
        </div>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={handleDelete}
          style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(220,38,38,.85)', color: '#fff', border: 'none', borderRadius: 8, width: 24, height: 24, fontSize: 12, cursor: 'pointer' }}
        >
          ✕
        </button>
      )}

      {showLarge && (
        <div
          onClick={() => setShowLarge(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
        >
          <img src={imageUrl} alt={image.filename} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowLarge(false); }}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 20, width: 40, height: 40, fontSize: 18, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default CaptureImageCard;
