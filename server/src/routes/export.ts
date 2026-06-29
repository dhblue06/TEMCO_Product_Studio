import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getDatabase } from '../database/database';

const router = Router();

// 导出 PrestaShop CSV（保留原格式，更新品牌字段）
router.get('/prestashop-csv', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const products = db.prepare(`
      SELECT reference, name, brand, sheet_raw_data FROM products ORDER BY reference
    `).all() as any[];

    if (products.length === 0) {
      return res.status(404).json({ success: false, error: '没有商品数据' });
    }

    // 从第一个商品的原始数据中获取表头
    const firstRaw = JSON.parse(products[0]?.sheet_raw_data || '{}');
    const originalHeaders = Object.keys(firstRaw);

    // 构建 CSV：保留原始表头，更新 Manufacturer 列
    const BOM = '\uFEFF';
    const delimiter = ';';
    const lines: string[] = [];

    // 表头行
    lines.push(originalHeaders.join(delimiter));

    for (const p of products) {
      const raw = JSON.parse(p.sheet_raw_data || '{}');
      const row: string[] = [];

      for (const header of originalHeaders) {
        let value = raw[header] || '';

        // 更新 Manufacturer 列为数据库中的 brand
        if (/manufacturer|marca/i.test(header) && p.brand) {
          value = p.brand;
        }

        // CSV 转义：包含分隔符、引号或换行时加引号
        if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
          value = '"' + value.replace(/"/g, '""') + '"';
        }

        row.push(value);
      }

      lines.push(row.join(delimiter));
    }

    const csv = BOM + lines.join('\r\n');

    // 保存到文件
    const outputDir = path.join(__dirname, '../../data/exports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, 'prestashop_products_export.csv');
    fs.writeFileSync(outputPath, csv, 'utf-8');

    // 记录导出日志
    db.prepare(`
      INSERT INTO export_logs (export_type, product_count, file_path, status, created_at)
      VALUES ('prestashop_csv', ?, ?, 'success', datetime('now'))
    `).run(products.length, outputPath);

    res.json({
      success: true,
      message: `已导出 ${products.length} 个商品到 PrestaShop CSV`,
      data: {
        filePath: outputPath,
        productCount: products.length,
        columns: originalHeaders.length,
        updatedBrands: products.filter(p => p.brand).length,
        downloadUrl: `/api/export/download/prestashop_products_export.csv`,
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 下载导出的 CSV 文件
router.get('/download/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, '../../data/exports', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '文件不存在' });
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});

export default router;
