export interface PrestaShopExportRow {
  prestashop_id: string;
  image_url: string;
  website_name: string;
  reference: string;
  website_category: string;
  price_tax_excl: string;
  price_tax_incl: string;
  quantity: string;
}

export interface ImportBatch {
  id?: number;
  source_type: string;
  source_name?: string;
  import_mode: 'replace' | 'append' | 'preview';
  activation_assumption: 'active_only' | 'mixed_unknown' | 'snapshot_only';
  total_rows?: number;
  valid_rows?: number;
  matched_rows?: number;
  unmatched_rows?: number;
  conflict_rows?: number;
  invalid_rows?: number;
  status?: string;
  is_current?: number;
  updates_website_status?: number;
  delimiter?: string;
  encoding?: string;
  field_mapping?: string;
  import_options?: string;
  error_message?: string;
  created_at?: string;
  completed_at?: string;
}

export interface PreviewResult {
  file: { name: string; encoding: string; delimiter: string };
  headers: string[];
  statistics: {
    totalRows: number;
    validRows: number;
    uniqueProductIds: number;
    uniqueReferences: number;
    imageRows: number;
    categories: number;
  };
  estimatedMatch: {
    byReference: number;
    byPrestashopId: number;
    unmatched: number;
    conflicts: number;
  };
  sampleRows: any[];
}

export interface MatchResult {
  snapshotId: number;
  productId: number | null;
  matchStatus: 'matched' | 'unmatched' | 'conflict' | 'invalid';
  matchMethod: 'reference' | 'prestashop_id' | 'reference_and_prestashop_id' | null;
  confidence: number;
  isOnWebsite: boolean;
  conflictDetails?: string;
}
