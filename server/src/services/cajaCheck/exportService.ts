// CAJA 新品检查：CSV 导出（v1.6 文档 §37）
import { getDatabase } from '../../database/database';

const HEADERS = ['CAJA编号', '条码', '名称', '名称2', '进价', '售价', '网站价格', '价格变动', '编辑日期', 'CAJA状态', '检查结果'];

const STATUS_LABEL: Record<string, string> = {
  existing: '网站已存在',
  new: '🆕 网站没有',
  review: '🟡 需要确认',
};

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** 导出批次明细 CSV（默认 status=new；status='price_changed' 导出价格变动项）；返回 { csv, filename } */
export function exportItemsCsv(batchId: number, status = 'new'): { csv: string; filename: string } {
  const db = getDatabase();
  let where = '';
  const params: any[] = [batchId];
  if (status && status !== 'all') {
    if (status === 'price_changed') {
      where = 'AND prestashop_product_id IS NOT NULL AND price_changed = 1';
    } else {
      where = 'AND result_status = ?';
      params.push(status);
    }
  }

  const rows = db.prepare(`
    SELECT caja_reference, barcode, name, name2, purchase_price, sale_price,
           prestashop_price, price_changed,
           edit_date, caja_status, result_status
    FROM caja_check_items WHERE batch_id = ? ${where}
    ORDER BY id
  `).all(...params) as any[];

  const lines: string[] = [HEADERS.join(',')];
  for (const r of rows) {
    lines.push([
      r.caja_reference, r.barcode, r.name, r.name2,
      r.purchase_price ?? '', r.sale_price ?? '',
      r.prestashop_price ?? '', r.price_changed ? '是' : '否',
      r.edit_date, r.caja_status, STATUS_LABEL[r.result_status] || r.result_status,
    ].map(csvCell).join(','));
  }

  const date = new Date().toISOString().slice(0, 10);
  return { csv: '\uFEFF' + lines.join('\r\n'), filename: `CAJA_New_Products_${date}.csv` };
}
