// CAJA 新品检查：Excel 解析（v1.6 文档 §24-26）
import * as XLSX from 'xlsx';

export interface CajaProductRow {
  reference: string;
  barcode: string;
  name: string;
  name2?: string;
  purchasePrice?: number;
  salePrice?: number;
  editDate?: string;
  status?: string;
  rawData: Record<string, unknown>;
}

export interface CajaExcelResult {
  rows: CajaProductRow[];
  columns: string[];
  totalRows: number;
}

/** 必须存在的表头 */
export const REQUIRED_COLUMNS = ['编号', '条码', '名称'];

/** 表头字段别名 → 规范字段（兼容列名细微差异） */
const FIELD_ALIASES: Record<string, keyof CajaProductRow> = {
  编号: 'reference',
  条码: 'barcode',
  名称: 'name',
  名称2: 'name2',
  进价: 'purchasePrice',
  售价: 'salePrice',
  编辑日期: 'editDate',
  状态: 'status',
};

export class InvalidCajaFileError extends Error {
  missingColumns: string[];
  constructor(missingColumns: string[]) {
    super('INVALID_CAJA_FILE');
    this.missingColumns = missingColumns;
  }
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isFinite(n) ? n : undefined;
}

/** 解析 CAJA Products.xlsx（buffer 读取，解析后即释放） */
export function parseCajaExcel(buffer: Buffer): CajaExcelResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new Error('无法读取 Excel 文件。');
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('无法读取 Excel 文件（无工作表）。');

  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  // 表头校验
  const missing = REQUIRED_COLUMNS.filter(c => !(c in (jsonData[0] || {})));
  if (missing.length > 0) throw new InvalidCajaFileError(missing);

  const columns = Object.keys(jsonData[0] || {});
  const rows: CajaProductRow[] = [];
  let totalRows = 0;

  for (const row of jsonData) {
    totalRows++;
    const reference = toStr(row['编号']);
    const barcode = toStr(row['条码']);
    const name = toStr(row['名称']);
    // 空行：编号/条码/名称全空 → 忽略
    if (!reference && !barcode && !name) continue;

    const out: CajaProductRow = { reference, barcode, name, rawData: { ...row } };
    for (const [alias, field] of Object.entries(FIELD_ALIASES)) {
      if (field === 'reference' || field === 'barcode' || field === 'name') continue;
      const v = row[alias];
      if (field === 'purchasePrice' || field === 'salePrice') {
        const n = toNum(v);
        if (n !== undefined) out[field] = n;
      } else if (field === 'name2' || field === 'editDate' || field === 'status') {
        const s = toStr(v);
        if (s) out[field] = s;
      }
    }
    rows.push(out);
  }

  return { rows, columns, totalRows };
}
