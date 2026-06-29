import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/database';

const router = Router();

// Google Sheet 同步 - 导入商品数据
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { sheetUrl } = req.body;

    // 解析 Sheet URL 获取 spreadsheetId 和 gid
    const parsed = parseGoogleSheetUrl(sheetUrl);
    if (!parsed) {
      return res.status(400).json({ success: false, error: '无法解析 Sheet URL' });
    }

    const { spreadsheetId, gid } = parsed;
    
    // 从公开 CSV 读取数据
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    
    const response = await fetch(csvUrl);
    if (!response.ok) {
      return res.status(502).json({ success: false, error: `无法读取 Sheet: HTTP ${response.status}` });
    }

    const csvText = await response.text();
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      return res.json({ success: true, message: 'Sheet 为空或只有表头', data: { imported: 0 } });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // 找到关键字段索引
    const fieldMap = createFieldMap(headers);

    // 检测映射到的列名
    const detectedColumns: Record<string, string> = {};
    for (const [field, idx] of Object.entries(fieldMap)) {
      if (idx !== undefined && headers[idx]) {
        detectedColumns[field] = headers[idx];
      }
    }

    let imported = 0;
    let updated = 0;

    const insertProduct = db.prepare(`
      INSERT INTO products (reference, prestashop_id, name, category, brand, model, status, sheet_raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(reference) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        brand = excluded.brand,
        model = excluded.model,
        sheet_raw_data = excluded.sheet_raw_data,
        updated_at = excluded.updated_at
    `);

    const insertBatch = db.transaction(() => {
      for (const row of dataRows) {
        const reference = getField(row, fieldMap, 'reference');
        if (!reference) continue;

        const rawData: Record<string, string> = {};
        headers.forEach((h, i) => {
          rawData[h.trim()] = (row[i] || '').trim();
        });

        const prestashopId = getField(row, fieldMap, 'prestashop_id');
        const name = getField(row, fieldMap, 'name_es');
        const category = getField(row, fieldMap, 'category');
        const brand = getField(row, fieldMap, 'brand') || 'TEMCO';
        const model = getField(row, fieldMap, 'model');

        const result = insertProduct.run(
          reference, prestashopId, name, category, brand, model,
          '待处理', JSON.stringify(rawData)
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
      message: `导入完成：新增 ${imported} 个，更新 ${updated} 个商品`,
      data: {
        imported,
        updated,
        total: dataRows.length,
        totalRows: dataRows.length,
        detectedColumns,
        headers: headers.map(h => h.trim()),
      }
    });
  } catch (error: any) {
    console.error('Sheet sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 测试 Sheet 连接
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { sheetUrl } = req.body;
    const parsed = parseGoogleSheetUrl(sheetUrl);
    if (!parsed) {
      return res.status(400).json({ success: false, error: '无法解析 Sheet URL' });
    }

    const csvUrl = `https://docs.google.com/spreadsheets/d/${parsed.spreadsheetId}/export?format=csv&gid=${parsed.gid}`;
    const response = await fetch(csvUrl);

    if (!response.ok) {
      return res.json({
        success: false,
        message: `连接失败: HTTP ${response.status}`
      });
    }

    const csvText = await response.text();
    const rows = parseCSV(csvText);
    const headers = rows[0] || [];

    res.json({
      success: true,
      message: '连接成功',
      data: {
        spreadsheetId: parsed.spreadsheetId,
        gid: parsed.gid,
        rowCount: rows.length - 1,
        headers
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 解析 Google Sheet URL
function parseGoogleSheetUrl(url: string): { spreadsheetId: string; gid: string } | null {
  try {
    // 支持格式:
    // https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit?gid={gid}#gid={gid}
    // https://docs.google.com/spreadsheets/d/{spreadsheetId}/export?format=csv&gid={gid}
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return null;

    const spreadsheetId = match[1];
    const gidMatch = url.match(/[?&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';

    return { spreadsheetId, gid };
  } catch {
    return null;
  }
}

// 增强 CSV 解析：自动检测分隔符（逗号、分号、制表符）
function parseCSV(text: string): string[][] {
  // 检测分隔符
  const firstLine = text.split('\n')[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  
  let delimiter = ',';
  if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ';';
  else if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  const delim = delimiter;

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
      } else if (char === delim) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        if (char === '\r') i++;
      } else if (char === '\r') {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
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

// 根据字段映射获取值 - 增强版，支持更多列名变体
function createFieldMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '_');

  headers.forEach((h, i) => {
    const key = normalize(h);
    map[key] = i;
  });

  // 全面的别名映射
  const aliases: Record<string, string[]> = {
    'reference': [
      'ref', 'sku', 'product_code', 'codigo', 'code', 'mpn',
      'referencia', 'product_reference', 'item_code', '编号', '商品编号',
    ],
    'prestashop_id': [
      'id_product', 'product_id', 'id', 'prestashop_id_product',
      'id_producto', 'ps_id', 'shop_id',
    ],
    'name_es': [
      'name', 'product_name', 'nombre', 'title', 'product_title',
      'name_es', 'nombre_producto', 'producto', '商品名', '商品名称',
      'titulo', 'titulo_producto',
    ],
    'category': [
      'categoria', 'categories', 'cat', 'category_name',
      'category_es', 'categoría', '分类', '品类', '商品分类',
    ],
    'brand': [
      'marca', 'marcas', 'manufacturer', 'brand_name',
      'marca_comercial', '品牌', 'manufacturer_name',
    ],
    'model': [
      'modelo', 'type', 'product_type', 'tipo', '型号', '产品型号',
    ],
    'image_folder': [
      'image_folder', 'img_folder', 'folder', '图片文件夹',
      'carpeta_imagenes', 'images_folder', 'folder_name',
    ],
    'main_image': [
      'main_image', 'main_img', 'primary_image', 'cover_image',
      'imagen_principal', '主图', 'cover',
    ],
    'video_file': [
      'video_file', 'video', 'video_link', 'video_url',
      'archivo_video', '视频', 'video_name',
    ],
    'description_short_es': [
      'description_short', 'short_description', 'descripcion_corta',
      'description_short_es', 'descripcion_breve', 'resumen',
      '短描述', 'brief_description',
    ],
    'description_es': [
      'description', 'descripcion', 'product_description',
      'description_es', 'long_description', 'descripcion_larga',
      '描述', '产品描述', '商品详情',
    ],
    'seo_title_es': [
      'seo_title', 'meta_title', 'title_seo', 'seo_titulo',
      'seo_title_es', 'meta_title_es', 'seo标题', 'SEO标题',
    ],
    'seo_description_es': [
      'seo_description', 'meta_description', 'description_seo',
      'seo_description_es', 'meta_desc', 'seo_descripcion',
      'SEO描述', 'seo描述',
    ],
    'status': [
      'estado', 'product_status', 'state', '商品状态', '状态',
    ],
    'upload_status': [
      'upload_status', 'upload_state', 'subido', '上传状态',
    ],
    'notes': [
      'note', 'notas', 'observaciones', '备注', '注释', 'comentarios',
    ],
    'price': [
      'precio', 'preco', 'cost', '价格', '售价', '销售价格',
    ],
    'stock': [
      'stock', 'quantity', 'inventory', '库存', 'cantidad', '存在',
    ],
  };

  for (const [standard, aliasList] of Object.entries(aliases)) {
    for (const headerKey of Object.keys(map)) {
      if (aliasList.includes(headerKey)) {
        if (map[standard] === undefined) {
          map[standard] = map[headerKey];
        }
      }
    }
  }

  // 最终兜底：如果 name_es 仍未匹配到，把 reference 之后的第一个非空列作为名称
  if (map['name_es'] === undefined) {
    const refIdx = map['reference'];
    if (refIdx !== undefined) {
      for (let i = refIdx + 1; i < headers.length; i++) {
        if (headers[i].trim()) {
          map['name_es'] = i;
          break;
        }
      }
    }
  }

  // 最终兜底：category 和 brand
  const headerLower = headers.map(h => h.trim().toLowerCase());
  for (let i = 0; i < headerLower.length; i++) {
    const h = headerLower[i];
    if (map['category'] === undefined) {
      if (h.includes('cat') || h.includes('品类') || h.includes('分类')) map['category'] = i;
    }
    if (map['brand'] === undefined) {
      if (h.includes('brand') || h.includes('marca') || h.includes('manufactur') || h.includes('品牌')) map['brand'] = i;
    }
    if (map['name_es'] === undefined) {
      if (h.includes('name') || h.includes('nombre') || h.includes('product') || h.includes('title') || h.includes('item')) map['name_es'] = i;
    }
  }

  return map;
}

function getField(row: string[], fieldMap: Record<string, number>, fieldName: string): string {
  const index = fieldMap[fieldName];
  if (index === undefined || index >= row.length) return '';
  return (row[index] || '').trim();
}

// 直接粘贴 CSV 数据导入
router.post('/sync-csv', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { csv } = req.body;

    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ success: false, error: '请提供 CSV 数据' });
    }

    const rows = parseCSV(csv);
    if (rows.length < 2) {
      return res.json({ success: true, message: 'CSV 为空或只有表头', data: { imported: 0 } });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);
    const fieldMap = createFieldMap(headers);

    // 检测映射到的列名
    const detectedColumns: Record<string, string> = {};
    for (const [field, idx] of Object.entries(fieldMap)) {
      if (idx !== undefined && headers[idx]) {
        detectedColumns[field] = headers[idx];
      }
    }

    let imported = 0;
    let updated = 0;

    const insertProduct = db.prepare(`
      INSERT INTO products (reference, prestashop_id, name, category, brand, model, status, sheet_raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '待处理', ?, datetime('now'))
      ON CONFLICT(reference) DO UPDATE SET
        name = excluded.name, category = excluded.category, brand = excluded.brand,
        model = excluded.model, sheet_raw_data = excluded.sheet_raw_data, updated_at = excluded.updated_at
    `);

    const insertBatch = db.transaction(() => {
      for (const row of dataRows) {
        const reference = getField(row, fieldMap, 'reference');
        if (!reference) continue;

        const rawData: Record<string, string> = {};
        headers.forEach((h, i) => { rawData[h.trim()] = (row[i] || '').trim(); });

        const result = insertProduct.run(
          reference,
          getField(row, fieldMap, 'prestashop_id'),
          getField(row, fieldMap, 'name_es'),
          getField(row, fieldMap, 'category'),
          getField(row, fieldMap, 'brand') || 'TEMCO',
          getField(row, fieldMap, 'model'),
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
      message: `导入完成：新增 ${imported} 个，更新 ${updated} 个商品（共 ${dataRows.length} 行）`,
      data: { imported, updated, totalRows: dataRows.length, detectedColumns, headers: headers.map(h => h.trim()) },
    });
  } catch (error: any) {
    console.error('CSV sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
