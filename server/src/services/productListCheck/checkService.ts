import { getDatabase } from '../../database/database';
import { normalizeReference } from '../websiteCatalog/normalizer';
import { ProductListRow, ProductListCheckResult } from './types';

interface BuildIndexResult {
  localByRef: Map<string, { id: number; reference: string }>;
  websiteByRef: Map<string, { id: number; assumed_active: number }>;
  hasValidSnapshot: boolean;
  snapshotBatchId: number | null;
}

function buildIndexes(websiteBatchId?: number | null): BuildIndexResult {
  const db = getDatabase();
  const localByRef = new Map<string, { id: number; reference: string }>();
  const websiteByRef = new Map<string, { id: number; assumed_active: number }>();

  // 本地产品索引
  const localProducts = db.prepare('SELECT id, reference FROM products').all() as any[];
  for (const p of localProducts) {
    const ref = normalizeReference(p.reference);
    if (ref && !localByRef.has(ref)) {
      localByRef.set(ref, { id: p.id, reference: p.reference });
    }
  }

  // 网站快照索引
  let hasValidSnapshot = false;
  let snapshotBatchId: number | null = null;

  if (websiteBatchId) {
    const snapshots = db.prepare(
      'SELECT id, normalized_reference, assumed_active FROM prestashop_product_snapshots WHERE batch_id = ?'
    ).all(websiteBatchId) as any[];
    for (const s of snapshots) {
      if (s.normalized_reference && !websiteByRef.has(s.normalized_reference)) {
        websiteByRef.set(s.normalized_reference, { id: s.id, assumed_active: s.assumed_active });
      }
    }
    hasValidSnapshot = snapshots.length > 0;
    snapshotBatchId = websiteBatchId;
  } else {
    // 找当前活动的批次
    const currentBatch = db.prepare(
      "SELECT id FROM prestashop_import_batches WHERE is_current = 1 AND status = 'completed' ORDER BY id DESC LIMIT 1"
    ).get() as any;
    if (currentBatch) {
      const snapshots = db.prepare(
        'SELECT id, normalized_reference, assumed_active FROM prestashop_product_snapshots WHERE batch_id = ?'
      ).all(currentBatch.id) as any[];
      for (const s of snapshots) {
        if (s.normalized_reference && !websiteByRef.has(s.normalized_reference)) {
          websiteByRef.set(s.normalized_reference, { id: s.id, assumed_active: s.assumed_active });
        }
      }
      hasValidSnapshot = snapshots.length > 0;
      snapshotBatchId = currentBatch.id;
    }
  }

  return { localByRef, websiteByRef, hasValidSnapshot, snapshotBatchId };
}

export function checkSingleItem(
  item: ProductListRow,
  localByRef: Map<string, { id: number; reference: string }>,
  websiteByRef: Map<string, { id: number; assumed_active: number }>,
  hasValidSnapshot: boolean
): ProductListCheckResult {
  const reference = normalizeReference(item.reference);

  if (!reference) {
    return { status: 'invalid_reference', reference: item.reference };
  }

  const localMatch = localByRef.get(reference);

  if (!localMatch) {
    return { status: 'missing_in_local', reference };
  }

  if (!hasValidSnapshot) {
    return { status: 'website_status_unknown', localProductId: localMatch.id, reference };
  }

  const websiteMatch = websiteByRef.get(reference);

  if (!websiteMatch) {
    return { status: 'not_on_website', localProductId: localMatch.id, reference };
  }

  return {
    status: 'on_website',
    localProductId: localMatch.id,
    websiteSnapshotId: websiteMatch.id,
    matchMethod: 'reference',
    reference,
  };
}

export function runCheck(
  rows: ProductListRow[],
  websiteBatchId?: number | null
): {
  results: ProductListCheckResult[];
  indexes: BuildIndexResult;
  stats: { total: number; onWebsite: number; notOnWebsite: number; missingInLocal: number; conflicts: number; invalid: number };
} {
  const indexes = buildIndexes(websiteBatchId);
  const results: ProductListCheckResult[] = [];
  let onWebsite = 0, notOnWebsite = 0, missingInLocal = 0, conflicts = 0, invalid = 0;

  for (const row of rows) {
    const result = checkSingleItem(row, indexes.localByRef, indexes.websiteByRef, indexes.hasValidSnapshot);
    results.push(result);
    switch (result.status) {
      case 'on_website': onWebsite++; break;
      case 'not_on_website': notOnWebsite++; break;
      case 'missing_in_local': missingInLocal++; break;
      case 'local_conflict': case 'website_conflict': conflicts++; break;
      case 'invalid_reference': invalid++; break;
    }
  }

  return {
    results,
    indexes,
    stats: { total: rows.length, onWebsite, notOnWebsite, missingInLocal, conflicts, invalid },
  };
}

export { normalizeReference };
