// Mobile Capture 前端类型（v1.4）

export interface MobileSession {
  id: number;
  session_code: string;
  operator_name: string;
  device_name: string;
  area_code: string;
  status: 'active' | 'completed' | 'cancelled';
  notes: string;
  created_at: string;
  completed_at: string | null;
  capture_count?: number;
}

export interface MobileCaptureListItem {
  id: number;
  session_id: number;
  product_id: number;
  prestashop_product_id: number;
  serial_number: string;
  reference: string;
  ean13: string;
  model: string;
  capture_status: string;
  review_status: string;
  processing_status: string;
  sync_status: string;
  notes: string;
  phone_models?: string;
  created_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  synced_at: string | null;
  product_name: string;
  brand: string;
  category: string;
  session_code: string;
  operator_name: string;
  device_name: string;
  image_count: number;
  approved_image_count: number;
  colors: string;
  inventory_count: number;
  has_notes: number;
  thumbnail_image_id?: number | null;
  processed_image_count?: number;
  product_sold_out?: number;
  product_sold_out_at?: string;
}

export interface MobileProcessedImage {
  id: number;
  capture_id: number;
  source_image_id: number;
  product_id: number;
  local_path: string;
  filename: string;
  sha256: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  role: string;
  is_cover: number;
  status: 'uploaded' | 'approved' | 'pushed';
  notes: string;
  created_at: string;
  source_filename?: string;
}

export interface MobileCapture {
  id: number;
  session_id: number;
  product_id: number;
  prestashop_product_id: number;
  serial_number: string;
  reference: string;
  ean13: string;
  model: string;
  capture_status: string;
  review_status: string;
  processing_status: string;
  sync_status: string;
  notes: string;
  phone_models?: string;
  created_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  synced_at: string | null;
  images?: MobileCaptureImage[];
  inventory?: MobileInventoryItem[];
}

export interface MobileCaptureImage {
  id: number;
  capture_id: number;
  local_path: string;
  processed_path: string;
  filename: string;
  sha256: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  role: string;
  sequence: number;
  is_cover_candidate: number;
  status: string;
  rejection_reason: string;
  created_at: string;
  color_names?: string;
  fileExists?: boolean;
}

export interface MobileInventoryItem {
  id: number;
  capture_id: number;
  color_name: string;
  normalized_color: string;
  quantity: number | null;
  count_type: 'exact' | 'estimated' | 'sufficient' | 'unknown';
  notes: string;
  reviewed_quantity: number | null;
  review_status: 'pending' | 'approved' | 'rejected';
}

export interface ProductMatchCandidate {
  productId: number;
  reference: string;
  name: string;
  model: string;
  ean13: string;
  serialNumber: string;
  brand: string;
  category: string;
  prestashopId: string;
  price?: number | null;
  soldOut?: boolean;
  fixedColors?: string[];
  websiteActive?: boolean | null; // true=网站已启用, false=未启用/下架, null=未同步到网站
  website?: WebsiteProductInfo | null;
  matchMethod: string;
  matchedValue: string;
  confidence: number;
}

export interface WebsiteVariantInfo {
  id: number;
  colors: string[];
  quantity: number;
  reference: string;
  price: number;
}

export interface WebsiteProductInfo {
  imageCount: number;
  quantity: number;
  variants: WebsiteVariantInfo[];
}

export interface MatchResult {
  match: ProductMatchCandidate | null;
  candidates: ProductMatchCandidate[];
  message: string;
}

export interface CaptureStatusInfo {
  product: {
    id: number;
    reference: string;
    name: string;
    model: string;
    ean13: string;
    serialNumber: string;
    brand: string;
    category: string;
    prestashopProductId: number;
    quantity: number;
    imageCount: number;
    hasImages: boolean;
    lastCapture: { id: number; status: string; createdAt: string; submittedAt: string | null } | null;
  };
  activeCapture: {
    id: number;
    capture_status: string;
    created_at: string;
    image_count: number;
    colors: string;
  } | null;
}

export interface ReviewStats {
  todayCaptures: number;
  pendingReview: number;
  pendingRephotograph: number;
  pendingImages: number;
  pendingColors: number;
  pendingInventory: number;
  pendingDrafts: number;
  readyToSync: number;
  synced: number;
  approved: number;
}

export const CAPTURE_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  submitted: '待审核',
  reviewing: '审核中',
  approved: '审核通过',
  rejected: '退回补采',
  processing: '图片处理中',
  ready: '可同步',
  synced: '已同步',
  cancelled: '已取消',
};

export const IMAGE_STATUS_LABELS: Record<string, string> = {
  uploaded: '已上传',
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  processing: '处理中',
  processed: '已处理',
  ai_generating: 'AI 生成中',
  ai_ready: 'AI 图完成',
  pushed: '已推送',
  uploaded_ps: '已上传网站',
};

export const SYNC_STATUS_LABELS: Record<string, string> = {
  none: '未推送',
  pushed: '已推送',
  ready: '可同步',
  synced: '已同步',
};
