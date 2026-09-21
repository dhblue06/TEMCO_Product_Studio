import React, { useState, useEffect, useRef } from 'react';

interface TopBarProps {
  onSyncClick: () => void;
  onSettingsClick: () => void;
  onDriveScanClick: () => void;
  onCopyGenerationClick: () => void;
  onImageProcessClick: () => void;
  onAiImageClick: () => void;
  onExportClick: () => void;
  onImageWorkshopClick: () => void;
  onScanFolderClick?: () => void;
  onOrganizeImagesClick?: () => void;
  onBatchRenameClick?: () => void;
  onAddProductClick?: () => void;
  onWebsiteImportClick?: () => void;
  onProductListCheckClick?: () => void;
  onCajaCheckClick?: () => void;
  onCategoriesClick?: () => void;
  onProductImagesClick?: () => void;
  onMobileCaptureClick?: () => void;
  onMobileCaptureReviewClick?: () => void;
  onAi3DClick?: () => void;
  onInventoryClick?: () => void;
  onStockReportClick?: () => void;
  stockReportCount?: number;
  scanResultCount?: number;
}

const TopBar: React.FC<TopBarProps> = ({ onSyncClick, onSettingsClick, onDriveScanClick, onCopyGenerationClick, onImageProcessClick, onAiImageClick, onExportClick, onImageWorkshopClick, onScanFolderClick, onOrganizeImagesClick, onBatchRenameClick, onAddProductClick, onWebsiteImportClick, onProductListCheckClick, onCajaCheckClick, onCategoriesClick, onProductImagesClick, onMobileCaptureClick, onMobileCaptureReviewClick, onAi3DClick, onInventoryClick, onStockReportClick, stockReportCount = 0, scanResultCount }) => {
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const moreBtn = (label: string, onClick?: () => void, icon?: React.ReactNode) => (
    <button
      key={label}
      className="topbar-menu-item"
      onClick={() => { setShowMore(false); onClick?.(); }}
      type="button"
    >
      <span className="topbar-menu-icon" aria-hidden="true">{icon || '·'}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-brand-mark" aria-hidden="true">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
        </span>
        <span className="topbar-brand-copy">
          <strong>TEMCO Product Studio</strong>
          <small>商品与库存工作台</small>
        </span>
      </div>
      <div className="topbar-actions">
        <div className="topbar-group topbar-primary-actions">
          <button className="btn btn-cta" onClick={onAddProductClick}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新增产品
          </button>
          <button className="btn btn-primary" onClick={onSyncClick}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            同步 Sheet
          </button>
          <button className="btn topbar-caja-action" onClick={onCajaCheckClick}>📥 CAJA 新品</button>
        </div>

        <div className="topbar-divider" />

        <nav className="topbar-group topbar-workspace-actions" aria-label="仓库工作区">
          <button className="btn" onClick={onMobileCaptureClick}>
            📱 手机采集
          </button>
          <button className="btn" onClick={onMobileCaptureReviewClick}>
            🧾 采集审核
          </button>
          <button className="btn" onClick={onInventoryClick}>
            📦 仓库盘点
          </button>
          <button
            className={`btn ${stockReportCount > 0 ? 'topbar-alert-action' : ''}`}
            onClick={onStockReportClick}
            title="缺货上报管理"
          >
            📉 缺货
            {stockReportCount > 0 && (
              <span className="topbar-alert-count">
                {stockReportCount > 99 ? '99+' : stockReportCount}
              </span>
            )}
          </button>
          <button className="btn" onClick={onAi3DClick} title="AI 3D Studio">
            ✦ AI 3D Studio
          </button>
        </nav>

        <div className="topbar-divider" />

        {/* 更多工具：低频操作收纳为下拉 */}
        <div ref={moreRef} className="topbar-more">
          <button
            className="btn"
            onClick={() => setShowMore(v => !v)}
            aria-expanded={showMore}
            aria-haspopup="menu"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
            更多工具
          </button>
          {showMore && (
            <div className="topbar-menu" role="menu">
              <div className="topbar-menu-label">导入与内容</div>
              {moreBtn('导入网站商品', onWebsiteImportClick, '↥')}
              {moreBtn('导入产品清单', onProductListCheckClick, '▤')}
              {moreBtn('批量文案', onCopyGenerationClick, '文')}
              {moreBtn('图片工坊', onImageWorkshopClick, '图')}
              <div className="topbar-menu-label">管理与工具</div>
              {moreBtn('分类管理', onCategoriesClick, '类')}
              {moreBtn('产品图片', onProductImagesClick, '像')}
              {moreBtn('素材匹配', onDriveScanClick)}
              {moreBtn('图片处理', onImageProcessClick)}
              {moreBtn('批量图片', onAiImageClick)}
              {moreBtn('导出 CSV', onExportClick)}
              {moreBtn(`扫描文件夹${scanResultCount ? ` (${scanResultCount})` : ''}`, onScanFolderClick)}
              {moreBtn('整理图片', onOrganizeImagesClick)}
              {moreBtn('批量改名', onBatchRenameClick)}
              {moreBtn('系统设置', onSettingsClick, '⚙')}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
