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

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!operatorName.trim()) {
      toastWarning(t('login.operator') + ' *', { vibrate: true });
      return;
    }
    // 设备名称不再手动填写，统一记为 'mobile'
    await onStart(pin.trim(), operatorName.trim(), 'mobile', areaCode.trim());
  };

  return (
    <form className="mobile-login-card" onSubmit={submit}>
      <div className="mobile-login-hero">
        <div className="mobile-login-mark" aria-hidden="true">T</div>
        <h1>TEMCO</h1>
        <p>
          {t('login.title')}
        </p>
      </div>

      {hasActiveSession && onContinueSession && (
        <button type="button" onClick={onContinueSession} className="btn btn-primary mobile-btn-lg">
          ▶ {t('common.continue')}
        </button>
      )}

      <label className="mobile-form-group">
        <span>{t('login.operator')} *</span>
        <input className="mobile-field" autoComplete="name" value={operatorName} onChange={e => setOperatorName(e.target.value)} placeholder={t('login.operatorPh')} />
      </label>

      <label className="mobile-form-group">
        <span>{t('login.area')}</span>
        <input className="mobile-field" value={areaCode} onChange={e => setAreaCode(e.target.value)} placeholder="A-03" />
      </label>

      <label className="mobile-form-group">
        <span>{t('login.pin')}</span>
        <input className="mobile-field" value={pin} onChange={e => setPin(e.target.value)} placeholder={t('login.pinPh')} type="password" inputMode="numeric" autoComplete="current-password" />
      </label>

      {error && <div className="mobile-alert mobile-alert-error" role="alert">⚠️ {error}</div>}

      <button type="submit" disabled={loading} className="btn btn-primary mobile-btn-lg">
        {loading ? t('common.loading') : t('login.btn')}
      </button>
    </form>
  );
}

export default SessionStart;
