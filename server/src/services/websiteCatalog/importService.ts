import { getDatabase } from '../../database/database';
import { parseCSV, detectDelimiter, buildFieldMap } from './csvParser';
import { normalizeReference, normalizePrestashopId, parseSpanishPrice, parseQuantity } from './normalizer';
import { buildLocalIndex, matchSnapshot } from './matcher';
import { PreviewResult, ImportBatch, MatchResult } from './types';

export function previewImport(csvText: string, sourceName: string): PreviewResult {
  const delimiter = detectDelimiter(csvText.split('\n')[0]);
  const rows = parseCSV(csvText, delimiter);
  if (rows.length < 2) throw new Error('CSV 数据不足（至少需要表头 + 1 行数据）');

  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);

  const fieldMap = buildFieldMap(headers);
  const refIdx = fieldMap.reference;
  const psIdIdx = fieldMap.prestashop_id;
  const imgIdx = fieldMap.image_url;

  const refs = new Set<string>();
  const psIds = new Set<string>();
  let imgCount = 0;
  const cats = new Set<string>();

  for (const row of dataRows) {
    if (refIdx !== undefined) refs.add(normalizeReference(row[refIdx]));
    if (psIdIdx !== undefined) psIds.add(normalizePrestashopId(row[psIdIdx]));
    if (imgIdx !== undefined && row[imgIdx]?.trim()) imgCount++;
    const catIdx = fieldMap.website_category;
    if (catIdx !== undefined && row[catIdx]?.trim()) cats.add(row[catIdx].trim());
  }

  // 预计匹配统计
  const db = getDatabase();
  const localProducts = db.prepare('SELECT id, reference, prestashop_id FROM products').all() as any[];
  const localIndex = buildLocalIndex(localProducts);

  let byRef = 0, byPsId = 0, unmatched = 0, conflicts = 0;
  for (const row of dataRows) {
    const ref = refIdx !== undefined ? normalizeReference(row[refIdx]) : '';
    const psId = psIdIdx !== undefined ? normalizePrestashopId(row[psIdIdx]) : '';
    const result = matchSnapshot({ normalized_reference: ref, prestashop_id: psId }, localIndex, 0);
    if (result.matchStatus === 'matched') {
      if (result.matchMethod === 'reference') byRef++;
      else byPsId++;
    } else if (result.matchStatus === 'conflict') conflicts++;
    else unmatched++;
  }

  return {
    file: { name: sourceName, encoding: 'utf-8', delimiter },
    headers,
    statistics: {
      totalRows: dataRows.length,
      validRows: dataRows.length,
      uniqueProductIds: psIds.size,
      uniqueReferences: refs.size,
      imageRows: imgCount,
      categories: cats.size,
    },
    estimatedMatch: { byReference: byRef, byPrestashopId: byPsId, unmatched, conflicts },
    sampleRows: dataRows.slice(0, 5),
  };
}

