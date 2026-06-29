export type PrestaShopSyncStatus =
  | 'not_synced'
  | 'pending'
  | 'synced'
  | 'failed'
  | 'partial_synced';

export interface PrestaShopConfig {
  baseUrl: string;
  apiKey: string;
  languageId: string;
  uploadMode: 'csv_only' | 'api';
}

export interface SyncResult {
  success: boolean;
  productId?: number;
  reference?: string;
  prestashopId?: number;
  status: PrestaShopSyncStatus;
  error?: string;
  details?: string;
}
