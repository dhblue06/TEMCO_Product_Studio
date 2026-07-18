import { normalizeReference, normalizePrestashopId } from './normalizer';
import { MatchResult } from './types';

interface LocalProductIndex {
  id: number;
  reference: string;
  prestashop_id: string;
}

export function buildLocalIndex(products: any[]): {
  byReference: Map<string, number>;
  byPrestashopId: Map<string, number>;
  products: LocalProductIndex[];
} {
  const byReference = new Map<string, number>();
  const byPrestashopId = new Map<string, number>();
  const indexed: LocalProductIndex[] = [];

  for (const p of products) {
    const ref = normalizeReference(p.reference);
    const item: LocalProductIndex = { id: p.id, reference: ref, prestashop_id: String(p.prestashop_id || '').trim() };
    indexed.push(item);

    if (ref) {
      if (!byReference.has(ref)) byReference.set(ref, p.id);
    }
    if (item.prestashop_id) {
      if (!byPrestashopId.has(item.prestashop_id)) byPrestashopId.set(item.prestashop_id, p.id);
    }
  }

  return { byReference, byPrestashopId, products: indexed };
}

export function matchSnapshot(
  snapshot: { normalized_reference: string; prestashop_id: string },
  localIndex: ReturnType<typeof buildLocalIndex>,
  snapshotId: number
): MatchResult {
  const ref = snapshot.normalized_reference;
  const psId = snapshot.prestashop_id;

  const refProductId = ref ? localIndex.byReference.get(ref) : undefined;
  const psProductId = psId ? localIndex.byPrestashopId.get(psId) : undefined;

  // 双字段一致
  if (refProductId !== undefined && psProductId !== undefined && refProductId === psProductId) {
    return {
      snapshotId,
      productId: refProductId,
      matchStatus: 'matched',
      matchMethod: 'reference_and_prestashop_id',
      confidence: 100,
      isOnWebsite: true,
    };
  }

  // 仅 Reference 匹配
  if (refProductId !== undefined && psProductId === undefined) {
    return {
      snapshotId,
      productId: refProductId,
      matchStatus: 'matched',
      matchMethod: 'reference',
      confidence: 100,
      isOnWebsite: true,
    };
  }

  // 仅 PS ID 匹配
  if (refProductId === undefined && psProductId !== undefined) {
    return {
      snapshotId,
      productId: psProductId,
      matchStatus: 'matched',
      matchMethod: 'prestashop_id',
      confidence: 95,
      isOnWebsite: true,
    };
  }

  // 冲突：Reference 和 PS ID 指向不同产品
  if (refProductId !== undefined && psProductId !== undefined && refProductId !== psProductId) {
    return {
      snapshotId,
      productId: null,
      matchStatus: 'conflict',
      matchMethod: null,
      confidence: 0,
      isOnWebsite: false,
      conflictDetails: JSON.stringify({
        referenceProductId: refProductId,
        prestashopIdProductId: psProductId,
        reason: 'reference_and_prestashop_id_point_to_different_products',
      }),
    };
  }

  // 无匹配
  return {
    snapshotId,
    productId: null,
    matchStatus: 'unmatched',
    matchMethod: null,
    confidence: 0,
    isOnWebsite: false,
  };
}
