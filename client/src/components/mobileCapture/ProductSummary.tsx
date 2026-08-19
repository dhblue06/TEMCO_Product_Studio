// 产品信息展示（文档 8.4 产品信息 + 状态标签 + 已卖完标记）
import React, { useState } from 'react';
import { ProductMatchCandidate, CaptureStatusInfo } from '../../types/mobileCapture';
import { mobileCaptureApi } from '../../services/api';
import { useI18n } from '../../i18n';
import { useToast } from '../ui/ToastProvider';

interface Props {
  candidate: ProductMatchCandidate | null;
  captureStatus: CaptureStatusInfo | null;
  loading: boolean;
  onRefreshStatus: () => void;
}

function statusTagKeys(info: CaptureStatusInfo): { key: string; color: string; param?: string }[] {
  const tags: { key: string; color: string; param?: string }[] = [];
  const p = info.product;
  if (!p.hasImages) tags.push({ key: 'ps.noImages', color: '#f59e0b' });
  else tags.push({ key: 'ps.hasImages', color: '#10b981' });
  if (!p.prestashopProductId) tags.push({ key: 'ps.notBound', color: '#ef4444' });
  if (info.activeCapture) tags.push({ key: 'ps.activeCapture', color: '#3b82f6' });
  if (p.lastCapture) tags.push({ key: 'ps.lastCapture', color: '#8b5cf6', param: (p.lastCapture.createdAt || '').slice(0, 10) });
  if (tags.length === 0) tags.push({ key: 'ps.ready', color: '#10b981' });
  return tags;
}

export function ProductSummary({ candidate, captureStatus, loading, onRefreshStatus }: Props) {
  const { t } = useI18n();
  const { error: toastError, success } = useToast();
  if (!candidate) return null;

  // 已卖完标记（巡视发现断货时快速记录）
  const [soldOut, setSoldOut] = useState(!!candidate.soldOut);
  const [marking, setMarking] = useState(false);
  const toggleSoldOut = async () => {
    setMarking(true);
    try {
      const res = await mobileCaptureApi.setSoldOut(candidate.productId, !soldOut);
      if (res.success) { setSoldOut(!soldOut); success(res.message || (soldOut ? t('product.available') : t('product.soldOutMark')), { vibrate: true }); }
      else toastError(res.error || t('common.opFail'));
    } catch (e: any) {
      toastError(t('product.soldOut') + ': ' + e.message);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-card, #fff)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{candidate.name || candidate.reference}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            {candidate.reference}
            {candidate.model ? ` · ${candidate.model}` : ''}
            {candidate.brand ? ` · ${candidate.brand}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {candidate.price != null && candidate.price > 0 && (
            <div style={{ fontWeight: 700, fontSize: 15, color: '#10b981' }}>€{Number(candidate.price).toFixed(2)}</div>
          )}
          <button type="button" onClick={onRefreshStatus} className="btn btn-sm" title={t('ps.refresh')}>🔄</button>
        </div>
      </div>

      {candidate.ean13 && <InfoRow label="EAN" value={candidate.ean13} />}
      {candidate.serialNumber && <InfoRow label={t('new.serial')} value={candidate.serialNumber} />}
      {candidate.category && <InfoRow label={t('ps.category')} value={candidate.category} />}

      {/* 已卖完标记（巡视记录） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {soldOut && (
          <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', background: '#ef44441a', padding: '4px 10px', borderRadius: 8 }}>
            {t('product.soldOut')}
          </span>
        )}
        <button
          type="button"
          className="btn btn-sm"
          onClick={toggleSoldOut}
          disabled={marking}
          style={soldOut ? { borderColor: '#dc2626', color: '#dc2626' } : undefined}
        >
          {marking ? '...' : soldOut ? t('product.unmarkSoldOut') : t('product.markSoldOut')}
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
      ) : candidate.website ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, border: '1px solid #93c5fd', background: '#eff6ff' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb' }}>{t('product.websiteData')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            {t('product.images')} {candidate.website.imageCount} · {t('product.stock')} {candidate.website.quantity}
          </div>
          {candidate.website.variants.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {candidate.website.variants.map(v => (
                <span key={v.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                  {v.colors.join('/') || `#${v.id}`} × {v.quantity}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('product.noVariants')}</div>
          )}
        </div>
      ) : captureStatus && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {statusTagKeys(captureStatus).map((tag, i) => (
            <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, background: `${tag.color}1a`, color: tag.color, fontWeight: 600 }}>
              {tag.param ? t(tag.key).replace('{d}', tag.param) : t(tag.key)}
            </span>
          ))}
          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
            {t('product.websiteImages')} {captureStatus.product.imageCount} · {t('product.stock')} {captureStatus.product.quantity}
          </span>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 13, display: 'flex', gap: 8 }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 48 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

export default ProductSummary;
