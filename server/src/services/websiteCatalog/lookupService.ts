import { getDatabase } from '../../database/database';
import { normalizeReference, normalizeBarcode } from './normalizer';

interface LookupInput {
  input: string;
  matchFields?: string[];
  deduplicateProducts?: boolean;
}

interface LookupResult {
  total: number;
  matched: number;
  missing: number;
  duplicates: number;
  products: any[];
  missingInputs: string[];
}

export function lookupProducts(options: LookupInput): LookupResult {
  const db = getDatabase();
  const lines = options.input
    .split(/[\n,;\t]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const matchFields = options.matchFields || ['reference', 'ean13', 'upc'];
  const deduplicate = options.deduplicateProducts !== false;

  const matchedProducts: any[] = [];
  const missingInputs: string[] = [];
  const seenProductIds = new Set<number>();
  let duplicates = 0;

  for (const raw of lines) {
    const normalizedRef = normalizeReference(raw);
    const normalizedBarcode = normalizeBarcode(raw);

    const conditions: string[] = [];
    const params: any[] = [];

    if (matchFields.includes('reference') && normalizedRef) {
      conditions.push('LOWER(TRIM(reference)) = LOWER(?)');
      params.push(normalizedRef);
    }
    if (matchFields.includes('ean13') && normalizedBarcode) {
      conditions.push('TRIM(ean13) = ?');
      params.push(normalizedBarcode);
    }
    if (matchFields.includes('upc') && normalizedBarcode) {
      conditions.push('TRIM(upc) = ?');
      params.push(normalizedBarcode);
    }
    if (matchFields.includes('mpn') && normalizedRef) {
      conditions.push('LOWER(TRIM(mpn)) = LOWER(?)');
      params.push(normalizedRef);
    }
    if (matchFields.includes('prestashop_id') && normalizedBarcode) {
      conditions.push('TRIM(prestashop_id) = ?');
      params.push(normalizedBarcode);
    }

    if (conditions.length === 0) {
      missingInputs.push(raw);
      continue;
    }

    const sql = `SELECT * FROM products WHERE (${conditions.join(' OR ')}) LIMIT 10`;
    const results = db.prepare(sql).all(...params) as any[];

    if (results.length === 0) {
      missingInputs.push(raw);
    } else {
      for (const product of results) {
        if (deduplicate && seenProductIds.has(product.id)) {
          duplicates++;
          continue;
        }
        seenProductIds.add(product.id);
        matchedProducts.push(product);
      }
    }
  }

  return {
    total: lines.length,
    matched: matchedProducts.length,
    missing: missingInputs.length,
    duplicates,
    products: matchedProducts,
    missingInputs,
  };
}
