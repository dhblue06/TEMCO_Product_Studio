// 产品扫码组件（文档 26：BarcodeDetector + ZXing fallback + 拍照扫码回退）
import React, { useState } from 'react';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { useI18n } from '../../i18n';
import { useToast } from '../ui/ToastProvider';

interface Props {
  onDetected: (code: string) => void;
}

export function ProductScanner({ onDetected }: Props) {
  const { t } = useI18n();
  const { warning: toastWarning } = useToast();
  const { videoRef, start, stop, active, liveSupported, error, capturePhotoScan } = useBarcodeScanner(onDetected);
  const [photoScanning, setPhotoScanning] = useState(false);

  const handlePhotoScan = async () => {
    setPhotoScanning(true);
    try {
      const code = await capturePhotoScan();
      if (!code) {
        toastWarning(t('scan.notFound'), { vibrate: true });
      }
    } finally {
      setPhotoScanning(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {liveSupported ? (
          <button type="button" onClick={active ? stop : start} className={active ? 'btn' : 'btn btn-primary'} style={{ padding: '10px 16px' }}>
            {active ? t('scan.stop') : t('scan.live')}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('scan.unsupported')}</span>
        )}
        <button type="button" onClick={handlePhotoScan} disabled={photoScanning} className="btn btn-primary" style={{ padding: '10px 16px' }}>
          {photoScanning ? t('scan.recognizing') : t('scan.photo')}
        </button>
      </div>
      {active && (
        <video
          ref={videoRef}
          style={{ width: '100%', borderRadius: 12, background: '#000', maxHeight: 300, objectFit: 'cover' }}
          muted
          playsInline
        />
      )}
      {error && <div style={{ fontSize: 12, color: '#dc2626' }}>⚠️ {error}</div>}
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {t('scan.hint')}
      </div>
    </div>
  );
}

export default ProductScanner;
