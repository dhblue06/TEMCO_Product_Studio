export interface ProductListRow {
  reference: string;
  label_name_es?: string;
  product_name_zh?: string;
  model?: string;
  brand?: string;
  source_price_text?: string;
  source_price_value?: number | null;
  remark?: string;
  raw_data?: string;
  source_row_no?: number;
}

export interface ProductListCheckResult {
  status: 'on_website' | 'not_on_website' | 'missing_in_local' | 'local_conflict' | 'website_conflict' | 'website_status_unknown' | 'invalid_reference';
  localProductId?: number | null;
  websiteSnapshotId?: number | null;
  matchMethod?: string;
  candidates?: any[];
  reference: string;
}

export const PRODUCT_LIST_FIELD_ALIASES: Record<string, string[]> = {
  reference: ['6位产品编号', '产品编号', '商品编号', 'reference', 'referencia', 'sku'],
  label_name_es: ['西班牙语标签名称', '西班牙语名称', 'nombre español', 'nombre'],
  product_name_zh: ['中文产品名称', '中文名称', '商品名称'],
  model: ['产品型号', '型号', 'model', 'modelo'],
  brand: ['品牌', 'brand', 'marca'],
  source_price: ['价格 (€)', '价格', 'price', 'precio'],
  remark: ['备注', 'remark', 'observaciones'],
};
