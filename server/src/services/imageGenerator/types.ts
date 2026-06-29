// AI 图片生成的提示词模板配置
// 每个商品可生成：1张产品图 + 1张包装图 + 2~3张使用场景图

import { getDatabase } from '../../database/database';

export interface ImagePromptConfig {
  enabled: boolean;
  provider: 'openai' | 'custom' | 'kie' | 'disabled';
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  size: string;
  style: string;
  prompts: {
    product: string;
    packaging: string;
    scene1: string;
    scene2: string;
    scene3: string;
  };
}

export const DEFAULT_PROMPTS: ImagePromptConfig['prompts'] = {
  product: `Use the uploaded reference image as the exact product. Create a clean white-background ecommerce product photo for {reference} {category}. Preserve the same silhouette, proportions, black finish, texture, logo position, LED/display area, ports, buttons, seams, corners, and all visible details. Do not redesign, simplify, replace, rotate into a different model, or add unrelated labels. Improve lighting, sharpness, dust removal, and commercial retouching only. Premium product photography, natural soft shadow, high resolution.`,
  packaging: `Use the uploaded reference image as the exact product identity. Create a packaging/product presentation image for {reference} {category}. If no packaging is visible, show the same product next to a simple neutral retail box without inventing different specifications. Preserve product shape, color, logo, display, ports, buttons, and proportions exactly. Clean retail presentation, commercial photography, high resolution.`,
  scene1: `Place the exact uploaded product into a realistic lifestyle scene on a desk or in a hand. The product must remain identical to the reference image: same shape, size ratio, black finish, logo, LED/display position, ports, cable layout, seams, and edges. Only change background, lighting, hand pose, and environment. Do not turn it into a charger block, different power bank, phone, box, or generic accessory. Natural lighting, realistic commercial photo.`,
  scene2: `Place the exact uploaded product in a wholesale retail display scene. Preserve the reference product exactly: same silhouette, color, logo, screen/display, ports, buttons, proportions, and visible details. The surrounding shelf, hooks, tags, and other accessories may change, but the product itself must not be redesigned or replaced. Realistic store lighting, ecommerce-ready commercial photo.`,
  scene3: `Create a close-up usage/detail scene of the exact uploaded product charging a phone or being held. Preserve all reference product details exactly: same black body, logo placement, display area, ports, cable positions, buttons, seams, corners, scale, and proportions. Do not invent a different model, printed number, extra ports, or different device. Only change hands, phone, background, and lighting. Sharp focus, realistic texture, commercial photography.`,
};

export interface ImageType {
  id: string;
  label: string;
  description: string;
}

export const IMAGE_TYPES: ImageType[] = [
  { id: 'product', label: '产品图', description: '白底电商风格产品主图' },
  { id: 'packaging', label: '包装图', description: '产品包装盒展示' },
  { id: 'scene1', label: '使用场景 1', description: '真实使用环境图' },
  { id: 'scene2', label: '使用场景 2', description: '专业商用场景图' },
  { id: 'scene3', label: '使用场景 3', description: '产品细节特写图' },
];

/**
 * 根据商品信息渲染提示词
 */
export function renderPrompt(
  template: string,
  reference: string,
  category: string,
  context?: { sellingPoints?: string; productIntro?: string; name?: string }
): string {
  const clean = (value?: string) => (value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
  const sellingPoints = clean(context?.sellingPoints);
  const productIntro = clean(context?.productIntro);
  const name = clean(context?.name) || reference;
  const hasSellingPlaceholder = template.includes('{selling_points}');
  const hasIntroPlaceholder = template.includes('{product_intro}');

  let rendered = template
    .replace(/\{reference\}/g, reference)
    .replace(/\{category\}/g, category || 'product')
    .replace(/\{selling_points\}/g, sellingPoints || 'not specified')
    .replace(/\{product_intro\}/g, productIntro || 'not specified')
    .replace(/\{name\}/g, name);

  const contextLines: string[] = [];
  if (sellingPoints && !hasSellingPlaceholder) contextLines.push(`Product selling points: ${sellingPoints}`);
  if (productIntro && !hasIntroPlaceholder) contextLines.push(`Product introduction: ${productIntro}`);
  if (contextLines.length > 0) {
    rendered = `${rendered}\n\nUse the following product facts and do not invent unsupported details:\n${contextLines.join('\n')}`;
  }

  return rendered;
}

/**
 * 从数据库加载图片生成配置
 */
export function loadImageConfig(): ImagePromptConfig {
  const db = getDatabase();
  const get = (key: string) => {
    const row = db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any;
    return row?.value || '';
  };

  const loadPrompt = (key: string) => {
    const val = get(key);
    return val || (DEFAULT_PROMPTS as any)[key.replace('image_prompt_', '')] || '';
  };

  return {
    enabled: get('image_provider') !== 'disabled',
    provider: (get('image_provider') || 'disabled') as any,
    apiBaseUrl: get('image_api_base_url') || '',
    apiKey: get('image_api_key') || '',
    model: get('image_model') || '',
    size: get('image_size') || '1024x1024',
    style: get('image_style') || 'ecommerce_white_background',
    prompts: {
      product: loadPrompt('image_prompt_product') || DEFAULT_PROMPTS.product,
      packaging: loadPrompt('image_prompt_packaging') || DEFAULT_PROMPTS.packaging,
      scene1: loadPrompt('image_prompt_scene1') || DEFAULT_PROMPTS.scene1,
      scene2: loadPrompt('image_prompt_scene2') || DEFAULT_PROMPTS.scene2,
      scene3: loadPrompt('image_prompt_scene3') || DEFAULT_PROMPTS.scene3,
    },
  };
}

/**
 * 保存提示词设置到数据库
 */
export function savePromptSetting(key: string, value: string): void {
  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM api_settings WHERE key = ?').get(key);
  if (existing) {
    db.prepare('UPDATE api_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(value, key);
  } else {
    db.prepare('INSERT INTO api_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(key, value);
  }
}