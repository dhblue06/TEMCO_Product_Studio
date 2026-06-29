const API_BASE = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
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
};

// 健康检查
export const healthApi = {
  check() {
    return request<any>('/health');
  },
};