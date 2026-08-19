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
    <div className="mobile-safe-top" style={{ minHeight: '100vh', background: 'var(--bg-primary)', maxWidth: 480, margin: '0 auto', position: 'relative' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end', padding: '6px 12px 0', background: 'var(--bg-primary)' }}>
        <LangSwitch />
      </div>

      <div style={{ padding: '10px 16px 24px' }}>
        {/* 顶部品牌 */}
        <div className="mobile-topbar mobile-safe-top" style={{ margin: '0 -16px 20px', padding: '22px 20px', borderRadius: '0 0 18px 18px' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>📱 TEMCO</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.92)', marginTop: 2 }}>{t('hub.subtitle')}</div>
        </div>

        {/* 功能入口卡片 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ENTRIES.map(e => (
            <button
              key={e.path}
              type="button"
              onClick={() => { window.location.href = e.path; }}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
                padding: '16px 18px', borderRadius: 14,
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
                borderLeft: `4px solid ${e.accent}`,
                transition: 'all var(--transition-fast)',
              }}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.985)')}
              onMouseUp={e => (e.currentTarget.style.transform = '')}
              onMouseLeave={e => (e.currentTarget.style.transform = '')}
            >
              <span style={{ fontSize: 30, flexShrink: 0 }}>{e.icon}</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{t(e.titleKey)}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t(e.descKey)}</span>
              </span>
              <span style={{ fontSize: 20, color: 'var(--text-muted)', flexShrink: 0 }}>›</span>
            </button>
          ))}
        </div>

        {/* 底部说明 */}
        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {t('hub.hint')}
        </div>
      </div>
    </div>
  );
}

export default MobileHubPage;
