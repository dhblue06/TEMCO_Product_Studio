// 变体草稿面板（文档 19 基础版：查看与人工调整，不执行 PrestaShop 同步）
import React, { useEffect, useState } from 'react';
import { mobileCaptureApi } from '../../services/api';
import { ColorSwatch, DEFAULT_COLOR_HEX } from './ColorSwatch';
import { useToast } from '../ui/ToastProvider';

interface Draft {
  id: number;
  capture_id: number;
  color_name: string;
  quantity: number | null;
  action_type: string;
  status: string;
  product_name: string;
  reference: string;
  error_message: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: '未审核', reviewed: '已审核', conflict: '有冲突', ready: '可同步',
  syncing: '同步中', synced: '已同步', failed: '失败', ignored: '已忽略',
};

export function VariantDraftPanel({ captureId, colorHex, colorTexture }: {
  captureId: number;
  colorHex?: Record<string, string>;
  colorTexture?: Record<string, string>;
}) {
  const { error: toastError } = useToast();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await mobileCaptureApi.getVariantDrafts({ captureId, pageSize: 100 });
      if (res.success) setDrafts(res.data.drafts || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [captureId]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    try {
      const res = await mobileCaptureApi.createVariantDrafts(captureId);
      if (res.success) {
        setCreated(res.data?.created || 0);
        load();
      } else toastError(res.error || '生成失败');
    } catch (e: any) {
      toastError('生成失败: ' + e.message);
    }
  };

  const setAction = async (id: number, actionType: string) => {
    try {
      await mobileCaptureApi.updateVariantDraft(id, { actionType });
      load();
    } catch (e: any) { toastError('更新失败: ' + e.message); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d', padding: '6px 8px', borderRadius: 6, lineHeight: 1.5 }}>
        ⚠️ 这里是<b>本地变体草稿</b>（仅保存在本地电脑，<b>不会出现在网站上</b>）。<br />
        如需在<b>网站</b>创建/编辑/删除变体，请使用上方「🧬 编辑网站变体」面板。
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn btn-sm" onClick={create} disabled={loading}>
          {created !== null ? `已生成 ${created} 条本地草稿` : '生成本地草稿'}
        </button>
        {drafts.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{drafts.length} 条草稿（正式同步为第二阶段功能）</span>}
      </div>
      {drafts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {drafts.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, borderBottom: '1px solid var(--border-color)', paddingBottom: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, minWidth: 110 }}>
                <ColorSwatch hex={colorHex?.[d.color_name] || DEFAULT_COLOR_HEX[d.color_name] || ''} textureUrl={colorTexture?.[d.color_name]} size={12} />
                {d.color_name}
              </span>
              <span>数量 {d.quantity ?? '—'}</span>
              <select
                value={d.action_type}
                onChange={e => setAction(d.id, e.target.value)}
                style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              >
                <option value="create">新增组合</option>
                <option value="update">更新组合</option>
                <option value="ignore">忽略</option>
              </select>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{STATUS_LABELS[d.status] || d.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default VariantDraftPanel;
