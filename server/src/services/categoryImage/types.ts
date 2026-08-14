// 分类图片批量上传模块 — 类型定义

export interface CategoryRecord {
  id: number;
  prestashopCategoryId: number;
  parentId?: number;
  name: string;
  normalizedName: string;
  fullPath?: string;
  active: boolean;
  syncedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CategoryImageAsset {
  id: number;
  localPath: string;
  filename: string;
  normalizedFilename: string;
  mimeType?: string;
  extension?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  sha256?: string;
  ignored: boolean;
  scannedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CategoryImageMatchType = 'manual' | 'exact' | 'alias' | 'fuzzy';

export type CategoryImageMatchStatus = 'suggested' | 'confirmed' | 'rejected' | 'ignored' | 'conflict';

export interface CategoryImageMapping {
  id: number;
  categoryId: number;
  categoryImageId: number;
  matchType: CategoryImageMatchType;
  confidence: number;
  status: CategoryImageMatchStatus;
  confirmedByUser: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  // 联查字段
  categoryName?: string;
  prestashopCategoryId?: number;
  imageFilename?: string;
  imageLocalPath?: string;
}

export type UploadJobStatus = 'queued' | 'processing' | 'success' | 'failed' | 'cancelled' | 'skipped';

export interface CategoryImageUploadJob {
  id: number;
  batchId: string;
  categoryId: number;
  categoryImageId: number;
  imageType?: string;
  status: UploadJobStatus;
  operation?: string;
  requestMethod?: string;
  attemptCount: number;
  httpStatus?: number;
  responseBody?: string;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  // 联查字段
  categoryName?: string;
  prestashopCategoryId?: number;
  imageFilename?: string;
}

export interface UploadPreview {
  total: number;
  ready: number;
  unmatched: number;
  conflict: number;
  invalidFile: number;
  missingCategory: number;
  canStart: boolean;
  items: UploadPreviewItem[];
}

export interface UploadPreviewItem {
  categoryId: number;
  prestashopCategoryId: number;
  categoryName: string;
  imageFilename?: string;
  imageLocalPath?: string;
  mappingStatus?: string;
  issue?: string;
}

export interface PrestashopUploadResult {
  success: boolean;
  httpStatus?: number;
  error?: string;
  errorCode?: string;
}

export interface CategoryImageSettings {
  categoryImageUploadEnabled: boolean;
  categoryImageApiPath: string;
  categoryImageMethodOverride: boolean;
  categoryImageConcurrency: number;
  categoryImageTimeoutSeconds: number;
  categoryImageRetryLimit: number;
  categoryImageJpegQuality: number;
  categoryImageMaxSize: number;
  categoryImageDir: string;
  categoryUploadBatchLimit: number;
  categoryImageMaxFileSizeMb: number;
}

// 标准化错误码
export const CATEGORY_IMAGE_ERRORS = {
  PRESTASHOP_CONNECTION_FAILED: 'PrestaShop 连接失败',
  PRESTASHOP_AUTH_FAILED: 'PrestaShop API Key 认证失败',
  PRESTASHOP_PERMISSION_DENIED: 'API 密钥无分类图片修改权限',
  CATEGORY_NOT_FOUND: '分类 ID 不存在',
  IMAGE_NOT_FOUND: '图片文件已被移动或删除',
  IMAGE_INVALID: '图片无法读取',
  IMAGE_TOO_LARGE: '图片文件过大',
  MATCH_NOT_CONFIRMED: '映射未确认',
  MATCH_CONFLICT: '存在映射冲突',
  UPLOAD_TIMEOUT: '服务器上传超时',
  UPLOAD_HTTP_ERROR: '上传 HTTP 错误',
  UPLOAD_UNKNOWN_ERROR: '未知上传错误',
} as const;