export function commitImport(
  csvText: string,
  sourceName: string,
  options: {
    importMode: 'replace' | 'append' | 'preview';
    activationAssumption: 'active_only' | 'mixed_unknown' | 'snapshot_only';
    updateWebsiteStatus: boolean;
  }
): { batchId: number; stats: { total: number; matched: number; unmatched: number; conflicts: number } } {
  const db = getDatabase();

  const delimiter = detectDelimiter(csvText.split('\n')[0]);
  const rows = parseCSV(csvText, delimiter);
  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);
  const fieldMap = buildFieldMap(headers);

  const refIdx = fieldMap.reference;
  const psIdIdx = fieldMap.prestashop_id;
  const nameIdx = fieldMap.website_name;
  const imgIdx = fieldMap.image_url;
  const catIdx = fieldMap.website_category;
  const priceExclIdx = fieldMap.price_tax_excl;
  const priceInclIdx = fieldMap.price_tax_incl;
  const qtyIdx = fieldMap.quantity;

  if (refIdx === undefined) throw new Error('缺少必填字段: Referencia');
  if (psIdIdx === undefined) throw new Error('缺少必填字段: Product ID');

  const assumedActive = options.activationAssumption === 'active_only' ? 1 : 0;

  const batch = db.transaction(() => {
    // 创建批次
    const batchResult = db.prepare(`
      INSERT INTO prestashop_import_batches
        (source_type, source_name, import_mode, activation_assumption, total_rows, valid_rows,
         delimiter, encoding, field_mapping, updates_website_status, status, is_current)
      VALUES ('csv', ?, ?, ?, ?, ?, ?, 'utf-8', ?, ?, 'processing', 0)
    `).run(sourceName, options.importMode, options.activationAssumption,
      dataRows.length, dataRows.length, delimiter,
      JSON.stringify(fieldMap), options.updateWebsiteStatus ? 1 : 0);

    const batchId = batchResult.lastInsertRowid as number;

    // 保存快照
    const insertSnapshot = db.prepare(`
      INSERT INTO prestashop_product_snapshots
        (batch_id, prestashop_id, image_url, website_name, reference, normalized_reference,
         website_category, price_tax_excl, price_tax_excl_value, price_tax_incl, price_tax_incl_value,
         quantity_text, quantity_value, assumed_active, raw_data, row_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const ref = row[refIdx] || '';
      const psId = row[psIdIdx] || '';
      const priceExcl = priceExclIdx !== undefined ? row[priceExclIdx] || '' : '';
      const priceIncl = priceInclIdx !== undefined ? row[priceInclIdx] || '' : '';
      const qty = qtyIdx !== undefined ? row[qtyIdx] || '' : '';

      insertSnapshot.run(
        batchId, psId,
        imgIdx !== undefined ? row[imgIdx] || '' : '',
        nameIdx !== undefined ? row[nameIdx] || '' : '',
        ref, normalizeReference(ref),
        catIdx !== undefined ? row[catIdx] || '' : '',
        priceExcl, parseSpanishPrice(priceExcl) || null,
        priceIncl, parseSpanishPrice(priceIncl) || null,
        qty, parseQuantity(qty) || null,
        assumedActive, JSON.stringify(row), i + 1
      );
    }

    // 匹配
    const snapshots = db.prepare(
      'SELECT id, normalized_reference, prestashop_id FROM prestashop_product_snapshots WHERE batch_id = ?'
    ).all(batchId) as any[];

    const localProducts = db.prepare('SELECT id, reference, prestashop_id FROM products').all() as any[];
    const localIndex = buildLocalIndex(localProducts);

    const insertMatch = db.prepare(`
      INSERT INTO product_website_matches
        (batch_id, snapshot_id, product_id, match_status, match_method, confidence, is_on_website,
         local_reference, website_reference, conflict_details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let matched = 0, unmatched = 0, conflicts = 0;

    for (const snap of snapshots) {
      const result = matchSnapshot(
        { normalized_reference: snap.normalized_reference, prestashop_id: snap.prestashop_id },
        localIndex, snap.id
      );

      const localRef = result.productId
        ? (localIndex.products.find(p => p.id === result.productId)?.reference || '')
        : '';

      insertMatch.run(
        batchId, snap.id, result.productId, result.matchStatus, result.matchMethod,
        result.confidence, result.isOnWebsite ? 1 : 0,
        localRef, snap.normalized_reference, result.conflictDetails || null
      );

      if (result.matchStatus === 'matched') matched++;
      else if (result.matchStatus === 'conflict') conflicts++;
      else unmatched++;
    }

    // 更新批次统计
    db.prepare(`
      UPDATE prestashop_import_batches SET
        matched_rows = ?, unmatched_rows = ?, conflict_rows = ?,
        valid_rows = ?, status = 'completed', is_current = 1, completed_at = datetime('now')
      WHERE id = ?
    `).run(matched, unmatched, conflicts, dataRows.length, batchId);

    // 如果 replace 模式，旧批次取消 current
    if (options.importMode === 'replace') {
      db.prepare('UPDATE prestashop_import_batches SET is_current = 0 WHERE id != ? AND is_current = 1').run(batchId);
    }

    return { batchId, stats: { total: dataRows.length, matched, unmatched, conflicts } };
  });

  return batch();
}

export { buildLocalIndex, matchSnapshot } from './matcher';
export { normalizeReference, normalizeBarcode } from './normalizer';
