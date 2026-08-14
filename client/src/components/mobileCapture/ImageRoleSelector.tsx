// 图片角色选择器（文档 9.2）
import React from 'react';
import { IMAGE_ROLES } from '../../services/mobileColors';
import { useI18n } from '../../i18n';

interface Props {
  value: string;
  onChange: (role: string) => void;
}

export function ImageRoleSelector({ value, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {IMAGE_ROLES.map(r => (
        <button
          key={r.role}
          type="button"
          onClick={() => onChange(r.role)}
          style={{
            padding: '6px 10px', borderRadius: 14, border: '1px solid var(--border-color)',
            background: value === r.role ? 'var(--accent)' : 'var(--bg-secondary)',
            color: value === r.role ? '#fff' : 'var(--text-primary)',
            fontSize: 13, cursor: 'pointer',
          }}
        >
          {t('img.role.' + r.role)}
        </button>
      ))}
    </div>
  );
}

export default ImageRoleSelector;
