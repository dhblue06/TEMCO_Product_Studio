import { getDatabase } from '../../database/database';
import { normalizeModelKey } from './productImageNameParser';

export function runProductImageMatching(): { matched: number; unmatched: number; conflicts: number } {
  const db = getDatabase();

  db.prepare("DELETE FROM product_scan_mappings WHERE match_type != 'manual'").run();

  const images = db.prepare('SELECT * FROM product_scan_images WHERE ignored = 0').all() as any[];
  const products = db.prepare('SELECT id, reference, name, model, serial_number, prestashop_id FROM products WHERE prestashop_id IS NOT NULL AND prestashop_id != \'\'').all() as any[];

  let matched = 0, unmatched = 0, conflicts = 0;

  const insertMapping = db.prepare(`
    INSERT OR IGNORE INTO product_scan_mappings (product_id, scan_image_id, match_type, matched_value, confidence, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'suggested', datetime('now'), datetime('now'))
  `);

  const batch = db.transaction(() => {
    for (const img of images) {
      let found = false;

      // 1. 序列号匹配（serial_number + reference）
      if (img.extracted_serial) {
        for (const p of products) {
          if (p.serial_number === img.extracted_serial || p.reference === img.extracted_serial) {
            insertMapping.run(p.id, img.id, 'serial_exact', img.extracted_serial, 1.0);
            found = true; matched++; break;
          }
        }
        if (found) continue;
      }

      // 2. 型号匹配
      if (img.extracted_model) {
        const imgKey = normalizeModelKey(img.extracted_model);
        const candidates: any[] = [];
        for (const p of products) {
          if (!p.model) continue;
          if (normalizeModelKey(p.model) === imgKey) {
            candidates.push(p);
          }
        }
        if (candidates.length === 1) {
          insertMapping.run(candidates[0].id, img.id, 'model_exact', img.extracted_model, 0.98);
          matched++; continue;
        } else if (candidates.length > 1) {
          for (const c of candidates) {
            insertMapping.run(c.id, img.id, 'model_exact', img.extracted_model, 0.98);
          }
          conflicts++; continue;
        }

        // 3. Reference 匹配
        for (const p of products) {
          if (normalizeModelKey(p.reference || '') === imgKey) {
            insertMapping.run(p.id, img.id, 'reference_exact', p.reference, 1.0);
            found = true; matched++; break;
          }
        }
        if (found) continue;

        // 4. 型号出现在产品名中
        const nameMatches: any[] = [];
        for (const p of products) {
          if ((p.name || '').toUpperCase().includes(img.extracted_model.toUpperCase())) {
            nameMatches.push(p);
          }
        }
        if (nameMatches.length === 1) {
          insertMapping.run(nameMatches[0].id, img.id, 'name_contains', img.extracted_model, 0.95);
          matched++; continue;
        } else if (nameMatches.length > 1) {
          for (const nm of nameMatches) {
            insertMapping.run(nm.id, img.id, 'name_contains', img.extracted_model, 0.95);
          }
          conflicts++; continue;
        }
      }

      unmatched++;
    }
  });
  batch();

  return { matched, unmatched, conflicts };
}

export function confirmProductMapping(productId: number, scanImageId: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE product_scan_mappings SET status = 'confirmed', updated_at = datetime('now') WHERE product_id = ? AND scan_image_id = ?`).run(productId, scanImageId);
}

export function rejectProductMapping(productId: number, scanImageId: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE product_scan_mappings SET status = 'rejected', updated_at = datetime('now') WHERE product_id = ? AND scan_image_id = ?`).run(productId, scanImageId);
}

export function manualProductMap(productId: number, scanImageId: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE product_scan_mappings SET status = 'rejected', updated_at = datetime('now') WHERE scan_image_id = ? AND status = 'suggested' AND product_id != ?`).run(scanImageId, productId);
  db.prepare(`INSERT INTO product_scan_mappings (product_id, scan_image_id, match_type, confidence, status, created_at, updated_at) VALUES (?, ?, 'manual', 1.0, 'confirmed', datetime('now'), datetime('now')) ON CONFLICT(product_id, scan_image_id) DO UPDATE SET status = 'confirmed', match_type = 'manual', updated_at = datetime('now')`).run(productId, scanImageId);
}
