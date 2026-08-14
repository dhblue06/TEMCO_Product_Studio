// Mobile Capture 模块类型定义（v1.4）

export type SessionStatus = 'active' | 'completed' | 'cancelled';
export type CaptureStatus = 'draft' | 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'processing' | 'ready' | 'synced' | 'cancelled';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type SyncStatus = 'none' | 'pushed' | 'ready' | 'synced';
export type ImageStatus = 'uploaded' | 'pending_review' | 'approved' | 'rejected' | 'processing' | 'processed' | 'ai_generating' | 'ai_ready' | 'pushed' | 'uploaded_ps';
export type CountType = 'exact' | 'estimated' | 'sufficient' | 'unknown';
export type ColorMappingStatus = 'pending' | 'mapped' | 'new' | 'ignored';

export type ImageRole =
  | 'front' | 'back' | 'side' | 'package'
  | 'all_colors' | 'single_color' | 'barcode' | 'detail' | 'damaged' | 'other';

export interface MobileCaptureSession {
  id: number;
  session_code: string;
  operator_name: string;
  device_name: string;
  area_code: string;
  status: SessionStatus;
  notes: string;
  created_at: string;
  completed_at: string | null;
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
  capture_status: CaptureStatus;
  review_status: ReviewStatus;
  processing_status: string;
  sync_status: SyncStatus;
  notes: string;
  created_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  synced_at: string | null;
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
  status: ImageStatus;
  rejection_reason: string;
  created_at: string;
}

export interface MobileCaptureImageColor {
  id: number;
  capture_image_id: number;
  color_name: string;
  normalized_color: string;
  prestashop_attribute_id: number;
  mapping_status: ColorMappingStatus;
  is_primary: number;
}

export interface MobileCaptureInventory {
  id: number;
  capture_id: number;
  color_name: string;
  normalized_color: string;
  quantity: number | null;
  count_type: CountType;
  notes: string;
  reviewed_quantity: number | null;
  review_status: ReviewStatus;
}

export interface AudioNote {
  id: number;
  capture_id: number;
  local_path: string;
  mime_type: string;
  duration_seconds: number;
  transcript: string;
  created_at: string;
}

export interface CreateSessionInput {
  operatorName: string;
  deviceName: string;
  areaCode?: string;
  notes?: string;
}

export interface CreateCaptureInput {
  sessionId: number;
  productId: number;
  prestashopProductId?: number;
  serialNumber?: string;
  reference?: string;
  ean13?: string;
  model?: string;
  colors?: string[];
}

export interface InventoryItemInput {
  colorName?: string;
  quantity?: number | null;
  countType: CountType;
  notes?: string;
}

export interface ColorInput {
  colorName: string;
  isPrimary?: boolean;
}

// 常用颜色选项（与文档 10.1 一致）
export const COMMON_COLORS = [
  'Negro', 'Blanco', 'Azul', 'Rojo', 'Rosa', 'Verde', 'Morado',
  'Naranja', 'Amarillo', 'Gris', 'Plata', 'Dorado', 'Transparente', 'Multicolor',
];

// 特殊颜色选项
export const SPECIAL_COLORS = [
  'Color aleatorio', 'Colores surtidos', 'Sin variante de color',
  'Color no identificado', 'Otro',
];

// 图片角色说明（与文档 9.2 一致）
export const IMAGE_ROLES: { role: ImageRole; label: string; colorLabel: string }[] = [
  { role: 'front', label: '正面', colorLabel: 'frontal' },
  { role: 'back', label: '背面', colorLabel: 'trasera' },
  { role: 'side', label: '侧面', colorLabel: 'lateral' },
  { role: 'package', label: '包装', colorLabel: 'packaging' },
  { role: 'all_colors', label: '所有颜色合照', colorLabel: 'colores' },
  { role: 'single_color', label: '单个颜色', colorLabel: 'color' },
  { role: 'barcode', label: '条码/标签', colorLabel: 'codigo' },
  { role: 'detail', label: '产品细节', colorLabel: 'detalle' },
  { role: 'damaged', label: '瑕疵/破损', colorLabel: 'defecto' },
  { role: 'other', label: '其他', colorLabel: 'otro' },
];

/** 颜色标准化（文档 10.5） */
export function normalizeColorName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
