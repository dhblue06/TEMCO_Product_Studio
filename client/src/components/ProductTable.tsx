import React from 'react';
import { ProductListItem } from '../types';

interface ProductTableProps {
  products: ProductListItem[];
  loading: boolean;
  selectedRef: string | null;
  selectedRefs: Set<string>;
  onSelect: (ref: string) => void;
  onToggleSelect: (ref: string) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
}

const statusStyles: Record<string, string> = {
  '待处理': 'pending',
  '缺图片文件夹': 'error',
  '已匹配图片': 'info',
  '已匹配视频': 'info',
  '双语文案待生成': 'pending',
  '双语文案已生成': 'info',
  '西语文案待审核': 'pending',
  '图片ALT待生成': 'pending',
  'SEO待检查': 'pending',
  'SEO通过': 'done',
  '已导出': 'done',
  '上传失败': 'error',
  '已上传': 'done',
  '已下架': 'error',
  '已上传图片': 'info',
};

const ProductTable: React.FC<ProductTableProps> = ({ products, loading, selectedRef, selectedRefs, onSelect, onToggleSelect, onSelectAll, onDeselectAll }) => {
  const allSelected = products.length > 0 && products.every(p => selectedRefs.has(p.reference));
  const someSelected = products.some(p => selectedRefs.has(p.reference));
  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  if (products.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">📦</div>
        <div>暂无商品数据</div>
        <div style={{ fontSize: 13, marginTop: 8 }}>点击顶部"同步 Sheet"导入商品</div>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="product-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={() => {
                  if (allSelected) onDeselectAll?.();
                  else onSelectAll?.();
                }}
                style={{ cursor: 'pointer' }}
              />
            </th>
            <th style={{ width: 80 }}>Reference</th>
            <th style={{ width: '25%' }}>商品名 (西语)</th>
            <th style={{ width: 100 }}>分类</th>
            <th style={{ width: 70 }}>品牌</th>
            <th style={{ width: 60 }}>价格</th>
            <th style={{ width: 90 }}>状态</th>
            <th style={{ width: 44 }}>网站</th>
            <th style={{ width: 70 }}>图片</th>
            <th style={{ width: 44 }}>文件夹</th>
            <th style={{ width: 40 }}>视频</th>
            <th style={{ width: 90 }}>更新时间</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr
              key={p.reference}
              className={selectedRef === p.reference ? 'selected' : ''}
              onClick={() => onSelect(p.reference)}
            >
              <td style={{ width: 36 }} onClick={(e) => { e.stopPropagation(); onToggleSelect(p.reference); }}>
                <input type="checkbox" checked={selectedRefs.has(p.reference)} onChange={() => {}} style={{ cursor: 'pointer' }} />
              </td>
              <td style={{ fontWeight: 500 }}>{p.reference}</td>
              <td>{(p as any).es_name || p.esName || p.name || '-'}</td>
              <td>{p.category || '-'}</td>
              <td>{p.brand || '-'}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>
                {(p as any).price > 0 ? `€${parseFloat((p as any).price).toFixed(2)}` : '-'}
              </td>
              <td>
                <span className={`status-badge ${statusStyles[(p as any).dynamicStatus || p.status] || 'default'}`}>
                  {(p as any).dynamicStatus || p.status}
                </span>
              </td>
              <td style={{ textAlign: 'center' }}>
                {(p as any).website_status === 'on' ? <span style={{color:'var(--success)',fontWeight:700,fontSize:14}} title={'已在网站\nPS ID: ' + ((p as any).website_prestashop_id||'')}>✓</span> :
                 (p as any).website_status === 'conflict' ? <span style={{color:'var(--warning)',fontSize:14}} title="匹配冲突">⚠</span> :
                 (p as any).website_status === 'off' ? <span style={{color:'var(--text-muted)',fontSize:12}}>—</span> :
                 <span style={{color:'var(--text-muted)',fontSize:12}}>—</span>}
              </td>
              <td>
                <span style={{ color: (p as any).main_image_count > 0 || p.mainImageCount > 0 ? 'var(--success)' : 'var(--warning)' }}>
                  {(p as any).main_image_count > 0 || p.mainImageCount > 0 ? `🖼 ${(p as any).image_count || p.imageCount}` : '⚠ 无主图'}
                </span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <a href={`/api/upload/open-folder/${encodeURIComponent(p.reference)}`} target="_blank" rel="noreferrer"
                  className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px', textDecoration: 'none', cursor: 'pointer' }}
                  title="在 Windows 资源管理器中打开"
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); }}>
                  📂
                </a>
              </td>
              <td>{p.videoCount > 0 ? '✅' : '-'}</td>
              <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {(p as any).updatedAt || (p as any).updated_at ? new Date((p as any).updatedAt || (p as any).updated_at).toLocaleDateString('zh-CN') : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProductTable;
