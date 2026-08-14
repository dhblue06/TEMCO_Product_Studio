// CAJA 新品检查：数据标准化（v1.6 文档 §9）
// 原则：优先使用可靠唯一标识，标准化规则保守，避免把不同值错误合并。

/** Reference 标准化：trim + 大写（不删除 - _ / 字母等，避免错误合并） */
export function normalizeReference(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

/** 条码标准化：仅去空白（不删其它字符，保留显示） */
export function normalizeBarcode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '');
}

/** 是否可作为 EAN13 / UPC 参与匹配：纯数字 8–14 位 */
export function isValidBarcodeCandidate(value: string): boolean {
  return /^[0-9]{8,14}$/.test(value);
}

/** 产品名称标准化：去重音、大写、非字母数字统一为空格 */
export function normalizeProductName(name: string): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
