import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/database';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { normalizeReference } from '../services/productListCheck/checkService';
import { runCheck } from '../services/productListCheck/checkService';
import { ProductListRow, PRODUCT_LIST_FIELD_ALIASES } from '../services/productListCheck/types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function buildFieldMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalizedHeaders = headers.map(h => h.trim().replace(/\s+/g, ' '));
  for (const [field, aliases] of Object.entries(PRODUCT_LIST_FIELD_ALIASES)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (aliases.some(alias => normalizedHeaders[i].toLowerCase() === alias.toLowerCase())) {
        map[field] = i;
        break;
      }
    }
  }
  return map;
}

// POST /api/product-list-import/preview - 预览 Excel
router.post('/preview', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: '请选择文件' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = (req.body.sheetName as string) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return res.status(400).json({ success: false, error: `找不到工作表: ${sheetName}` });

    const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
    if (jsonData.length < 2) return res.status(400).json({ success: false, error: '数据不足' });

    const headers = Object.keys(jsonData[0]);
    const dataRows = jsonData.slice(1);

    const fieldMap = buildFieldMap(headers);
    const refIdx = fieldMap.reference;
    const refs = new Set<string>();
    let emptyRefs = 0;

    const rows: ProductListRow[] = dataRows.map((row: any, i: number) => {
      const ref = refIdx !== undefined ? String(row[headers[refIdx]] || '').trim() : '';
      const priceText = fieldMap.source_price !== undefined ? String(row[headers[fieldMap.source_price]] || '') : '';
      const priceVal = parseFloat(priceText.replace('€', '').replace(',', '.').trim()) || null;
      if (ref) refs.add(normalizeReference(ref));
      else emptyRefs++;
      return {
        reference: ref,
        label_name_es: fieldMap.label_name_es !== undefined ? String(row[headers[fieldMap.label_name_es]] || '') : '',
        product_name_zh: fieldMap.product_name_zh !== undefined ? String(row[headers[fieldMap.product_name_zh]] || '') : '',
        model: fieldMap.model !== undefined ? String(row[headers[fieldMap.model]] || '') : '',
        brand: fieldMap.brand !== undefined ? String(row[headers[fieldMap.brand]] || '') : '',
        source_price_text: priceText,
        source_price_value: priceVal,
        remark: fieldMap.remark !== undefined ? String(row[headers[fieldMap.remark]] || '') : '',
        source_row_no: i + 1,
      };
    });

    // 估算检查结果
    const { stats } = runCheck(rows, undefined);

    // 网站快照信息
    const db = getDatabase();
    const currentBatch = db.prepare(
      "SELECT id, total_rows FROM prestashop_import_batches WHERE is_current = 1 AND status = 'completed' ORDER BY id DESC LIMIT 1"
    ).get() as any;

    const suggestedMapping: Record<string, string> = {};
    for (const [field, idx] of Object.entries(fieldMap)) {
      if (idx !== undefined) suggestedMapping[field] = headers[idx];
    }

    res.json({
      success: true,
      data: {
        file: { name: req.file.originalname, sheetName },
        headers,
        suggestedMapping,
        statistics: { totalRows: rows.length, validReferences: refs.size, emptyReferences: emptyRefs },
        websiteSnapshot: {
          available: !!currentBatch,
          batchId: currentBatch?.id || null,
          productCount: currentBatch?.total_rows || 0,
        },
        estimatedResult: stats,
        sampleRows: rows.slice(0, 5),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/product-list-import/commit-file - 上传文件执行检查（前端版）
router.post('/commit-file', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: '请选择文件' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return res.status(400).json({ success: false, error: '找不到工作表' });

    const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
    if (jsonData.length < 2) return res.status(400).json({ success: false, error: '数据不足' });

    const headers = Object.keys(jsonData[0]);
    const dataRows = jsonData.slice(1);
    const fieldMap = buildFieldMap(headers);
    const refIdx = fieldMap.reference;

    const rows: ProductListRow[] = dataRows.map((row: any, i: number) => {
      const priceText = fieldMap.source_price !== undefined ? String(row[headers[fieldMap.source_price]] || '') : '';
      return {
        reference: refIdx !== undefined ? String(row[headers[refIdx]] || '').trim() : '',
        label_name_es: fieldMap.label_name_es !== undefined ? String(row[headers[fieldMap.label_name_es]] || '') : '',
        product_name_zh: fieldMap.product_name_zh !== undefined ? String(row[headers[fieldMap.product_name_zh]] || '') : '',
        model: fieldMap.model !== undefined ? String(row[headers[fieldMap.model]] || '') : '',
        brand: fieldMap.brand !== undefined ? String(row[headers[fieldMap.brand]] || '') : '',
        source_price_text: priceText,
        source_price_value: parseFloat(priceText.replace('€', '').replace(',', '.').trim()) || null,
        remark: fieldMap.remark !== undefined ? String(row[headers[fieldMap.remark]] || '') : '',
        source_row_no: i + 1,
      };
    });

    const db = getDatabase();
    const currentBatch = db.prepare(
      "SELECT id FROM prestashop_import_batches WHERE is_current = 1 AND status = 'completed' ORDER BY id DESC LIMIT 1"
    ).get() as any;

    const transaction = db.transaction(() => {
      const batchResult = db.prepare(`
        INSERT INTO product_list_import_batches
          (source_type, source_name, total_rows, valid_rows, field_mapping, website_batch_id, status)
        VALUES ('xlsx', ?, ?, ?, ?, ?, 'processing')
      `).run(req.file!.originalname, rows.length, rows.length,
        JSON.stringify(fieldMap), currentBatch?.id || null);

      const batchId = batchResult.lastInsertRowid as number;
      const { results, stats } = runCheck(rows, currentBatch?.id || undefined);

      const insertItem = db.prepare(`
        INSERT INTO product_list_import_items
          (batch_id, source_row_no, reference, normalized_reference,
           label_name_es, product_name_zh, model, brand,
           source_price_text, source_price_value, remark,
           local_product_id, website_snapshot_id, check_status, match_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cr = results[i];
        insertItem.run(batchId, row.source_row_no, row.reference, normalizeReference(row.reference),
          row.label_name_es, row.product_name_zh, row.model, row.brand,
          row.source_price_text, row.source_price_value, row.remark,
          cr.localProductId || null, cr.websiteSnapshotId || null, cr.status, cr.matchMethod || null);
      }

      db.prepare(`
        UPDATE product_list_import_batches SET
          on_website_rows = ?, not_on_website_rows = ?, missing_local_rows = ?,
          conflict_rows = ?, invalid_rows = ?,
          status = 'completed', completed_at = datetime('now')
        WHERE id = ?
      `).run(stats.onWebsite, stats.notOnWebsite, stats.missingInLocal,
        stats.conflicts, stats.invalid, batchId);

      return { batchId, stats };
    });

    const result = transaction();
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/product-list-import/commit - 执行检查并保存结果
router.post('/commit', (req: Request, res: Response) => {
  try {
    const { rows, websiteBatchId, fieldMapping } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: '缺少产品数据' });
    }

    const db = getDatabase();
    const parsedRows: ProductListRow[] = rows.map((r: any) => ({
      reference: r.reference || '',
      label_name_es: r.label_name_es || '',
      product_name_zh: r.product_name_zh || '',
      model: r.model || '',
      brand: r.brand || '',
      source_price_text: r.source_price_text || '',
      source_price_value: r.source_price_value || null,
      remark: r.remark || '',
      source_row_no: r.source_row_no || 0,
    }));

    const result = db.transaction(() => {
      const batchResult = db.prepare(`
        INSERT INTO product_list_import_batches
          (source_type, source_name, total_rows, valid_rows, field_mapping, website_batch_id, status)
        VALUES ('xlsx', ?, ?, ?, ?, ?, 'processing')
      `).run('product_list.xlsx', parsedRows.length, parsedRows.length,
        JSON.stringify(fieldMapping || {}), websiteBatchId || null);

      const batchId = batchResult.lastInsertRowid as number;

      const { results, stats } = runCheck(parsedRows, websiteBatchId || undefined);

      const insertItem = db.prepare(`
        INSERT INTO product_list_import_items
          (batch_id, source_row_no, reference, normalized_reference,
           label_name_es, product_name_zh, model, brand,
           source_price_text, source_price_value, remark,
           local_product_id, website_snapshot_id, check_status, match_method, conflict_details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        const cr = results[i];
        insertItem.run(
          batchId, row.source_row_no, row.reference, normalizeReference(row.reference),
          row.label_name_es, row.product_name_zh, row.model, row.brand,
          row.source_price_text, row.source_price_value, row.remark,
          cr.localProductId || null, cr.websiteSnapshotId || null,
          cr.status, cr.matchMethod || null, null
        );
      }

      db.prepare(`
        UPDATE product_list_import_batches SET
          on_website_rows = ?, not_on_website_rows = ?, missing_local_rows = ?,
          conflict_rows = ?, invalid_rows = ?,
          status = 'completed', completed_at = datetime('now')
        WHERE id = ?
      `).run(stats.onWebsite, stats.notOnWebsite, stats.missingInLocal,
        stats.conflicts, stats.invalid, batchId);

      return { batchId, stats };
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/product-list-import/batches/:batchId/items - 获取检查结果
router.get('/batches/:batchId/items', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { batchId } = req.params;
    const { status, search, page = '1', pageSize = '50', sortBy = 'source_row_no', sortOrder = 'ASC' } = req.query;

    let where = 'WHERE plii.batch_id = ?';
    const params: any[] = [batchId];

    if (status && status !== 'all') {
      where += ' AND plii.check_status = ?';
      params.push(status);
    }
    if (search) {
      where += " AND (plii.reference LIKE ? OR plii.label_name_es LIKE ? OR plii.product_name_zh LIKE ?)";
      const p = `%${search}%`;
      params.push(p, p, p);
    }

    const limit = Math.min(200, Math.max(1, parseInt(pageSize as string, 10) || 50));
    const offset = (Math.max(1, parseInt(page as string, 10) || 1) - 1) * limit;
    const allowedSort = ['source_row_no', 'reference', 'check_status'];
    const sortCol = allowedSort.includes(sortBy as string) ? sortBy : 'source_row_no';
    const sortDir = (sortOrder as string).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const total = (db.prepare(`SELECT COUNT(*) as count FROM product_list_import_items plii ${where}`).get(...params) as any).count;

    const items = db.prepare(`
      SELECT plii.*, pr.name as local_name, pps.website_name, pps.image_url, pps.prestashop_id
      FROM product_list_import_items plii
      LEFT JOIN products pr ON plii.local_product_id = pr.id
      LEFT JOIN prestashop_product_snapshots pps ON plii.website_snapshot_id = pps.id
      ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      success: true,
      data: { items, pagination: { total, page: Number(page), pageSize: limit, totalPages: Math.ceil(total / limit) } },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/product-list-import/history - 导入历史
router.get('/history', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const batches = db.prepare(`
      SELECT plib.*, pib.total_rows as website_total
      FROM product_list_import_batches plib
      LEFT JOIN prestashop_import_batches pib ON plib.website_batch_id = pib.id
      ORDER BY plib.created_at DESC LIMIT 20
    `).all();
    res.json({ success: true, data: batches });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/product-list-import/batches/:batchId/export - 导出结果
router.get('/batches/:batchId/export', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { batchId } = req.params;
    const { status, format = 'csv' } = req.query;

    let where = 'WHERE plii.batch_id = ?';
    const params: any[] = [batchId];
    if (status && status !== 'all') {
      where += ' AND plii.check_status = ?';
      params.push(status);
    }

    const items = db.prepare(`
      SELECT plii.*, pr.name as local_name, pps.website_name, pps.image_url,
        pps.prestashop_id, pps.website_category, pps.quantity_value, pps.price_tax_excl_value
      FROM product_list_import_items plii
      LEFT JOIN products pr ON plii.local_product_id = pr.id
      LEFT JOIN prestashop_product_snapshots pps ON plii.website_snapshot_id = pps.id
      ${where} ORDER BY plii.source_row_no ASC
    `).all(...params) as any[];

    const headers = ['序号', '产品编号', '检查状态', '西班牙语名称', '中文名称', '型号', '品牌', '价格',
      '本地产品存在', '网站Product ID', '网站名称', '网站分类', '网站库存', '网站价格'];

    const csvLines = [headers.join(';')];
    for (const item of items) {
      csvLines.push([
        item.source_row_no || '', item.reference || '',
        item.check_status || '', item.label_name_es || '',
        item.product_name_zh || '', item.model || '', item.brand || '',
        item.source_price_text || '',
        item.local_product_id ? '是' : '否',
        item.prestashop_id || '', item.website_name || '',
        item.website_category || '', item.quantity_value ?? '',
        item.price_tax_excl_value ?? '',
      ].join(';'));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="product_list_check_${batchId}.csv"`);
    res.send('\uFEFF' + csvLines.join('\n'));
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/product-list-import/batches/:batchId/recheck - 重新检查
router.post('/batches/:batchId/recheck', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { batchId } = req.params;
    const { websiteBatchId } = req.body;

    const batch = db.prepare('SELECT * FROM product_list_import_batches WHERE id = ?').get(batchId) as any;
    if (!batch) return res.status(404).json({ success: false, error: '批次不存在' });

    const items = db.prepare('SELECT * FROM product_list_import_items WHERE batch_id = ? ORDER BY source_row_no ASC').all(batchId) as any[];
    const rows: ProductListRow[] = items.map((i: any) => ({
      reference: i.reference || '',
      label_name_es: i.label_name_es || '',
      product_name_zh: i.product_name_zh || '',
      model: i.model || '', brand: i.brand || '',
      source_price_text: i.source_price_text || '',
      source_price_value: i.source_price_value || null,
      remark: i.remark || '',
      source_row_no: i.source_row_no || 0,
    }));

    // 创建新批次
    const result = db.transaction(() => {
      const newBatchResult = db.prepare(`
        INSERT INTO product_list_import_batches
          (source_type, source_name, total_rows, valid_rows, field_mapping, website_batch_id, status)
        VALUES ('xlsx', ?, ?, ?, ?, ?, 'processing')
      `).run(batch.source_name || 'recheck', rows.length, rows.length, batch.field_mapping || '',
        websiteBatchId || batch.website_batch_id);

      const newBatchId = newBatchResult.lastInsertRowid as number;
      const { results, stats } = runCheck(rows, websiteBatchId || batch.website_batch_id || undefined);

      const insertItem = db.prepare(`
        INSERT INTO product_list_import_items
          (batch_id, source_row_no, reference, normalized_reference,
           label_name_es, product_name_zh, model, brand,
           source_price_text, source_price_value, remark,
           local_product_id, website_snapshot_id, check_status, match_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cr = results[i];
        insertItem.run(newBatchId, row.source_row_no, row.reference, normalizeReference(row.reference),
          row.label_name_es, row.product_name_zh, row.model, row.brand,
          row.source_price_text, row.source_price_value, row.remark,
          cr.localProductId || null, cr.websiteSnapshotId || null, cr.status, cr.matchMethod || null);
      }

      db.prepare(`
        UPDATE product_list_import_batches SET
          on_website_rows = ?, not_on_website_rows = ?, missing_local_rows = ?,
          conflict_rows = ?, invalid_rows = ?,
          status = 'completed', completed_at = datetime('now')
        WHERE id = ?
      `).run(stats.onWebsite, stats.notOnWebsite, stats.missingInLocal,
        stats.conflicts, stats.invalid, newBatchId);

      return { batchId: newBatchId, stats };
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/product-list-import/find-images - 根据产品型号在文件夹中查找图片
router.post('/find-images', (req: Request, res: Response) => {
  try {
    const { refs, sourceFolder } = req.body;
    if (!refs || !Array.isArray(refs) || refs.length === 0) {
      return res.status(400).json({ success: false, error: '缺少产品编号' });
    }
    if (!sourceFolder) {
      return res.status(400).json({ success: false, error: '请指定源文件夹' });
    }

    const fs = require('fs');
    const path = require('path');
    const folder = String(sourceFolder).trim();

    if (!fs.existsSync(folder)) {
      return res.status(400).json({ success: false, error: '文件夹不存在: ' + folder });
    }

    // 递归搜索所有子文件夹中的图片文件
    function getAllImageFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...getAllImageFiles(fullPath));
        } else if (entry.isFile() && /\.(jpg|jpeg|png|webp|gif)$/i.test(entry.name)) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const allFiles = getAllImageFiles(folder);
    // 只保留文件名用于匹配
    const fileNames = allFiles.map(f => ({ fullPath: f, name: path.basename(f) }));

    const results: any[] = [];
    const db = getDatabase();

    for (const ref of refs) {
      // 先从 product_list_import_items 查找导入时的型号数据
      const importItem = db.prepare(`
        SELECT model, reference, product_name_zh, label_name_es
        FROM product_list_import_items
        WHERE reference = ? AND model IS NOT NULL AND model != ''
        ORDER BY id DESC LIMIT 1
      `).get(ref) as any;

      // 再尝试从 products 表查找型号
      const product = db.prepare('SELECT model, reference, name FROM products WHERE reference = ?').get(ref) as any;

      // 优先使用导入清单中的型号，其次使用产品表的型号
      let model = importItem?.model || product?.model || '';
      let displayName = importItem?.product_name_zh || importItem?.label_name_es || product?.name || ref;

      if (!model) {
        results.push({ ref, model: '', found: false, files: [], displayName, error: '本地产品无型号信息，请先在Excel中填写型号' });
        continue;
      }

      // 在文件夹中查找文件名包含型号的图片
      const modelKeywords = model.split(/[\s,\/\\]+/).filter((k: string) => k.length > 1);
      const matchedFiles = fileNames.filter((f: { fullPath: string; name: string }) => {
        const nameWithoutExt = f.name.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '').toLowerCase();
        if (nameWithoutExt.includes(model.toLowerCase())) return true;
        for (const kw of modelKeywords) {
          if (nameWithoutExt.includes(kw.toLowerCase())) return true;
        }
        return false;
      });

      results.push({
        ref,
        model,
        found: matchedFiles.length > 0,
        files: matchedFiles.map((f) => ({
          name: f.name,
          path: f.fullPath,
          url: `/api/upload/file/product/${encodeURIComponent(ref)}/${encodeURIComponent(f.name)}`,
        })),
      });
    }

    const foundCount = results.filter(r => r.found).length;
    res.json({
      success: true,
      data: { results, total: results.length, found: foundCount, sourceFolder: folder },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/product-list-import/copy-images - 复制查找到的图片到目标文件夹
router.post('/copy-images', (req: Request, res: Response) => {
  try {
    const { files, targetFolder } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: '缺少文件列表' });
    }
    if (!targetFolder) {
      return res.status(400).json({ success: false, error: '请指定目标文件夹' });
    }

    const fs = require('fs');
    const path = require('path');
    const target = String(targetFolder).trim();

    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    let copied = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        const sourcePath = file.path || file.sourcePath;
        if (!sourcePath || !fs.existsSync(sourcePath)) {
          errors.push(`${file.name || 'unknown'}: 源文件不存在`);
          continue;
        }
        const destPath = path.join(target, path.basename(sourcePath));
        if (fs.existsSync(destPath)) {
          errors.push(`${path.basename(sourcePath)}: 目标已存在，已跳过`);
          continue;
        }
        fs.copyFileSync(sourcePath, destPath);
        copied++;
      } catch (e: any) {
        errors.push(`${file.name || 'unknown'}: ${e.message}`);
      }
    }

    res.json({
      success: true,
      data: { copied, errors, total: files.length, targetFolder: target },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/product-list-import/folder-settings - 保存文件夹路径设置
router.post('/folder-settings', (req: Request, res: Response) => {
  try {
    const { sourceFolder, targetFolder } = req.body;
    const db = getDatabase();
    if (sourceFolder !== undefined) {
      db.prepare("INSERT OR REPLACE INTO api_settings (key, value) VALUES ('image_finder_source_folder', ?)").run(String(sourceFolder));
    }
    if (targetFolder !== undefined) {
      db.prepare("INSERT OR REPLACE INTO api_settings (key, value) VALUES ('image_finder_target_folder', ?)").run(String(targetFolder));
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/product-list-import/folder-settings - 获取保存的文件夹路径
router.get('/folder-settings', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const source = db.prepare("SELECT value FROM api_settings WHERE key = 'image_finder_source_folder'").get() as any;
    const target = db.prepare("SELECT value FROM api_settings WHERE key = 'image_finder_target_folder'").get() as any;
    res.json({
      success: true,
      data: {
        sourceFolder: source?.value || '',
        targetFolder: target?.value || '',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
