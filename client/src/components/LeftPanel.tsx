import React from 'react';

interface LeftPanelProps {
  statistics: any;
  categories: string[];
  statusFilter: string;
  categoryFilter: string;
  websiteFilter: string;
  onStatusFilter: (status: string) => void;
  onCategoryFilter: (category: string) => void;
  onWebsiteFilter: (status: string) => void;
}

// 定义商品状态的显示颜色
const statusStyles: Record<string, { label: string; className: string }> = {
  '待处理': { label: '待处理', className: 'pending' },
  '缺图片文件夹': { label: '缺图片文件夹', className: 'error' },
  '已匹配图片': { label: '已匹配图片', className: 'info' },
  '已匹配视频': { label: '已匹配视频', className: 'info' },
  '双语文案待生成': { label: '双语文案待生成', className: 'pending' },
  '双语文案已生成': { label: '双语文案已生成', className: 'info' },
  '西语文案待审核': { label: '西语文案待审核', className: 'pending' },
  '图片ALT待生成': { label: '图片ALT待生成', className: 'pending' },
  'SEO待检查': { label: 'SEO待检查', className: 'pending' },
  'SEO通过': { label: 'SEO通过', className: 'done' },
  '已导出': { label: '已导出', className: 'done' },
  '上传失败': { label: '上传失败', className: 'error' },
  '已上传': { label: '已上传', className: 'done' },
  '已下架': { label: '已下架', className: 'error' },
  '已上传图片': { label: '已上传图片', className: 'info' },
};

const statusOrder = [
  '待处理', '缺图片文件夹', '已上传图片', '已匹配图片', '已匹配视频',
  '双语文案待生成', '双语文案已生成', '西语文案待审核',
  '图片ALT待生成', 'SEO待检查', 'SEO通过',
  '已导出', '上传失败', '已上传', '已下架'
];

const LeftPanel: React.FC<LeftPanelProps> = ({
  statistics,
  categories,
  statusFilter,
  categoryFilter,
  websiteFilter,
  onStatusFilter,
  onCategoryFilter,
  onWebsiteFilter,
}) => {
  const statusStats = statistics?.statusStats || [];
  const statusMap: Record<string, number> = {};
  statusStats.forEach((s: any) => { statusMap[s.status] = s.count; });

  return (
    <div className="left-panel">
      <div className="filter-group">
        <h3>商品状态</h3>
        <div
          className={`filter-item ${!statusFilter ? 'active' : ''}`}
          onClick={() => onStatusFilter('')}
        >
          <span>全部</span>
          <span className="filter-count">{statistics?.total || 0}</span>
        </div>
        {statusOrder.map((status) => {
          const count = statusMap[status] || 0;
          if (count === 0) return null;
          const style = statusStyles[status];
          return (
            <div
              key={status}
              className={`filter-item ${statusFilter === status ? 'active' : ''}`}
              onClick={() => onStatusFilter(status)}
            >
              <span>
                <span className={`status-badge ${style?.className || 'default'}`} style={{ marginRight: 6 }}>
                  {style?.label || status}
                </span>
              </span>
              <span className="filter-count">{count}</span>
            </div>
          );
        })}
      </div>

      <div className="filter-group">
        <h3>分类</h3>
        <div
          className={`filter-item ${!categoryFilter ? 'active' : ''}`}
          onClick={() => onCategoryFilter('')}
        >
          <span>全部分类</span>
        </div>
        {categories.map((cat) => (
          <div
            key={cat}
            className={`filter-item ${categoryFilter === cat ? 'active' : ''}`}
            onClick={() => onCategoryFilter(cat)}
          >
            <span>{cat}</span>
          </div>
        ))}
      </div>

      <div className="filter-group">
        <h3>网站状态</h3>
        {['','on','off','conflict'].map((ws) => {
          const label = ws === '' ? '全部' : ws === 'on' ? '✓ 已在网站' : ws === 'off' ? '未在网站' : '⚠ 冲突';
          return (
            <div
              key={ws}
              className={`filter-item ${websiteFilter === ws ? 'active' : ''}`}
              onClick={() => onWebsiteFilter(ws)}
            >
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LeftPanel;
