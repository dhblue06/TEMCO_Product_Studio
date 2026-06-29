import { getDatabase } from '../../database/database';
import { CopyGenerator, ProductContentInput, ProductContentResult } from './types';
import { TemplateCopyGenerator } from './templateGenerator';
import { OpenAICopyGenerator } from './openaiGenerator';

export type CopyProviderType = 'deepseek' | 'openai' | 'custom' | 'template';

interface ProviderConfig {
  type: CopyProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

/**
 * 从数据库读取 API 设置
 */
export function loadCopyConfig(): ProviderConfig {
  const db = getDatabase();
  const get = (key: string) => {
    const row = db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any;
    return row?.value || '';
  };

  return {
    type: (get('copy_provider') || 'template') as CopyProviderType,
    baseUrl: get('copy_api_base_url') || 'https://api.deepseek.com',
    apiKey: get('copy_api_key') || '',
    model: get('copy_model') || 'deepseek-chat',
    temperature: parseFloat(get('copy_temperature') || '0.3'),
    maxTokens: parseInt(get('copy_max_tokens') || '4000', 10),
  };
}

/**
 * 根据配置创建合适的生成器
 */
export function createCopyGenerator(config?: ProviderConfig): CopyGenerator {
  const cfg = config || loadCopyConfig();

  // 没有 API Key 时使用模板生成
  if (!cfg.apiKey || cfg.type === 'template') {
    console.log('[CopyGenerator] Using template generator (no API key or template mode)');
    return new TemplateCopyGenerator();
  }

  const apiBaseUrl = cfg.type === 'deepseek' ? 'https://api.deepseek.com' : cfg.baseUrl;

  console.log(`[CopyGenerator] Using ${cfg.type} API: ${apiBaseUrl} model=${cfg.model}`);
  return new OpenAICopyGenerator({
    baseUrl: apiBaseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
  });
}

/**
 * 为单个商品生成文案
 */
export async function generateForProduct(
  reference: string,
  customInput?: Partial<ProductContentInput>
): Promise<ProductContentResult> {
  const db = getDatabase();
  const product = db.prepare(`
    SELECT p.*, 
      (SELECT COUNT(*) FROM product_images WHERE product_id = p.id) as image_count
    FROM products p WHERE p.reference = ?
  `).get(reference) as any;

  if (!product) {
    throw new Error(`商品 ${reference} 不存在`);
  }

  const input: ProductContentInput = {
    reference: product.reference,
    name: product.name || '',
    category: product.category || '',
    brand: product.brand || 'TEMCO',
    model: product.model || '',
    sellingPoints: product.selling_points || '',
    productIntro: product.product_intro || '',
    imageCount: product.image_count || 0,
    ...customInput,
  };

  const generator = createCopyGenerator();
  const result = await generator.generateProductContent(input);

  // 保存结果到数据库
  const now = new Date().toISOString();

  for (const lang of ['es', 'zh'] as const) {
    const content = result[lang];
    const existing = db.prepare(
      'SELECT id FROM product_contents WHERE product_id = ? AND lang = ?'
    ).get(product.id, lang);

    if (existing) {
      db.prepare(`
        UPDATE product_contents SET
          name = ?, description_short = ?, description = ?,
          seo_title = ?, seo_description = ?, friendly_url = ?,
          image_alt = ?, gallery_image_alts = ?,
          whatsapp_copy = ?, video_script = ?,
          updated_at = ?
        WHERE product_id = ? AND lang = ?
      `).run(
        content.name, content.descriptionShort, content.description,
        content.seoTitle, content.seoDescription, content.friendlyUrl,
        content.imageAlt, JSON.stringify(content.galleryImageAlts),
        content.whatsappCopy, content.videoScript,
        now, product.id, lang
      );
    } else {
      db.prepare(`
        INSERT INTO product_contents
          (product_id, lang, name, description_short, description, seo_title, seo_description,
           friendly_url, image_alt, gallery_image_alts, whatsapp_copy, video_script, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        product.id, lang,
        content.name, content.descriptionShort, content.description,
        content.seoTitle, content.seoDescription, content.friendlyUrl,
        content.imageAlt, JSON.stringify(content.galleryImageAlts),
        content.whatsappCopy, content.videoScript, now
      );
    }
  }

  // 更新商品状态
  db.prepare(`
    UPDATE products SET status = '双语文案已生成', updated_at = datetime('now')
    WHERE id = ? AND (status = '待处理' OR status = '已匹配图片' OR status = '双语文案待生成')
  `).run(product.id);

  // 记录日志
  db.prepare(`
    INSERT INTO api_logs (provider, type, model, reference, status, created_at)
    VALUES (?, 'copy_generation', ?, ?, 'success', datetime('now'))
  `).run(loadCopyConfig().type, loadCopyConfig().model, reference);

  return result;
}

/**
 * 批量生成文案
 */
export async function generateForBatch(
  references: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<{ success: string[]; failed: string[] }> {
  const success: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < references.length; i++) {
    try {
      await generateForProduct(references[i]);
      success.push(references[i]);
    } catch (err: any) {
      console.error(`Failed to generate for ${references[i]}:`, err.message);
      failed.push(references[i]);
    }

    if (onProgress) {
      onProgress(i + 1, references.length);
    }
  }

  return { success, failed };
}

export * from './types';
