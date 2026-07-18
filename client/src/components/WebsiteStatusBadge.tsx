import React from 'react';

interface WebsiteStatusBadgeProps {
  status: 'on' | 'off' | 'conflict' | 'unknown';
  prestashopId?: string | null;
  websiteName?: string | null;
  imageUrl?: string | null;
  matchMethod?: string | null;
}

const WebsiteStatusBadge: React.FC<WebsiteStatusBadgeProps> = ({ status, prestashopId, websiteName, imageUrl, matchMethod }) => {
  if (status === 'unknown') {
    return <span style={{ color: 'var(--text-muted)', fontSize: 13 }} title="未导入网站快照">—</span>;
  }
  if (status === 'conflict') {
    return <span style={{ color: 'var(--warning)', fontSize: 13, cursor: 'pointer' }} title={`匹配冲突\nPS ID: ${prestashopId || '-'}`}>⚠</span>;
  }
  if (status === 'on') {
    return (
      <span style={{ color: 'var(--success)', fontSize: 14, cursor: 'pointer', fontWeight: 700 }}
        title={`已在网站\nID: ${prestashopId || '-'}\n${websiteName || ''}\n匹配: ${matchMethod || ''}`}>
        ✓
      </span>
    );
  }
  return null;
};

export default WebsiteStatusBadge;
