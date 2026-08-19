// 颜色映射面板（文档 16.3：手机标注颜色 → 映射/新建/忽略）
import React, { useState } from 'react';
import { mobileCaptureApi } from '../../services/api';
import { useToast } from '../ui/ToastProvider';

interface PendingColor {
  id: number;
  color_name: string;
  normalized_color: string;
  mapping_status: string;
  image_id: number;
  filename: string;
  role: string;
  capture_id: number;
  reference: string;
  product_name: string;
}

interface Props {
  colors: PendingColor[];
  onChange: () => void;
}

export function ColorMappingPanel({ colors, onChange }: Props) {
  const { error: toastError } = useToast();
  const [busy, setBusy] = useState(0);

  const act = async (id: number, status: string) => {
    setBusy(b => b + 1);
    try {
      await mobileCaptureApi.mapColor(id, status);
      onChange();
    } catch (e: any) {
      toastError('操作失败: ' + e.message);
    } finally {
      setBusy(b => b - 1);
    }
  };

  if (colors.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>无待确认颜色</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {colors.slice(0, 30).map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, borderBottom: '1px solid var(--border-color)', paddingBottom: 6 }}>
          <span style={{ fontWeight: 600, minWidth: 120 }}>{c.color_name}</span>
          <span style={{ color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.reference} · {c.product_name}
          </span>
          <button type="button" className="btn btn-sm" disabled={busy > 0} onClick={() => act(c.id, 'mapped')}>映射</button>
          <button type="button" className="btn btn-sm" disabled={busy > 0} onClick={() => act(c.id, 'new')}>新建</button>
          <button type="button" className="btn btn-sm" disabled={busy > 0} onClick={() => act(c.id, 'ignored')}>忽略</button>
        </div>
      ))}
    </div>
  );
}

export default ColorMappingPanel;
