// 常用颜色与图片角色常量（与后端 types.ts 保持一致）
export const COMMON_COLORS = [
  'Negro', 'Blanco', 'Azul', 'Rojo', 'Rosa', 'Verde', 'Morado',
  'Naranja', 'Amarillo', 'Gris', 'Plata', 'Dorado', 'Transparente', 'Multicolor',
];

export const SPECIAL_COLORS = [
  'Color aleatorio', 'Colores surtidos', 'Sin variante de color',
  'Color no identificado', 'Otro',
];

export const IMAGE_ROLES: { role: string; label: string }[] = [
  { role: 'front', label: '正面' },
  { role: 'back', label: '背面' },
  { role: 'side', label: '侧面' },
  { role: 'package', label: '包装' },
  { role: 'all_colors', label: '所有颜色合照' },
  { role: 'single_color', label: '单个颜色' },
  { role: 'barcode', label: '条码/标签' },
  { role: 'detail', label: '产品细节' },
  { role: 'damaged', label: '瑕疵/破损' },
  { role: 'other', label: '其他' },
];

export function roleLabel(role: string): string {
  return IMAGE_ROLES.find(r => r.role === role)?.label || role || '其他';
}
