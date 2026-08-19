// 采集会话开始页（文档 8.1：操作员 / 区域 / PIN）
import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import { useToast } from '../ui/ToastProvider';

interface Props {
  loading: boolean;
  error: string;
  onStart: (pin: string, operatorName: string, deviceName: string, areaCode: string) => Promise<void>;
  onContinueSession?: () => void;
  hasActiveSession: boolean;
}

export function SessionStart({ loading, error, onStart, onContinueSession, hasActiveSession }: Props) {
  const { t } = useI18n();
  const { warning: toastWarning } = useToast();
  const [pin, setPin] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [areaCode, setAreaCode] = useState('');

  const submit = async () => {
    if (!operatorName.trim()) {
      toastWarning(t('login.operator') + ' *', { vibrate: true });
      return;
    }
    // 设备名称不再手动填写，统一记为 'mobile'
    await onStart(pin.trim(), operatorName.trim(), 'mobile', areaCode.trim());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20, maxWidth: 420, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>📱 TEMCO Mobile Capture</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '6px 0 0' }}>
          {t('login.title')}
        </p>
      </div>

      {hasActiveSession && onContinueSession && (
        <button type="button" onClick={onContinueSession} className="btn btn-primary" style={{ padding: 12 }}>
          ▶ {t('common.continue')}
        </button>
      )}

      <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('login.operator')} *</label>
      <input value={operatorName} onChange={e => setOperatorName(e.target.value)} placeholder={t('login.operatorPh')} style={inputStyle} />

      <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('login.area')}</label>
      <input value={areaCode} onChange={e => setAreaCode(e.target.value)} placeholder="A-03" style={inputStyle} />

      <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('login.pin')}</label>
      <input value={pin} onChange={e => setPin(e.target.value)} placeholder={t('login.pinPh')} type="password" style={inputStyle} />

      {error && <div style={{ color: '#dc2626', fontSize: 13, background: '#fef2f2', padding: 8, borderRadius: 8 }}>⚠️ {error}</div>}

      <button type="button" onClick={submit} disabled={loading} className="btn btn-primary" style={{ padding: 14, fontSize: 16 }}>
        {loading ? t('common.loading') : t('login.btn')}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
  fontSize: 15, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
};

export default SessionStart;
