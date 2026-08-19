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
  onInventoryClick?: () => void;
  scanResultCount?: number;
}

const TopBar: React.FC<TopBarProps> = ({ onSyncClick, onSettingsClick, onDriveScanClick, onCopyGenerationClick, onImageProcessClick, onAiImageClick, onExportClick, onImageWorkshopClick, onScanFolderClick, onOrganizeImagesClick, onBatchRenameClick, onAddProductClick, onWebsiteImportClick, onProductListCheckClick, onCajaCheckClick, onCategoriesClick, onProductImagesClick, onMobileCaptureClick, onMobileCaptureReviewClick, onInventoryClick, scanResultCount }) => {
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
      className="btn"
      onClick={() => { setShowMore(false); onClick?.(); }}
      style={{ justifyContent: 'flex-start', width: '100%', padding: '8px 12px', fontSize: 12.5 }}
    >
      {icon}
      {label}
    </button>
  );

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
        {/* 高频操作组 */}
        <div className="topbar-group">
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
          <button className="btn" onClick={onCajaCheckClick} style={{ color: 'var(--accent)', fontWeight: 600 }}>
            📥 CAJA 新品检查
          </button>
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
        </div>

        <div className="topbar-divider" />

        {/* 移动端 / 管理组 */}
        <div className="topbar-group">
          <button className="btn" onClick={onMobileCaptureClick} style={{ color: 'var(--accent)', fontWeight: 600 }}>
            📱 手机采集
          </button>
          <button className="btn" onClick={onMobileCaptureReviewClick}>
            🧾 采集审核
          </button>
          <button className="btn" onClick={onInventoryClick} style={{ color: '#f59e0b', fontWeight: 600 }}>
            📦 仓库盘点
          </button>
          <button className="btn" onClick={onCategoriesClick}>
            分类管理
          </button>
          <button className="btn" onClick={onProductImagesClick}>
            产品图片
          </button>
          <button className="btn" onClick={onSettingsClick}>
            设置
          </button>
        </div>

        <div className="topbar-divider" />

        {/* 更多工具：低频操作收纳为下拉 */}
        <div ref={moreRef} style={{ position: 'relative' }}>
          <button
            className="btn"
            onClick={() => setShowMore(v => !v)}
            style={{ background: showMore ? 'var(--bg-hover)' : undefined }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
            更多工具
          </button>
          {showMore && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 6px)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              boxShadow: 'var(--shadow-lg)',
              padding: 6,
              minWidth: 190,
              display: 'flex', flexDirection: 'column', gap: 2,
              zIndex: 1000,
            }}>
              {moreBtn('素材匹配', onDriveScanClick)}
              {moreBtn('图片处理', onImageProcessClick)}
              {moreBtn('批量图片', onAiImageClick)}
              {moreBtn('导出 CSV', onExportClick)}
              {moreBtn(`扫描文件夹${scanResultCount ? ` (${scanResultCount})` : ''}`, onScanFolderClick)}
              {moreBtn('整理图片', onOrganizeImagesClick)}
              {moreBtn('批量改名', onBatchRenameClick)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopBar;
