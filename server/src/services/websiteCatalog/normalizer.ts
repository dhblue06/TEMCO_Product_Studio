export function normalizeReference(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function normalizePrestashopId(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeBarcode(value: unknown): string {
  return String(value ?? '').trim().replace(/[^0-9]/g, '');
}

export function parseSpanishPrice(value: string): number | null {
  const cleaned = value
    .replace(/\u00A0/g, '')
    .replace(/€/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

export function parseQuantity(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (!/^-?\d+$/.test(text)) return null;
  const number = Number.parseInt(text, 10);
  return Number.isSafeInteger(number) ? number : null;
}
