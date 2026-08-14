// 拍照组件（文档 9.1：后置摄像头 / 相册）
import React from 'react';
import { useCameraCapture } from '../../hooks/useCameraCapture';
import { useI18n } from '../../i18n';

interface Props {
  onFiles: (files: File[]) => void;
  uploading?: boolean;
  disabled?: boolean;
}

export function CameraCapture({ onFiles, uploading, disabled }: Props) {
  const { t } = useI18n();
  const { trigger } = useCameraCapture(onFiles);

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="button" className="btn btn-primary" disabled={disabled || uploading} onClick={() => trigger(true)} style={{ flex: 1, padding: '12px', fontSize: 15 }}>
        {t('capture.takePhoto')}
      </button>
      <button type="button" className="btn" disabled={disabled || uploading} onClick={() => trigger(false)} style={{ padding: '12px 16px', fontSize: 15 }}>
        {t('capture.album')}
      </button>
    </div>
  );
}

export default CameraCapture;
