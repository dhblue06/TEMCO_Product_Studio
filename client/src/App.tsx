import React, { useState, useEffect, useCallback } from 'react';
import TopBar from './components/TopBar';
import LeftPanel from './components/LeftPanel';
import ProductTable from './components/ProductTable';
import ProductDetail from './components/ProductDetail';
import SheetSyncModal from './components/SheetSyncModal';
import SettingsModal from './components/SettingsModal';
import DriveScanModal from './components/DriveScanModal';
import CopyGenerationModal from './components/CopyGenerationModal';
import ImageProcessModal from './components/ImageProcessModal';
import AiImageModal from './components/AiImageModal';
import ExportModal from './components/ExportModal';
import ImageWorkshopModal from './components/ImageWorkshopModal';
import WebsiteImportModal from './components/WebsiteImportModal';
import ProductListImportModal from './components/ProductListImportModal';
import CajaNewProductCheckModal from './components/CajaNewProductCheckModal';
import ImageFinderModal from './components/ImageFinderModal';
import CategoriesPage from './pages/CategoriesPage';
import ProductImagesPage from './pages/ProductImagesPage';
import MobileCaptureAccessModal from './components/mobileCapture/MobileCaptureAccessModal';
import MobileCaptureReviewPage from './pages/MobileCaptureReviewPage';
import { productsApi } from './services/api';
import { ProductListItem, Pagination } from './types';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';

