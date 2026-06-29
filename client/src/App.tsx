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
import { productsApi } from './services/api';
import { ProductListItem, Pagination } from './types';

function App() {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
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
  const [showWorkshopModal, setShowWorkshopModal] = useState(false);
  const [refreshDetail, setRefreshDetail] = useState(0);
  const [detailFlex, setDetailFlex] = useState(0.6); // 右侧面板 flex 比例

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productsApi.getList({
        search: search || undefined,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        brand: brandFilter || undefined,
        dateFilter: dateFilter || undefined,
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
  }, [search, statusFilter, categoryFilter, brandFilter, dateFilter, page]);

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
    if (!window.confirm(`确定删除选中的 ${refs.length} 个商品？此操作不可撤销。`)) return;
    try {
      const res = await productsApi.batchDelete(refs);
      if (res.success) {
        fetchProducts();
        setSelectedRefs(new Set());
        setSelectedRef(null);
      }
    } catch (err: any) {
      alert('批量删除失败: ' + err.message);
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
      />
      <div className="main-area">
        <LeftPanel
          statistics={statistics}
          categories={categories}
          statusFilter={statusFilter}
          categoryFilter={categoryFilter}
          onStatusFilter={handleStatusFilter}
          onCategoryFilter={handleCategoryFilter}
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
              <option value="可导出PrestaShop">可导出PrestaShop</option>
              <option value="已上传">已上传</option>
            </select>
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {pagination.total} 个商品
            </span>
            <button className="btn btn-sm" style={{ fontSize: 11 }}
              onClick={async () => {
                if (!window.confirm('同步所有已上传PrestaShop商品的价格？')) return;
                const res = await fetch('/api/prestashop/sync-all-prices', { method: 'POST' });
                const d = await res.json();
                alert(d.message || (d.success ? `成功同步 ${d.data?.updated||0} 个商品` : '同步失败'));
              }}>
              💶 同步价格
            </button>
            {selectedRefs.size > 0 && (
              <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}>
                🗑 删除选中 ({selectedRefs.size})
              </button>
            )}
          </div>
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

      {showWorkshopModal && (
        <ImageWorkshopModal
          onClose={() => {
            setShowWorkshopModal(false);
            fetchProducts();
          }}
        />
      )}
    </div>
  );
}

export default App;
