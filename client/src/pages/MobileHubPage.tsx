// 手机端角色入口选择页（v1.7）：商品采集 / 缺货上报（仓库盘点暂不展示）
import React from 'react';
import { useI18n, LangSwitch } from '../i18n';

interface Entry {
  path: string;
  icon: string;
  titleKey: string;
  descKey: string;
  accent: string;
}

const ENTRIES: Entry[] = [
  {
    path: '/mobile-capture',
    icon: '📷',
    titleKey: 'hub.capture',
    descKey: 'hub.captureDesc',
    accent: 'var(--accent)',
  },
  {
    path: '/mobile-stock',
    icon: '📉',
    titleKey: 'hub.stock',
    descKey: 'hub.stockDesc',
    accent: '#dc2626',
  },
];

export function MobileHubPage() {
  const { t } = useI18n();

  return (
    <main className="mobile-shell mobile-safe-top">
      <div className="mobile-utility-bar mobile-utility-end">
        <LangSwitch />
      </div>

      <div className="mobile-page-content mobile-hub-content">
        <div className="mobile-hero">
          <div className="mobile-hero-kicker">TEMCO · WAREHOUSE</div>
          <div className="mobile-hero-title">{t('hub.question')}</div>
          <div className="mobile-hero-subtitle">{t('hub.subtitle')}</div>
        </div>

        <div className="mobile-entry-list">
          {ENTRIES.map(e => (
            <button
              key={e.path}
              type="button"
              onClick={() => { window.location.href = e.path; }}
              className="mobile-entry-card"
              style={{ '--entry-accent': e.accent } as React.CSSProperties}
            >
              <span className="mobile-entry-icon" aria-hidden="true">{e.icon}</span>
              <span className="mobile-entry-copy">
                <strong>{t(e.titleKey)}</strong>
                <small>{t(e.descKey)}</small>
              </span>
              <span className="mobile-entry-arrow" aria-hidden="true">›</span>
            </button>
          ))}
        </div>

        <div className="mobile-page-hint">
          {t('hub.hint')}
        </div>
      </div>
    </main>
  );
}

export default MobileHubPage;