function App() {
  const { success, error: toastError, info: toastInfo } = useToast();
  const { confirm } = useConfirm();
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [websiteFilter, setWebsiteFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [statistics, setStatistics] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showAiImageModal, setShowAiImageModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showNewProductPrompt, setShowNewProductPrompt] = useState(false);
  const [showWorkshopModal, setShowWorkshopModal] = useState(false);
  const [showWebsiteImportModal, setShowWebsiteImportModal] = useState(false);
  const [showProductListModal, setShowProductListModal] = useState(false);
  const [showCajaCheck, setShowCajaCheck] = useState(false);
  const [showImageFinder, setShowImageFinder] = useState(false);
  const [refreshDetail, setRefreshDetail] = useState(0);
  const [showCategoriesPage, setShowCategoriesPage] = useState(false);
  const [showProductImagesPage, setShowProductImagesPage] = useState(false);
  const [showMobileCaptureModal, setShowMobileCaptureModal] = useState(false);
  const [showMobileCaptureReview, setShowMobileCaptureReview] = useState(false);

  // 打开/关闭审核页时同步 URL，浏览器刷新时停留在审核页而不是退回主页面
  const openReview = () => {
    setShowMobileCaptureReview(true);
    if (window.location.pathname !== '/mobile-capture-review') {
      window.history.pushState({ mcReview: true }, '', '/mobile-capture-review');
    }
  };
  const closeReview = () => {
    setShowMobileCaptureReview(false);
    if (window.location.pathname === '/mobile-capture-review') {
      window.history.replaceState({}, '', '/');
    }
  };
  // 浏览器后退（popstate）时关闭审核页
  useEffect(() => {
    const onPop = () => { if (showMobileCaptureReview) setShowMobileCaptureReview(false); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [showMobileCaptureReview]);
  const [detailFlex, setDetailFlex] = useState(0.6);
  const [scanMatchedRefs, setScanMatchedRefs] = useState<string[] | null>(null);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; message: string } | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productsApi.getList({
        search: search || undefined,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        brand: brandFilter || undefined,
        dateFilter: dateFilter || undefined,
        websiteStatus: websiteFilter || undefined,
        refs: scanMatchedRefs?.length ? scanMatchedRefs.join(',') : undefined,
        page,
        pageSize: 50,
      });
      if (res.success) {
        setProducts(res.data.products);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, categoryFilter, brandFilter, dateFilter, websiteFilter, scanMatchedRefs, page]);

  const fetchMeta = useCallback(async () => {
    try {
      const [catRes, statRes] = await Promise.all([
        productsApi.getCategories(),
        productsApi.getStatistics(),
      ]);
      if (catRes.success) setCategories(catRes.data);
      if (statRes.success) setStatistics(statRes.data);
    } catch (err) {
      console.error('Failed to fetch metadata:', err);
    }
  }, []);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status === statusFilter ? '' : status);
    setPage(1);
  };

  const handleCategoryFilter = (category: string) => {
    setCategoryFilter(category === categoryFilter ? '' : category);
    setPage(1);
  };

  const handleProductUpdated = () => {
    fetchProducts();
    setRefreshDetail(n => n + 1);
    setSelectedRefs(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedRefs.size === 0) return;
    const refs = Array.from(selectedRefs);
    const ok = await confirm(`确定删除选中的 ${refs.length} 个商品？此操作不可撤销。`, { title: '批量删除', danger: true });
    if (!ok) return;
    try {
      const res = await productsApi.batchDelete(refs);
      if (res.success) {
        success(`已删除 ${refs.length} 个商品`);
        fetchProducts();
        setSelectedRefs(new Set());
        setSelectedRef(null);
      }
    } catch (err: any) {
      toastError('批量删除失败: ' + err.message);
    }
  };

  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startFlex = detailFlex;
    const mainArea = (e.currentTarget as HTMLElement).parentElement;
    if (!mainArea) return;
    const totalWidth = mainArea.offsetWidth;
    const onMove = (ev: MouseEvent) => {
      const deltaX = startX - ev.clientX;
      const ratio = deltaX / totalWidth;
      setDetailFlex(Math.max(0.2, Math.min(0.8, startFlex + ratio)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handleScanFolder = async () => {
    try {
      setScanProgress({ current: 0, total: 0, message: '正在扫描文件夹...' });
      const res = await fetch('/api/upload/scan-folder', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const refs = data.data.matchedRefs || [];
        setScanMatchedRefs(refs);
        if (refs.length > 0) {
          setStatusFilter('');
          fetchProducts();
        }
        // 同步图片到 PrestaShop（逐个进行，实时更新进度）
        if (refs.length > 0) {
          let synced = 0, failed = 0;
          for (let i = 0; i < refs.length; i++) {
            setScanProgress({ current: i + 1, total: refs.length, message: `正在同步 ${refs[i]} 的图片到网店...` });
            try {
              const syncRes = await fetch(`/api/prestashop/sync-images/${encodeURIComponent(refs[i])}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageMode: 'append' }),
              });
              const syncData = await syncRes.json();
              if (syncData.success && syncData.successCount > 0) synced++;
              else failed++;
            } catch {
              failed++;
            }
          }
          setScanProgress(null);
          setScanMatchedRefs(refs);
          fetchProducts();
          toastInfo(`${data.message}\n\n匹配 ${data.data.matched} 个产品\n未找到产品 ${data.data.notFound} 个\n跳过 ${data.data.skipped} 个\n\n📤 图片同步结果：成功 ${synced} 个，失败 ${failed} 个`, { duration: 8000 });
        } else {
          setScanProgress(null);
          toastInfo(`${data.message}\n\n匹配 ${data.data.matched} 个产品\n未找到产品 ${data.data.notFound} 个\n跳过 ${data.data.skipped} 个`, { duration: 8000 });
        }
      } else {
        setScanProgress(null);
        toastError('扫描失败: ' + (data.error || '未知错误'));
      }
    } catch (err: any) {
      setScanProgress(null);
      toastError('扫描失败: ' + err.message);
    }
  };

  const handleBatchRename = async () => {
    try {
      const res = await fetch('/api/upload/batch-rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.success) {
        success(data.message + (data.data?.results?.length > 0 ? `\n\n${data.data.results.slice(0, 10).map((r: any) => `${r.status === 'renamed' ? '✅' : '⏭'} ${r.old} → ${r.new}`).join('\n')}` : ''));
      } else {
        toastError('重命名失败: ' + (data.error || '未知错误'));
      }
    } catch (err: any) {
      toastError('重命名失败: ' + err.message);
    }
  };

  const handleOrganizeImages = async () => {
    const folderPath = prompt('输入要扫描的文件夹路径（留空则扫描所有产品文件夹）:', 'C:\\Users\\xjm06\\Desktop\\11111');
    if (folderPath === null) return; // 用户取消
    try {
      const res = await fetch('/api/upload/organize-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folderPath.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        const details = data.data?.details || [];
        const detailText = details.length > 0
          ? '\n' + details.slice(0, 10).map((d: any) => `📂 ${d.reference}: ${d.copied}张`).join('\n')
          : data.data?.totalCopied > 0 ? `\n共 ${data.data.totalCopied} 张未匹配图片已整理` : '';
        success(data.message + detailText, { duration: 8000 });
      } else {
        toastError('整理失败: ' + (data.error || '未知错误'));
      }
    } catch (err: any) {
      toastError('整理失败: ' + err.message);
    }
  };

  const handleClearScan = () => {
    setScanMatchedRefs(null);
    fetchProducts();
  };

  return (
    <div className="app-layout">
      <TopBar
        onSyncClick={() => setShowSheetModal(true)}
        onSettingsClick={() => setShowSettingsModal(true)}
        onDriveScanClick={() => setShowDriveModal(true)}
        onCopyGenerationClick={() => setShowCopyModal(true)}
        onImageProcessClick={() => setShowImageModal(true)}
        onAiImageClick={() => setShowAiImageModal(true)}
        onExportClick={() => setShowExportModal(true)}
        onImageWorkshopClick={() => setShowWorkshopModal(true)}
        onWebsiteImportClick={() => setShowWebsiteImportModal(true)}
        onProductListCheckClick={() => setShowProductListModal(true)}
        onCajaCheckClick={() => setShowCajaCheck(true)}
        onCategoriesClick={() => setShowCategoriesPage(true)}
        onProductImagesClick={() => setShowProductImagesPage(true)}
        onMobileCaptureClick={() => setShowMobileCaptureModal(true)}
        onMobileCaptureReviewClick={openReview}
        onInventoryClick={() => { window.location.href = '/inventory'; }}
        onScanFolderClick={handleScanFolder}
        onOrganizeImagesClick={handleOrganizeImages}
        onBatchRenameClick={handleBatchRename}
        onAddProductClick={async () => {
          const ref = prompt('请输入新商品的 Reference:');
          if (ref && ref.trim()) {
            try {
              const d = await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: ref.trim() }),
              }).then(r => r.json());
              if (d.success) { fetchProducts(); setRefreshDetail(n => n + 1); success(`✅ 商品 ${ref} 创建成功`); }
              else { toastError('❌ ' + (d.error || '创建失败')); }
            } catch (e: any) { toastError('❌ ' + e.message); }
          }
        }}
        scanResultCount={scanMatchedRefs?.length}
      />
      <div className="main-area">
        <LeftPanel
          statistics={statistics}
          categories={categories}
          statusFilter={statusFilter}
          categoryFilter={categoryFilter}
          websiteFilter={websiteFilter}
          onStatusFilter={handleStatusFilter}
          onCategoryFilter={handleCategoryFilter}
          onWebsiteFilter={(ws) => { setWebsiteFilter(ws === websiteFilter ? '' : ws); setPage(1); }}
        />
        <div className="content-area">
          <div className="table-header">
            <input
              className="search-input"
              type="text"
              placeholder="搜索 reference / SKU / 名称 / 分类 / 型号..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              <option value="">全部分类</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              <option value="">全部品牌</option>
              <option value="TEMCO">TEMCO</option>
              <option value="HOPECOM">HOPECOM</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              <option value="">全部状态</option>
              <option value="待处理">待处理</option>
              <option value="已匹配图片">已匹配图片</option>
              <option value="双语文案已生成">双语文案已生成</option>
              <option value="SEO通过">SEO通过</option>
              <option value="已上传">已上传</option>
              <option value="已上传图片">已上传图片</option>
              <option value="已下架">已下架</option>
            </select>
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {pagination.total} 个商品
            </span>
            <button className="btn btn-sm" style={{ fontSize: 11 }}
              onClick={async () => {
                const ok = await confirm('同步所有已上传 PrestaShop 商品的价格？', { title: '同步价格', danger: false });
                if (!ok) return;
                const res = await fetch('/api/prestashop/sync-all-prices', { method: 'POST' });
                const d = await res.json();
                if (d.success) success(d.message || `成功同步 ${d.data?.updated || 0} 个商品`);
                else toastError(d.message || '同步失败');
              }}>
              💶 同步价格
            </button>
            {selectedRefs.size > 0 && (
              <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}>
                🗑 删除选中 ({selectedRefs.size})
              </button>
            )}
          </div>
          {scanProgress && (
            <div style={{ padding: '8px 16px', background: '#f0f9ff', borderBottom: '1px solid var(--accent)', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>⏳ {scanProgress.message}</span>
                <span style={{ color: 'var(--text-muted)' }}>{scanProgress.current}/{scanProgress.total}</span>
              </div>
              {scanProgress.total > 0 && (
                <div style={{ width: '100%', height: 6, background: 'var(--bg-hover)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s ease' }} />
                </div>
              )}
            </div>
          )}
          {scanMatchedRefs && scanProgress && (
            <div style={{ padding: '8px 16px', background: 'var(--accent-light)', borderBottom: '1px solid var(--accent)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>📋 扫描结果</span>
              <span style={{ color: 'var(--text-secondary)' }}>匹配了 {scanMatchedRefs.length} 个产品，图片已自动同步到网店</span>
              <button className="btn btn-sm" onClick={handleClearScan} style={{ marginLeft: 'auto' }}>清除筛选</button>
            </div>
          )}
          {scanMatchedRefs && !scanProgress && (
            <div style={{ padding: '8px 16px', background: '#fef3c7', borderBottom: '1px solid #f59e0b', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: '#92400e' }}>📋 产品清单检查结果</span>
              <span style={{ color: '#78350f' }}>当前筛选了 {scanMatchedRefs.length} 个未上架产品</span>
              <button className="btn btn-sm" onClick={() => setShowImageFinder(true)}>🔍 按型号查找图片</button>
              <button className="btn btn-sm" onClick={handleClearScan} style={{ marginLeft: 'auto' }}>清除筛选</button>
            </div>
          )}
          <ProductTable
            products={products}
            loading={loading}
            selectedRef={selectedRef}
            selectedRefs={selectedRefs}
            onSelect={setSelectedRef}
            onToggleSelect={(ref) => {
              setSelectedRefs(prev => {
                const next = new Set(prev);
                if (next.has(ref)) next.delete(ref);
                else next.add(ref);
                return next;
              });
            }}
            onSelectAll={() => {
              setSelectedRefs(new Set(products.map(p => p.reference)));
            }}
            onDeselectAll={() => {
              setSelectedRefs(new Set());
            }}
          />
          <div className="pagination">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              上一页
            </button>
            <span className="pagination-info">
              第 {pagination.page} / {pagination.totalPages} 页 (共 {pagination.total} 条)
            </span>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              下一页
            </button>
          </div>
        </div>
        <div
          className="splitter"
          onMouseDown={handleSplitterMouseDown}
        />
        <div className="detail-panel" style={{ flex: detailFlex }}>
        <ProductDetail
          reference={selectedRef}
          refreshKey={refreshDetail}
          onUpdated={handleProductUpdated}
        />
      </div>
      </div>

      {showSheetModal && (
        <SheetSyncModal
          onClose={() => {
            setShowSheetModal(false);
            fetchProducts();
            setRefreshDetail(n => n + 1);
          }}
        />
      )}

      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}

      {showDriveModal && (
        <DriveScanModal
          onClose={() => {
            setShowDriveModal(false);
            fetchProducts();
            setRefreshDetail(n => n + 1);
          }}
        />
      )}

      {showCopyModal && (
        <CopyGenerationModal
          onClose={() => {
            setShowCopyModal(false);
            fetchProducts();
            setRefreshDetail(n => n + 1); // 触发详情刷新
          }}
        />
      )}

      {showImageModal && (
        <ImageProcessModal
          onClose={() => {
            setShowImageModal(false);
            fetchProducts();
            setRefreshDetail(n => n + 1);
          }}
        />
      )}

      {showAiImageModal && (
        <AiImageModal
          onClose={() => {
            setShowAiImageModal(false);
          }}
        />
      )}

      {showExportModal && (
        <ExportModal
          onClose={() => {
            setShowExportModal(false);
          }}
        />
      )}

      {showImageFinder && scanMatchedRefs && (
        <ImageFinderModal
          refs={scanMatchedRefs}
          onClose={() => setShowImageFinder(false)}
        />
      )}

      {showProductListModal && (
        <ProductListImportModal
          onClose={() => setShowProductListModal(false)}
          onImported={(refs) => {
            setShowProductListModal(false);
            if (refs.length > 0) {
              setScanMatchedRefs(refs);
            }
          }}
        />
      )}

      {showCajaCheck && (
        <CajaNewProductCheckModal
          onClose={() => setShowCajaCheck(false)}
        />
      )}

      {showWebsiteImportModal && (
        <WebsiteImportModal
          onClose={() => {
            setShowWebsiteImportModal(false);
            fetchProducts();
            setRefreshDetail(n => n + 1);
          }}
          onImported={() => {
            setShowWebsiteImportModal(false);
            fetchProducts();
            setRefreshDetail(n => n + 1);
          }}
        />
      )}

      {showWorkshopModal && (
        <ImageWorkshopModal
          onClose={() => {
            setShowWorkshopModal(false);
            fetchProducts();
          }}
        />
      )}

      {showCategoriesPage && (
        <CategoriesPage onClose={() => setShowCategoriesPage(false)} />
      )}
      {showProductImagesPage && (
        <ProductImagesPage onClose={() => setShowProductImagesPage(false)} />
      )}
      {showMobileCaptureModal && (
        <MobileCaptureAccessModal
          onClose={() => setShowMobileCaptureModal(false)}
          onOpenReview={() => {
            setShowMobileCaptureModal(false);
            openReview();
          }}
        />
      )}
      {showMobileCaptureReview && (
        <MobileCaptureReviewPage onClose={closeReview} />
      )}
    </div>
  );
}

export default App;
