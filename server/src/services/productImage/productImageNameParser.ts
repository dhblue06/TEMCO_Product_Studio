// 产品图片文件名解析

export function normalizeProductImageFilename(filename: string): string {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.(jpg|jpeg|png|webp|avif)$/i, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
}

export function extractSixDigitSerial(value: string): string | null {
  const match = value.match(/(?:^|[^0-9])([0-9]{6})(?:[^0-9]|$)/);
  return match?.[1] ?? null;
}

export function normalizeModelKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

export function extractImageSequence(normalizedFilename: string): number | null {
  const match = normalizedFilename.match(/(?:-|_|\s)(\d{1,3})$/);
  return match ? parseInt(match[1], 10) : null;
}

const ROLE_PATTERNS: { role: string; patterns: string[] }[] = [
  { role: 'main', patterns: ['main', 'cover', 'principal'] },
  { role: 'front', patterns: ['front', 'frontal'] },
  { role: 'back', patterns: ['back', 'rear', 'trasera'] },
  { role: 'side', patterns: ['side', 'lateral'] },
  { role: 'package', patterns: ['package', 'packaging', 'box', 'caja', 'embalaje'] },
  { role: 'detail', patterns: ['detail', 'detalle', 'closeup'] },
  { role: 'lifestyle', patterns: ['lifestyle', 'scene', 'escena', 'uso'] },
];

export function detectImageRole(normalizedFilename: string): string | null {
  for (const item of ROLE_PATTERNS) {
    if (item.patterns.some(p => normalizedFilename.includes(p))) {
      return item.role;
    }
  }
  return null;
}

export const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
