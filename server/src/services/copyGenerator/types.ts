// AI Provider 抽象层
// 支持 DeepSeek、OpenAI、自定义 OpenAI-compatible API、本地模板生成

export interface ProductContentInput {
  reference: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  descriptionRaw?: string;
  sellingPoints?: string;
  productIntro?: string;
  imageCount: number;
}

export interface ProductContentResult {
  es: {
    name: string;
    descriptionShort: string;
    description: string;
    seoTitle: string;
    seoDescription: string;
    friendlyUrl: string;
    imageAlt: string;
    galleryImageAlts: string[];
    whatsappCopy: string;
    videoScript: string;
  };
  zh: {
    name: string;
    descriptionShort: string;
    description: string;
    seoTitle: string;
    seoDescription: string;
    friendlyUrl: string;
    imageAlt: string;
    galleryImageAlts: string[];
    whatsappCopy: string;
    videoScript: string;
  };
}

export interface CopyGenerator {
  generateProductContent(input: ProductContentInput): Promise<ProductContentResult>;
}

// 辅助：生成友好 URL
export function createFriendlyUrl(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

// 辅助：生成图片导出名
export function createExportImageName(reference: string, category: string, index: number): string {
  const base = `${reference} ${category} TEMCO`;
  return `${createFriendlyUrl(base)}-${index}.jpg`;
}
