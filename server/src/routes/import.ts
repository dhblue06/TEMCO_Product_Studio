import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database/database';

const router = Router();

// 直接从文件路径导入 PrestaShop CSV
router.post('/import-file', (req: Request, res: Response) => {
  try {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ success: false, error: '文件不存在' });
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    // 去除 BOM
    const csv = raw.replace(/^\uFEFF/, '');
    
    const rows = parsePrestashopCSV(csv);
    if (rows.length < 2) {
      return res.json({ success: false, message: 'CSV 为空或只有表头', data: { imported: 0 } });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);
    
    // 找到关键字段的索引
    const refIdx = headers.findIndex(h => /reference/i.test(h));
    const nameIdx = headers.findIndex(h => /name/i.test(h) && !/file/i.test(h) && !/shop/i.test(h));
    const catIdx = headers.findIndex(h => /categor/i.test(h));
    const brandIdx = headers.findIndex(h => /manufacturer|marca|brand/i.test(h));
    const summaryIdx = headers.findIndex(h => /summary|descrip.*cort|short.*desc/i.test(h));
    const descIdx = headers.findIndex(h => /^description$/i.test(h) || /descripci/.test(h));
    const seoTitleIdx = headers.findIndex(h => /meta.?title/i.test(h));
    const seoDescIdx = headers.findIndex(h => /meta.?desc/i.test(h));
    const urlIdx = headers.findIndex(h => /url.?rewrit|friendly.?url/i.test(h));
    const priceIdx = headers.findIndex(h => /price.*excl|precio/i.test(h));
    const qtyIdx = headers.findIndex(h => /^quantity|stock|cantidad/i.test(h));
    const imageUrlsIdx = headers.findIndex(h => /image.*url|imagen.*url/i.test(h));
    const imageAltsIdx = headers.findIndex(h => /image.*alt|imagen.*alt/i.test(h));

    let imported = 0;
    let updated = 0;

    const db = getDatabase();
    const insertProduct = db.prepare(`
      INSERT INTO products (reference, prestashop_id, name, category, brand, model, status, sheet_raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '待处理', ?, datetime('now'))
      ON CONFLICT(reference) DO UPDATE SET
        name = excluded.name, category = excluded.category, brand = excluded.brand,
        sheet_raw_data = excluded.sheet_raw_data, updated_at = excluded.updated_at
    `);

    const insertBatch = db.transaction(() => {
      for (const row of dataRows) {
        const ref = refIdx >= 0 ? (row[refIdx] || '').trim() : '';
        if (!ref) continue;

        const rawData: Record<string, string> = {};
        headers.forEach((h, i) => { rawData[h.trim()] = (row[i] || '').trim(); });

        const result = insertProduct.run(
          ref,
          row[0] || '',
          nameIdx >= 0 ? (row[nameIdx] || '').trim() : '',
          catIdx >= 0 ? (row[catIdx] || '').trim().split(',').map((s: string) => s.trim()).filter(Boolean).join(', ') : '',
          brandIdx >= 0 ? (row[brandIdx] || '').trim() : 'TEMCO',
          '',
          JSON.stringify(rawData)
        );

        if (result.changes > 0) {
          if (result.lastInsertRowid) imported++;
          else updated++;
        }
      }
    });

    insertBatch();

    res.json({
      success: true,
      message: `导入完成！新增 ${imported} 个，更新 ${updated} 个商品（共 ${dataRows.length} 行）`,
      data: {
        imported,
        updated,
        totalRows: dataRows.length,
        fields: {
          reference: refIdx >= 0 ? headers[refIdx] : '未找到',
          name: nameIdx >= 0 ? headers[nameIdx] : '未找到',
          category: catIdx >= 0 ? headers[catIdx] : '未找到',
          brand: brandIdx >= 0 ? headers[brandIdx] : '未找到',
          summary: summaryIdx >= 0 ? headers[summaryIdx] : '未找到',
          description: descIdx >= 0 ? headers[descIdx] : '未找到',
          seoTitle: seoTitleIdx >= 0 ? headers[seoTitleIdx] : '未找到',
        },
        sample: {
          reference: refIdx >= 0 ? (dataRows[0]?.[refIdx] || '') : '',
          name: nameIdx >= 0 ? (dataRows[0]?.[nameIdx] || '') : '',
        },
      },
    });
  } catch (error: any) {
    console.error('File import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 专用 PrestaShop CSV 解析器（分号分隔，支持引号）
function parsePrestashopCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ';') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else if (char === '\r') {
        // skip \r, handle \r\n
      } else {
        currentField += char;
      }
    }
  }

  // 处理最后一行
  if (currentField.trim() || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export default router;
