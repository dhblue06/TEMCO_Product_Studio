import React from 'react';

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
  scanResultCount?: number;
}

const TopBar: React.FC<TopBarProps> = ({ onSyncClick, onSettingsClick, onDriveScanClick, onCopyGenerationClick, onImageProcessClick, onAiImageClick, onExportClick, onImageWorkshopClick, onScanFolderClick, onOrganizeImagesClick, onBatchRenameClick, onAddProductClick, onWebsiteImportClick, onProductListCheckClick, scanResultCount }) => {
  return (
    <div className="topbar">
      <div className="topbar-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
        TEMCO Product Studio
      </div>
      <div className="topbar-actions">
        <div className="topbar-group">
          <button className="btn btn-primary" onClick={onAddProductClick}>
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
          <button className="btn" onClick={onDriveScanClick}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 12h20M12 2v20" />
            </svg>
            素材匹配
          </button>
          <button className="btn" onClick={onWebsiteImportClick}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            导入网站商品
          </button>
          <button className="btn" onClick={onProductListCheckClick}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
            </svg>
            导入产品清单
          </button>
        </div>

        <div className="topbar-divider" />

        <div className="topbar-group">
          <button className="btn" onClick={onCopyGenerationClick}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            批量文案
          </button>
          <button className="btn" onClick={onImageWorkshopClick}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            图片工坊
          </button>
          <button className="btn" onClick={onImageProcessClick}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            图片处理
          </button>
          <button className="btn" onClick={onAiImageClick}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3a6 6 0 0 0 6 6 6 6 0 0 0-6 6 6 6 0 0 0-6-6 6 6 0 0 0 6-6z" />
              <path d="M20 12a4 4 0 0 0-4 4 4 4 0 0 0 4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4z" />
            </svg>
            批量图片
          </button>
        </div>

        <div className="topbar-divider" />

        <div className="topbar-group">
          <button className="btn" onClick={onExportClick}>
            导出 CSV
          </button>
          <button className="btn" onClick={onScanFolderClick} style={{ color: 'var(--accent)', fontWeight: 600 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            扫描文件夹{scanResultCount ? ` (${scanResultCount})` : ''}
          </button>
          <button className="btn" onClick={onOrganizeImagesClick}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            整理图片
          </button>
          <button className="btn" onClick={onBatchRenameClick}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            批量改名
          </button>
        </div>

        <div className="topbar-divider" />

        <div className="topbar-group">
          <button className="btn" onClick={onSettingsClick}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            设置
          </button>
        </div>
      </div>
    </div>
  );
};

export default TopBar;
