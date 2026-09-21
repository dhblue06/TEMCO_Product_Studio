export type OfflineUploadStatus = 'pending' | 'uploading' | 'failed';

export interface OfflineUploadRecord {
  id: string;
  captureId: number;
  filename: string;
  file: File;
  role: string;
  colors: string[];
  sequence: number;
  status: OfflineUploadStatus;
  error?: string;
  createdAt: number;
  attempts: number;
}

export interface OfflineCaptureDraft {
  captureId: number;
  notes: string;
  productColors: string[];
  inventoryRows: Array<{ colorName: string; quantity: number | null; countType: 'exact' | 'estimated' | 'sufficient' | 'unknown' }>;
  selectedModels: Array<{ model: string; colors: string[] }>;
  updatedAt: number;
}

export interface OfflineStockProduct {
  id: number;
  reference: string;
  name: string;
  ean13: string;
  upc?: string;
  prestashopProductId: number;
  brand: string;
  category: string;
  websiteQuantity: number | null;
  cachedAt: number;
}

export interface OfflineStockPhoto {
  id: string;
  file: File;
}

export interface OfflineStockReport {
  clientId: string;
  product: OfflineStockProduct;
  reportType: 'pieces' | 'boxes' | 'sold_out';
  quantity: number;
  boxSize?: number;
  operatorName: string;
  deviceName: string;
  note: string;
  photos: OfflineStockPhoto[];
  uploadedPhotoIds?: string[];
  serverReportId?: number;
  status: 'pending' | 'syncing' | 'failed' | 'conflict';
  error?: string;
  createdAt: number;
}

export interface OfflineStockDraft {
  id: 'current';
  product: OfflineStockProduct;
  reportType: 'pieces' | 'boxes' | 'sold_out';
  quantity: string;
  boxSize: string;
  note: string;
  photos: OfflineStockPhoto[];
  updatedAt: number;
}

const DB_NAME = 'temco-product-studio-mobile';
const DB_VERSION = 3;
const UPLOAD_STORE = 'uploadQueue';
const DRAFT_STORE = 'captureDrafts';
const STOCK_PRODUCT_STORE = 'stockProducts';
const STOCK_REPORT_STORE = 'stockReports';
const STOCK_DRAFT_STORE = 'stockDrafts';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(UPLOAD_STORE)) {
        const store = db.createObjectStore(UPLOAD_STORE, { keyPath: 'id' });
        store.createIndex('captureId', 'captureId', { unique: false });
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: 'captureId' });
      }
      if (!db.objectStoreNames.contains(STOCK_PRODUCT_STORE)) db.createObjectStore(STOCK_PRODUCT_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STOCK_REPORT_STORE)) db.createObjectStore(STOCK_REPORT_STORE, { keyPath: 'clientId' });
      if (!db.objectStoreNames.contains(STOCK_DRAFT_STORE)) db.createObjectStore(STOCK_DRAFT_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开手机离线存储'));
  });
}

async function useStore<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    // Resolve only after the entire transaction commits.
    request.onerror = () => reject(request.error || new Error('手机离线存储操作失败'));
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error('手机离线保存已中止，请勿关闭页面'));
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('手机离线存储事务失败'));
    };
  });
}

export const mobileOfflineStore = {
  async restoreStockReportDraft(clientId: string, draft: OfflineStockDraft): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STOCK_REPORT_STORE, STOCK_DRAFT_STORE], 'readwrite');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('草稿恢复失败')); };
      tx.objectStore(STOCK_DRAFT_STORE).put(draft);
      tx.objectStore(STOCK_REPORT_STORE).delete(clientId);
    });
  },
  async submitStockDraft(report: OfflineStockReport): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STOCK_REPORT_STORE, STOCK_DRAFT_STORE], 'readwrite');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('保存失败，表单已保留')); };
      tx.objectStore(STOCK_REPORT_STORE).put(report);
      tx.objectStore(STOCK_DRAFT_STORE).delete('current');
    });
  },
  putUpload(record: OfflineUploadRecord): Promise<IDBValidKey> {
    return useStore(UPLOAD_STORE, 'readwrite', store => store.put(record));
  },

  deleteUpload(id: string): Promise<undefined> {
    return useStore(UPLOAD_STORE, 'readwrite', store => store.delete(id) as IDBRequest<undefined>);
  },

  async listUploads(captureId: number): Promise<OfflineUploadRecord[]> {
    const rows = await useStore<OfflineUploadRecord[]>(UPLOAD_STORE, 'readonly', store => store.index('captureId').getAll(captureId));
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  },

  putDraft(draft: OfflineCaptureDraft): Promise<IDBValidKey> {
    return useStore(DRAFT_STORE, 'readwrite', store => store.put(draft));
  },

  getDraft(captureId: number): Promise<OfflineCaptureDraft | undefined> {
    return useStore(DRAFT_STORE, 'readonly', store => store.get(captureId));
  },

  deleteDraft(captureId: number): Promise<undefined> {
    return useStore(DRAFT_STORE, 'readwrite', store => store.delete(captureId) as IDBRequest<undefined>);
  },

  putStockProduct(product: OfflineStockProduct): Promise<IDBValidKey> {
    return useStore(STOCK_PRODUCT_STORE, 'readwrite', store => store.put(product));
  },

  async replaceStockProducts(products: OfflineStockProduct[]): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STOCK_PRODUCT_STORE, 'readwrite');
      const store = transaction.objectStore(STOCK_PRODUCT_STORE);
      store.clear();
      products.forEach(product => store.put(product));
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error('离线商品目录保存失败')); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('离线商品目录保存已中止')); };
    });
  },

  countStockProducts(): Promise<number> {
    return useStore(STOCK_PRODUCT_STORE, 'readonly', store => store.count());
  },

  async findStockProduct(query: string): Promise<OfflineStockProduct | undefined> {
    const q = query.trim().toLocaleLowerCase();
    const products = await useStore<OfflineStockProduct[]>(STOCK_PRODUCT_STORE, 'readonly', store => store.getAll());
    return products.find(p => p.reference.toLocaleLowerCase() === q || p.ean13.toLocaleLowerCase() === q || String(p.upc || '').toLocaleLowerCase() === q)
      || products.find(p => p.reference.toLocaleLowerCase().startsWith(q) || p.name.toLocaleLowerCase().includes(q));
  },

  putStockReport(report: OfflineStockReport): Promise<IDBValidKey> {
    return useStore(STOCK_REPORT_STORE, 'readwrite', store => store.put(report));
  },

  listStockReports(): Promise<OfflineStockReport[]> {
    return useStore(STOCK_REPORT_STORE, 'readonly', store => store.getAll());
  },

  deleteStockReport(clientId: string): Promise<undefined> {
    return useStore(STOCK_REPORT_STORE, 'readwrite', store => store.delete(clientId) as IDBRequest<undefined>);
  },

  putStockDraft(draft: OfflineStockDraft): Promise<IDBValidKey> {
    return useStore(STOCK_DRAFT_STORE, 'readwrite', store => store.put(draft));
  },

  getStockDraft(): Promise<OfflineStockDraft | undefined> {
    return useStore(STOCK_DRAFT_STORE, 'readonly', store => store.get('current'));
  },

  deleteStockDraft(): Promise<undefined> {
    return useStore(STOCK_DRAFT_STORE, 'readwrite', store => store.delete('current') as IDBRequest<undefined>);
  },
};
