const API_BASE = '/api';

/** 延迟等待（毫秒） */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的请求：网络错误/5xx 时自动重试（指数退避）。
 * 用途：弱网环境下图片上传等大请求的自动恢复。
 * 4xx（业务错误）不重试——重试无意义。
 */
async function requestWithRetry<T>(endpoint: string, options: RequestInit, retries = 2): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const isFormData = options?.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options?.headers || {}),
  };

  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let fatal = false; // 4xx 业务错误：不再重试
    try {
      const response = await fetch(url, { ...options, headers });
      if (response.ok) return response.json();
      const error = await response.json().catch(() => ({ error: response.statusText }));
      const msg = error.error || `HTTP ${response.status}`;
      if (response.status >= 400 && response.status < 500) {
        fatal = true;
        throw new Error(msg);
      }
      lastErr = new Error(msg); // 5xx → 记录，稍后重试
    } catch (e: any) {
      if (fatal) throw e; // 4xx：直接抛给调用方
      lastErr = e; // 网络错误（TypeError）或 5xx：重试
    }
    if (attempt < retries) {
      await sleep(600 * Math.pow(2, attempt)); // 0.6s → 1.2s
    }
  }
  throw lastErr || new Error('请求失败');
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      // FormData 时由浏览器自动生成 multipart boundary，不能手动设 Content-Type
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// 商品相关 API
export const productsApi = {
  // 获取商品列表
  getList(params?: {
    search?: string;
    status?: string;
    category?: string;
    brand?: string;
    dateFilter?: string;
    websiteStatus?: string;
    refs?: string;
    uploadStatus?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          query.set(key, String(value));
        }
      });
    }
    return request<any>(`/products?${query.toString()}`);
  },

  // 获取商品详情
  getDetail(reference: string) {
    return request<any>(`/products/${encodeURIComponent(reference)}`);
  },

  // 更新商品
  update(reference: string, data: any) {
    return request<any>(`/products/${encodeURIComponent(reference)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // 删除商品
  delete(reference: string) {
    return request<any>(`/products/${encodeURIComponent(reference)}`, {
      method: 'DELETE',
    });
  },

  // 批量删除
  batchDelete(references: string[]) {
    return request<any>('/products/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ references }),
    });
  },

  // 批量更新状态
  batchUpdateStatus(references: string[], status: string) {
    return request<any>('/products/batch-status', {
      method: 'POST',
      body: JSON.stringify({ references, status }),
    });
  },

  // 获取分类列表
  getCategories() {
    return request<any>('/products/meta/categories');
  },

  // 获取统计数据
  getStatistics() {
    return request<any>('/products/meta/statistics');
  },
};

// 设置相关 API
export const settingsApi = {
  // 获取所有设置
  getAll() {
    return request<any>('/settings');
  },

  // 更新单个设置
  update(key: string, value: string) {
    return request<any>(`/settings/${key}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
  },

  // 批量更新设置
  batchUpdate(settings: Record<string, string>) {
    return request<any>('/settings/batch', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    });
  },

  // 测试文案/图片/文章 API 设置
  test(section: 'copy' | 'image' | 'article') {
    return request<any>(`/settings/test/${section}`, {
      method: 'POST',
    });
  },
};

// Google Sheet 同步 API
export const sheetApi = {
  sync(sheetUrl: string) {
    return request<any>('/sheet/sync', {
      method: 'POST',
      body: JSON.stringify({ sheetUrl }),
    });
  },

  test(sheetUrl: string) {
    return request<any>('/sheet/test', {
      method: 'POST',
      body: JSON.stringify({ sheetUrl }),
    });
  },
};

