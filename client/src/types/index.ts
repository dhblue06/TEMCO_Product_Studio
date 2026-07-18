// 商品类型定义
export interface ProductContent {
  name: string;
  descriptionShort: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  friendlyUrl: string;
  imageAlt: string;
  galleryImageAlts: string[];
  whatsappCopy: string;
  videoScript: string;
}

export interface ProductImage {
  id: number;
  productId: number;
  driveId: string;
  originalName: string;
  exportName: string;
  imageIndex: number;
  role: 'main' | 'gallery';
  image_slot?: string;
  imageSlot?: string;
  mimeType: string;
  webViewLink: string;
  thumbnailLink: string;
  alt: string;
  status: string;
  localPath: string;
}

export interface ProductVideo {
  id: number;
  productId: number;
  driveId: string;
  name: string;
  webViewLink: string;
  localPath: string;
}

export interface Product {
  id: number;
  reference: string;
  prestashopId: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  quantity: number;
  selling_points: string;
  product_intro: string;
  video_url: string;
  ean13: string;
  upc: string;
  mpn: string;
  prestashop_id: number;
  prestashop_sync_status: string;
  prestashop_last_sync_at: string;
  active?: string;
  status: string;
  uploadStatus: string;
  sheetRawData: Record<string, string>;
  content: {
    es: ProductContent | null;
    zh: ProductContent | null;
  };
  images: ProductImage[];
  video: ProductVideo | null;
  imageCount: number;
  mainImageCount: number;
  videoCount: number;
  updatedAt: string;
  createdAt: string;
}

// 商品列表项（简版）
export interface ProductListItem {
  id: number;
  reference: string;
  prestashopId: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  quantity: number;
  selling_points: string;
  product_intro: string;
  status: string;
  uploadStatus: string;
  esName: string;
  esDescriptionShort: string;
  esSeoTitle: string;
  zhName: string;
  imageCount: number;
  mainImageCount: number;
  videoCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ProductListResponse {
  success: boolean;
  data: {
    products: ProductListItem[];
    pagination: Pagination;
  };
  error?: string;
}

export interface ProductDetailResponse {
  success: boolean;
  data: Product;
  error?: string;
}

export interface ApiSettings {
  [key: string]: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