// PrestaShop API
export const prestashopApi = {
  getConfig() {
    return request<any>('/prestashop/config');
  },
  updateConfig(payload: Record<string, string>) {
    return request<any>('/prestashop/config', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  testConnection() {
    return request<any>('/prestashop/test-connection');
  },
  getLanguages() {
    return request<any>('/prestashop/languages');
  },
  getCategories() {
    return request<any>('/prestashop/categories');
  },
  getManufacturers() {
    return request<any>('/prestashop/manufacturers');
  },
  getShops() {
    return request<any>('/prestashop/shops');
  },
  validateProduct(ref: string) {
    return request<any>(`/prestashop/validate-product/${encodeURIComponent(ref)}`);
  },
  syncProduct(ref: string, options?: Record<string, boolean>) {
    return request<any>(`/prestashop/sync-product/${encodeURIComponent(ref)}`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },
  syncImage(imgId: number, imageMode?: string) {
    return request<any>(`/prestashop/sync-image/${imgId}`, {
      method: 'POST',
      body: JSON.stringify({ imageMode: imageMode || 'skipExists' }),
    });
  },
  syncImages(ref: string, imageMode?: string) {
    return request<any>(`/prestashop/sync-images/${encodeURIComponent(ref)}`, {
      method: 'POST',
      body: JSON.stringify({ imageMode: imageMode || 'skipExists' }),
    });
  },
  // 变体（组合）管理
  getCombinations(productId: number) {
    return request<any>(`/prestashop/combinations/${productId}`);
  },
  getOptionValues(scope?: 'color') {
    return request<any>(`/prestashop/option-values${scope === 'color' ? '?scope=color' : ''}`);
  },
  checkPermissions() {
    return request<any>('/prestashop/permission-check');
  },
  createCombination(productId: number, data: any) {
    return request<any>(`/prestashop/combinations/${productId}`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateCombination(id: number, data: any) {
    return request<any>(`/prestashop/combinations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteCombination(id: number) {
    return request<any>(`/prestashop/combinations/${id}`, { method: 'DELETE' });
  },
};

// 分类管理 API
export const categoriesApi = {
  // 分类数据
  importCsv(file: File) {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${API_BASE}/categories/import-csv`, { method: 'POST', body: form }).then(r => r.json());
  },
  syncPrestashop() {
    return request<any>('/categories/sync-prestashop', { method: 'POST' });
  },
  getList(params?: { search?: string; matchStatus?: string; uploadStatus?: string; parentId?: string; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') query.set(k, String(v)); });
    }
    return request<any>(`/categories?${query.toString()}`);
  },
  getStats() {
    return request<any>('/categories/stats');
  },
  getParents() {
    return request<any>('/categories/parents');
  },

  // 图片扫描
  scanImages(dirPath?: string) {
    return request<any>('/categories/scan-images', { method: 'POST', body: JSON.stringify({ dirPath }) });
  },
  getImages(params?: { search?: string; ignored?: string; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') query.set(k, String(v)); });
    }
    return request<any>(`/categories/images?${query.toString()}`);
  },
  ignoreImage(id: number, ignored: boolean) {
    return request<any>(`/categories/images/${id}/ignore`, { method: 'POST', body: JSON.stringify({ ignored }) });
  },
  clearImages() {
    return request<any>('/categories/images/clear', { method: 'POST' });
  },

  // 匹配
  runMatching(categoryIds?: number[]) {
    return request<any>('/categories/matching/run', { method: 'POST', body: JSON.stringify({ categoryIds }) });
  },
  getMatchingResults(params?: { status?: string; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') query.set(k, String(v)); });
    }
    return request<any>(`/categories/matching/results?${query.toString()}`);
  },
  confirmMapping(categoryId: number, categoryImageId: number) {
    return request<any>('/categories/matching/confirm', { method: 'POST', body: JSON.stringify({ categoryId, categoryImageId }) });
  },
  rejectMapping(categoryId: number, categoryImageId: number) {
    return request<any>('/categories/matching/reject', { method: 'POST', body: JSON.stringify({ categoryId, categoryImageId }) });
  },
  manualMap(categoryId: number, categoryImageId: number) {
    return request<any>('/categories/matching/manual-map', { method: 'POST', body: JSON.stringify({ categoryId, categoryImageId }) });
  },

  // 上传任务
  previewUpload(categoryIds?: number[]) {
    return request<any>('/categories/uploads/preview', { method: 'POST', body: JSON.stringify({ categoryIds }) });
  },
  createUploadBatch(categoryIds?: number[]) {
    return request<any>('/categories/uploads/create', { method: 'POST', body: JSON.stringify({ categoryIds }) });
  },
  startUploadBatch(batchId: string) {
    return request<any>(`/categories/uploads/${batchId}/start`, { method: 'POST' });
  },
  cancelUploadBatch(batchId: string) {
    return request<any>(`/categories/uploads/${batchId}/cancel`, { method: 'POST' });
  },
  retryFailedJobs(batchId: string) {
    return request<any>(`/categories/uploads/${batchId}/retry-failed`, { method: 'POST' });
  },
  getBatchStatus(batchId: string) {
    return request<any>(`/categories/uploads/${batchId}`);
  },
  getAllBatches() {
    return request<any>('/categories/uploads');
  },
  getBatchLogsCsvUrl(batchId: string) {
    return `${API_BASE}/categories/uploads/${batchId}/logs`;
  },
};

// 健康检查
export const healthApi = {
  check() {
    return request<any>('/health');
  },
};

// ==================== Mobile Capture API（v1.4） ====================

let mobileToken: string | null = null;
export function setMobileToken(token: string | null) {
  mobileToken = token;
  if (token) localStorage.setItem('mobile_capture_token', token);
  else localStorage.removeItem('mobile_capture_token');
}
export function getMobileToken(): string | null {
  if (mobileToken) return mobileToken;
  const saved = localStorage.getItem('mobile_capture_token');
  if (saved) mobileToken = saved;
  return saved;
}

function authFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  const token = getMobileToken();
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
}

async function authRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await authFetch(endpoint, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    if (response.status === 401) {
      setMobileToken(null);
      // 通知页面回到登录界面
      window.dispatchEvent(new CustomEvent('mobile-auth-expired'));
    }
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * 带鉴权 + 自动重试的请求（弱网图片上传用）：
 * 网络错误/5xx 重试 2 次（指数退避）；4xx 与 401 不重试。
 */
async function authRequestWithRetry<T>(endpoint: string, options?: RequestInit, retries = 2): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let fatal = false;
    try {
      const response = await authFetch(endpoint, options);
      if (response.ok) return response.json();
      const error = await response.json().catch(() => ({ error: response.statusText }));
      const msg = error.error || `HTTP ${response.status}`;
      if (response.status === 401) {
        setMobileToken(null);
        window.dispatchEvent(new CustomEvent('mobile-auth-expired'));
        throw new Error(msg);
      }
      if (response.status >= 400 && response.status < 500) {
        fatal = true;
        throw new Error(msg);
      }
      lastErr = new Error(msg); // 5xx → 重试
    } catch (e: any) {
      if (fatal || e?.message === 'Unauthorized' || /401/.test(String(e?.message))) throw e;
      lastErr = e; // 网络错误/5xx → 重试
    }
    if (attempt < retries) {
      await sleep(600 * Math.pow(2, attempt)); // 0.6s → 1.2s
    }
  }
  throw lastErr || new Error('请求失败');
}

export const mobileCaptureApi = {
  // 认证
  login(pin: string, operatorName: string, deviceName: string, areaCode?: string) {
    return authRequest<any>('/mobile-capture/auth/pin', {
      method: 'POST',
      body: JSON.stringify({ pin, operatorName, deviceName, areaCode }),
    });
  },

  // 电脑端访问信息（IP + PIN + 二维码）
  getAccessInfo() {
    return request<any>('/mobile-capture/access-info');
  },

  // 会话
  createSession(areaCode?: string, notes?: string) {
    return authRequest<any>('/mobile-capture/sessions', { method: 'POST', body: JSON.stringify({ areaCode, notes }) });
  },
  getSessions(status?: string) {
    return authRequest<any>(`/mobile-capture/sessions${status ? `?status=${status}` : ''}`);
  },
  getSession(id: number) {
    return authRequest<any>(`/mobile-capture/sessions/${id}`);
  },
  completeSession(id: number) {
    return authRequest<any>(`/mobile-capture/sessions/${id}/complete`, { method: 'POST' });
  },
  cancelSession(id: number) {
    return authRequest<any>(`/mobile-capture/sessions/${id}/cancel`, { method: 'POST' });
  },
  deleteSession(id: number) {
    return authRequest<any>(`/mobile-capture/sessions/${id}`, { method: 'DELETE' });
  },

  // 产品搜索
  searchProduct(q: string) {
    return authRequest<any>(`/mobile-capture/products/search?q=${encodeURIComponent(q)}`);
  },
  createMobileProduct(data: any) {
    return authRequest<any>('/mobile-capture/products', { method: 'POST', body: JSON.stringify(data) });
  },
  setSoldOut(productId: number, soldOut: boolean) {
    return authRequest<any>(`/mobile-capture/products/${productId}/sold-out`, { method: 'POST', body: JSON.stringify({ soldOut }) });
  },
  getPhoneModels() {
    return authRequest<any>('/mobile-capture/phone-models');
  },
  syncPhoneModels() {
    return authRequest<any>('/mobile-capture/phone-models/sync', { method: 'POST' });
  },
  saveFixedColors(productId: number, colors: string[]) {
    return authRequest<any>(`/mobile-capture/products/${productId}/fixed-colors`, { method: 'PUT', body: JSON.stringify({ colors }) });
  },
  savePhoneModels(captureId: number, models: { brand: string; model: string }[]) {
    return authRequest<any>(`/mobile-capture/captures/${captureId}/phone-models`, { method: 'PUT', body: JSON.stringify({ models }) });
  },
  getCaptures(params?: { sessionId?: number; captureStatus?: string; operator?: string; page?: number; pageSize?: number }) {
    const qs = new URLSearchParams();
    if (params?.sessionId) qs.set('sessionId', String(params.sessionId));
    if (params?.captureStatus) qs.set('captureStatus', params.captureStatus);
    if (params?.operator) qs.set('operator', params.operator);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    return authRequest<any>(`/mobile-capture/captures?${qs.toString()}`);
  },
  // ===== v1.5 仓库快速盘点 =====
  createInventorySession(data: any) {
    return authRequest<any>('/inventory/sessions', { method: 'POST', body: JSON.stringify(data) });
  },
  listInventorySessions(status?: string) {
    return authRequest<any>(`/inventory/sessions${status ? `?status=${status}` : ''}`);
  },
  getInventorySession(id: number) {
    return authRequest<any>(`/inventory/sessions/${id}`);
  },
  completeInventorySession(id: number) {
    return authRequest<any>(`/inventory/sessions/${id}/complete`, { method: 'POST' });
  },
  addInventoryProduct(sessionId: number, data: any) {
    return authRequest<any>(`/inventory/sessions/${sessionId}/products`, { method: 'POST', body: JSON.stringify(data) });
  },
  getInventoryProduct(id: number) {
    return authRequest<any>(`/inventory/products/${id}`);
  },
  saveInventoryModel(productId: number, model: string, data: any) {
    return authRequest<any>(`/inventory/products/${productId}/models/${encodeURIComponent(model)}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  batchSaveInventoryModels(productId: number, models: any[]) {
    return authRequest<any>(`/inventory/products/${productId}/batch`, { method: 'POST', body: JSON.stringify({ models }) });
  },
  getInventorySummary(productId: number) {
    return authRequest<any>(`/inventory/products/${productId}/summary`);
  },
  getInventoryDifferences(productId: number) {
    return authRequest<any>(`/inventory/products/${productId}/differences`);
  },
  createStockFlag(data: any) {
    return authRequest<any>('/inventory/stock-flags', { method: 'POST', body: JSON.stringify(data) });
  },
  fuzzySearch(q: string) {
    return authRequest<any>(`/mobile-capture/products/fuzzy?q=${encodeURIComponent(q)}`);
  },
  getCaptureStatus(productId: number) {
    return authRequest<any>(`/mobile-capture/products/${productId}/capture-status`);
  },

  // 采集任务
  createCapture(payload: { sessionId: number; productId: number; prestashopProductId?: number; serialNumber?: string; reference?: string; ean13?: string; model?: string; colors?: string[] }) {
    return authRequest<any>('/mobile-capture/captures', { method: 'POST', body: JSON.stringify(payload) });
  },
  getMyCaptures(sessionId?: number) {
    return authRequest<any>(`/mobile-capture/captures${sessionId ? `?sessionId=${sessionId}` : ''}`);
  },
  getCapture(id: number) {
    return authRequest<any>(`/mobile-capture/captures/${id}`);
  },
  updateCaptureDraft(id: number, data: any) {
    return authRequest<any>(`/mobile-capture/captures/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  submitCapture(id: number) {
    return authRequest<any>(`/mobile-capture/captures/${id}/submit`, { method: 'POST' });
  },
  cancelCapture(id: number) {
    return authRequest<any>(`/mobile-capture/captures/${id}/cancel`, { method: 'POST' });
  },
  deleteCapture(id: number) {
    return authRequest<any>(`/mobile-capture/captures/${id}`, { method: 'DELETE' });
  },
  reopenCapture(id: number, sessionId?: number) {
    return authRequest<any>(`/mobile-capture/captures/${id}/reopen`, { method: 'POST', body: JSON.stringify({ sessionId }) });
  },

  // 图片（弱网自动重试）
  uploadImage(captureId: number, file: File, meta: { role: string; colors?: string[]; sequence?: number; isCoverCandidate?: boolean }) {
    const form = new FormData();
    form.append('image', file);
    form.append('role', meta.role);
    if (meta.colors?.length) form.append('colors', JSON.stringify(meta.colors));
    if (meta.sequence !== undefined) form.append('sequence', String(meta.sequence));
    if (meta.isCoverCandidate) form.append('isCoverCandidate', 'true');
    return authRequestWithRetry<any>(`/mobile-capture/captures/${captureId}/images`, { method: 'POST', body: form });
  },
  getImages(captureId: number) {
    return authRequest<any>(`/mobile-capture/captures/${captureId}/images`);
  },
  updateImage(imageId: number, data: any) {
    return authRequest<any>(`/mobile-capture/images/${imageId}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  deleteImage(imageId: number) {
    return authRequest<any>(`/mobile-capture/images/${imageId}`, { method: 'DELETE' });
  },
  setImageColors(imageId: number, colors: { colorName: string; isPrimary?: boolean }[]) {
    return authRequest<any>(`/mobile-capture/images/${imageId}/colors`, { method: 'POST', body: JSON.stringify({ colors }) });
  },
  imageFileUrl(imageId: number) {
    const token = getMobileToken();
    return `${API_BASE}/mobile-capture/images/${imageId}/file${token ? `?token=${token}` : ''}`;
  },

  // 库存
  saveInventory(captureId: number, items: any[]) {
    return authRequest<any>(`/mobile-capture/captures/${captureId}/inventory`, { method: 'PUT', body: JSON.stringify({ items }) });
  },
  getInventory(captureId: number) {
    return authRequest<any>(`/mobile-capture/captures/${captureId}/inventory`);
  },

  // 语音备注
  uploadAudioNote(captureId: number, blob: Blob, filename: string, durationSeconds: number) {
    const form = new FormData();
    form.append('audio', blob, filename);
    form.append('durationSeconds', String(durationSeconds));
    return authRequest<any>(`/mobile-capture/captures/${captureId}/audio-note`, { method: 'POST', body: form });
  },
  getAudioNotes(captureId: number) {
    return authRequest<any>(`/mobile-capture/captures/${captureId}/audio-notes`);
  },
  deleteAudioNote(id: number) {
    return authRequest<any>(`/mobile-capture/audio-notes/${id}`, { method: 'DELETE' });
  },

  // ===== 电脑审核端 =====
  getStats() {
    return request<any>('/mobile-capture/stats');
  },
  reviewCaptures(params: Record<string, any>) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') query.set(k, String(v)); });
    return request<any>(`/mobile-capture/review/captures?${query.toString()}`);
  },
  /** 审核端修改采集任务（颜色等） */
  reviewUpdateCapture(id: number, data: any) {
    return request<any>(`/mobile-capture/review/captures/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  /** 批量删除采集任务 */
  batchDeleteCaptures(ids: number[]) {
    return request<any>('/mobile-capture/review/captures/batch-delete', { method: 'POST', body: JSON.stringify({ ids }) });
  },
  reviewCaptureDetail(id: number) {
    return request<any>(`/mobile-capture/review/captures/${id}`);
  },
  reviewImageFileUrl(imageId: number) {
    return `${API_BASE}/mobile-capture/review/images/${imageId}/file`;
  },
  /** 原图下载链接（带下载文件名，供 <a download> 使用） */
  reviewImageDownloadUrl(imageId: number, filename?: string) {
    return `${API_BASE}/mobile-capture/review/images/${imageId}/file${filename ? `?download=${encodeURIComponent(filename)}` : ''}`;
  },
  /** 电脑端补传原图（照片导出到电脑后补回任务；弱网自动重试） */
  reuploadImage(captureId: number, file: File, meta: { role: string; colors?: string[]; isCoverCandidate?: boolean }) {
    const form = new FormData();
    form.append('image', file);
    form.append('role', meta.role);
    if (meta.colors?.length) form.append('colors', JSON.stringify(meta.colors));
    if (meta.isCoverCandidate) form.append('isCoverCandidate', 'true');
    return requestWithRetry<any>(`/mobile-capture/review/captures/${captureId}/images/reupload`, { method: 'POST', body: form });
  },
  /** 处理后照片（弱网自动重试） */
  uploadProcessedImage(captureId: number, file: File, meta: { sourceImageId?: number; role?: string; isCover?: boolean }) {
    const form = new FormData();
    form.append('image', file);
    if (meta.sourceImageId) form.append('sourceImageId', String(meta.sourceImageId));
    if (meta.role) form.append('role', meta.role);
    if (meta.isCover) form.append('isCover', 'true');
    return requestWithRetry<any>(`/mobile-capture/review/captures/${captureId}/processed-images`, { method: 'POST', body: form });
  },
  processedImageFileUrl(imageId: number) {
    return `${API_BASE}/mobile-capture/review/processed-images/${imageId}/file`;
  },
  updateProcessedImage(imageId: number, data: any) {
    return request<any>(`/mobile-capture/review/processed-images/${imageId}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  deleteProcessedImage(imageId: number) {
    return request<any>(`/mobile-capture/review/processed-images/${imageId}`, { method: 'DELETE' });
  },
  startReview(id: number) {
    return request<any>(`/mobile-capture/review/captures/${id}/start-review`, { method: 'POST' });
  },
  approveCapture(id: number) {
    return request<any>(`/mobile-capture/review/captures/${id}/approve`, { method: 'POST' });
  },
  rejectCapture(id: number, reason?: string) {
    return request<any>(`/mobile-capture/review/captures/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
  },
  markReady(id: number) {
    return request<any>(`/mobile-capture/review/captures/${id}/mark-ready`, { method: 'POST' });
  },
  pushToProductImages(id: number) {
    return request<any>(`/mobile-capture/review/captures/${id}/push-to-product-images`, { method: 'POST' });
  },
  /** 提升为产品图片（本地 product_images） */
  promoteImages(id: number) {
    return request<any>(`/mobile-capture/review/captures/${id}/promote-images`, { method: 'POST' });
  },
  /** 一键：提升为产品图片 + 上传到 PrestaShop 网站 */
  syncImagesToWebsite(id: number) {
    return request<any>(`/mobile-capture/review/captures/${id}/sync-images-to-website`, { method: 'POST' });
  },
  /** 一键：把采集的颜色+库存同步为网站变体 */
  syncVariantsToWebsite(id: number) {
    return request<any>(`/mobile-capture/review/captures/${id}/sync-variants-to-website`, { method: 'POST' });
  },
  createVariantDrafts(id: number) {
    return request<any>(`/mobile-capture/review/captures/${id}/create-variant-drafts`, { method: 'POST' });
  },
  reviewApproveImage(imageId: number) {
    return request<any>(`/mobile-capture/review/images/${imageId}/approve`, { method: 'POST' });
  },
  reviewRejectImage(imageId: number, reason?: string) {
    return request<any>(`/mobile-capture/review/images/${imageId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
  },
  reviewUpdateImage(imageId: number, data: any) {
    return request<any>(`/mobile-capture/review/images/${imageId}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  reviewSetImageColors(imageId: number, colors: any[]) {
    return request<any>(`/mobile-capture/review/images/${imageId}/colors`, { method: 'POST', body: JSON.stringify({ colors }) });
  },
  approveInventory(captureId: number, items: any[]) {
    return request<any>(`/mobile-capture/review/captures/${captureId}/inventory/approve`, { method: 'POST', body: JSON.stringify({ items }) });
  },
  getPendingColors() {
    return request<any>('/mobile-capture/review/colors');
  },
  mapColor(colorId: number, status: string, prestashopAttributeId?: number) {
    return request<any>(`/mobile-capture/review/colors/${colorId}/map`, { method: 'POST', body: JSON.stringify({ status, prestashopAttributeId }) });
  },
  getVariantDrafts(params: Record<string, any> = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') query.set(k, String(v)); });
    return request<any>(`/mobile-capture/variant-drafts?${query.toString()}`);
  },
  updateVariantDraft(id: number, data: any) {
    return request<any>(`/mobile-capture/variant-drafts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  cleanup() {
    return request<any>('/mobile-capture/cleanup', { method: 'POST' });
  },
};

// v1.5 仓库盘点 API（盘点方法统一入口，复用手机认证）
export const inventoryApi = mobileCaptureApi;

// v1.6 CAJA 新品检查 API
export const cajaCheckApi = {
  /** 上传 Excel 预览（不比对网站） */
  preview(file: File) {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${API_BASE}/caja-check/preview`, { method: 'POST', body: form }).then(r => r.json());
  },
  /** 上传 Excel 并执行检查（读取网站 → 匹配 → 返回 summary） */
  run(file: File) {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${API_BASE}/caja-check/run`, { method: 'POST', body: form }).then(r => r.json());
  },
  getBatch(id: number) {
    return request<any>(`/caja-check/batches/${id}`);
  },
  getItems(id: number, params?: { status?: string; search?: string; page?: number; pageSize?: number; sort?: string; order?: string }) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') query.set(k, String(v)); });
    }
    return request<any>(`/caja-check/batches/${id}/items?${query.toString()}`);
  },
  getHistory() {
    return request<any>('/caja-check/batches');
  },
  deleteBatch(id: number) {
    return request<any>(`/caja-check/batches/${id}`, { method: 'DELETE' });
  },
  /** 导出 CSV 下载 URL（默认 status=new） */
  exportUrl(id: number, status = 'new') {
    return `${API_BASE}/caja-check/batches/${id}/export?status=${status}`;
  },
  /** 勾选新品批量创建到网站（基础信息） */
  uploadToWebsite(batchId: number, itemIds: number[]) {
    return request<any>(`/caja-check/batches/${batchId}/upload-to-website`, {
      method: 'POST',
      body: JSON.stringify({ itemIds }),
    });
  },
  /** 价格同步：勾选商品网站价格更新为文件售价（以文件为准） */
  syncPrices(batchId: number, itemIds: number[]) {
    return request<any>(`/caja-check/batches/${batchId}/sync-prices`, {
      method: 'POST',
      body: JSON.stringify({ itemIds }),
    });
  },
};

// v1.7 缺货上报 API（手机扫码上报 + 网站红标 + 一键同步库存）
export const stockReportApi = {
  /** 只读查产品（扫码/输条码，不创建记录） */
  find(query: string) {
    return request<any>(`/stock-report/find?query=${encodeURIComponent(query)}`);
  },
  /** 上传上报图片（拍照/相册，自动附加到上报记录） */
  uploadImage(reportId: number, file: File) {
    const form = new FormData();
    form.append('image', file);
    return request<any>(`/stock-report/${reportId}/upload-image`, { method: 'POST', body: form });
  },
  /** 删除上报图片 */
  removeImage(reportId: number, name: string) {
    return request<any>(`/stock-report/${reportId}/image/${encodeURIComponent(name)}`, { method: 'DELETE' });
  },
  /** 上报图片 URL */
  imageUrl(reportId: number, name: string) {
    return `${API_BASE}/stock-report/${reportId}/image/${encodeURIComponent(name)}`;
  },
  /** 上报缺货（pieces/boxes/sold_out） */
  create(data: { query?: string; productId?: number; reportType: 'pieces' | 'boxes' | 'sold_out'; quantity?: number; boxSize?: number; operatorName?: string; deviceName?: string; note?: string }) {
    return request<any>('/stock-report', { method: 'POST', body: JSON.stringify(data) });
  },
  /** 缺货汇总（网站红标用） */
  getSummary() {
    return request<any>('/stock-report/summary');
  },
  /** 缺货明细列表 */
  list(status = 'all') {
    return request<any>(`/stock-report/list?status=${status}`);
  },
  /** 同步单条到网站 */
  sync(id: number) {
    return request<any>(`/stock-report/${id}/sync`, { method: 'POST' });
  },
  /** 一键同步全部 */
  syncAll() {
    return request<any>('/stock-report/sync-all', { method: 'POST' });
  },
  /** 补货后标记已解决 */
  resolve(id: number) {
    return request<any>(`/stock-report/${id}/resolve`, { method: 'POST' });
  },
  /** 删除记录 */
  remove(id: number) {
    return request<any>(`/stock-report/${id}`, { method: 'DELETE' });
  },
};