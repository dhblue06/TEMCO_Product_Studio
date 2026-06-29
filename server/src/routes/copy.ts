import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/database';
import {
  generateForProduct,
  generateForBatch,
  loadCopyConfig,
  createCopyGenerator,
} from '../services/copyGenerator/index';
import { TemplateCopyGenerator } from '../services/copyGenerator/templateGenerator';

const router = Router();

// 为单个商品生成文案
router.post('/generate/:reference', async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const result = await generateForProduct(reference, req.body || {});

    res.json({
      success: true,
      message: '文案生成成功',
      data: result,
    });
  } catch (error: any) {
    console.error('Generate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量生成文案
router.post('/generate-batch', async (req: Request, res: Response) => {
  try {
    const { references } = req.body;

    if (!Array.isArray(references) || references.length === 0) {
      return res.status(400).json({ success: false, error: '请提供商品编号列表' });
    }

    const config = loadCopyConfig();
    const batchLimit = parseInt(
      (getDatabase().prepare("SELECT value FROM api_settings WHERE key = 'batch_copy_limit'").get() as any)?.value || '50',
      10
    );

    if (references.length > batchLimit) {
      return res.status(400).json({
        success: false,
        error: `批量生成数量不能超过 ${batchLimit} 个，当前请求 ${references.length} 个`,
      });
    }

    // 非阻塞响应，先返回
    const result = await generateForBatch(references, (completed, total) => {
      console.log(`[Batch] ${completed}/${total} completed`);
    });

    res.json({
      success: true,
      message: `批量生成完成：成功 ${result.success.length} 个，失败 ${result.failed.length} 个`,
      data: result,
    });
  } catch (error: any) {
    console.error('Batch generate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 预览生成内容（不保存到数据库）
router.post('/preview/:reference', async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const db = getDatabase();

    const product = db.prepare(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM product_images WHERE product_id = p.id) as image_count
      FROM products p WHERE p.reference = ?
    `).get(reference) as any;

    if (!product) {
      return res.status(404).json({ success: false, error: '商品不存在' });
    }

    const generator = createCopyGenerator();
    const result = await generator.generateProductContent({
      reference: product.reference,
      name: product.name || '',
      category: product.category || '',
      brand: product.brand || 'TEMCO',
      model: product.model || '',
      sellingPoints: product.selling_points || '',
      productIntro: product.product_intro || '',
      imageCount: product.image_count || 0,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Preview error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 测试 API 连接
router.post('/test-api', async (req: Request, res: Response) => {
  try {
    const config = loadCopyConfig();
    const generator = createCopyGenerator(config);

    // 用模板生成器测试不会实际调用 API
    if (generator instanceof TemplateCopyGenerator) {
      return res.json({
        success: true,
        message: '当前使用模板生成模式（未配置 API Key）',
        data: { mode: 'template' },
      });
    }

    // 用小规模请求测试 API
    const result = await generator.generateProductContent({
      reference: 'TEST',
      name: 'Test Product',
      category: '手机配件',
      brand: 'TEMCO',
      model: '',
      imageCount: 3,
    });

    res.json({
      success: true,
      message: 'API 连接测试成功',
      data: {
        esName: result.es.name,
        zhName: result.zh.name,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: `API 测试失败: ${error.message}` });
  }
});

// 获取当前文案生成配置状态
router.get('/config', (req: Request, res: Response) => {
  try {
    const config = loadCopyConfig();
    res.json({
      success: true,
      data: {
        provider: config.type,
        model: config.model,
        temperature: config.temperature,
        hasApiKey: !!config.apiKey,
        mode: config.apiKey ? 'api' : 'template',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/copy/generate-alt/:reference - 为商品所有图片生成 ALT 文本
router.post('/generate-alt/:reference', async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const db = getDatabase();

    const product = db.prepare(`
      SELECT p.*, es.name as es_name, es.description_short, es.seo_title,
        zh.name as zh_name
      FROM products p
      LEFT JOIN product_contents es ON p.id = es.product_id AND es.lang = 'es'
      LEFT JOIN product_contents zh ON p.id = zh.product_id AND zh.lang = 'zh'
      WHERE p.reference = ?
    `).get(reference) as any;

    if (!product) return res.status(404).json({ success: false, error: '商品不存在' });

    const images = db.prepare(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY image_index'
    ).all(product.id) as any[];

    if (images.length === 0) return res.json({ success: true, message: '没有图片需要生成 ALT', data: [] });

    const config = loadCopyConfig();
    const generator = createCopyGenerator(config);

    // 准备商品信息用于生成 ALT
    const productInfo = {
      reference: product.reference,
      name: product.es_name || product.name || '',
      nameZh: product.zh_name || '',
      category: product.category || '',
      brand: product.brand || '',
      description: product.description_short || '',
    };

    const results: any[] = [];

    for (const img of images) {
      try {
        // 用模板生成器或 AI 生成 ALT
        let alt = '';
        const roleLabels: Record<string, string> = {
          main_product: '主图',
          packaging: '包装图',
          scene1: '场景图1-使用环境',
          scene2: '场景图2-商用展示',
          scene3: '场景图3-细节特写',
        };
        const roleLabel = roleLabels[img.role] || '产品图';

        // 尝试用 AI 生成 ALT（如果配置了API Key）
        if (config.apiKey) {
          try {
            const systemPrompt = `You are an SEO specialist for PrestaShop product images. Your task is to generate optimized image ALT texts for product images in a B2B online store based in Spain.

IMPORTANT LANGUAGE RULE:
The prompt is in English, but the final output must be bilingual:
1. Spanish from Spain
2. Simplified Chinese
The Spanish ALT text is for PrestaShop image ALT fields.
The Chinese version is for internal review and product management.
Do not output English in the final result.

CRITICAL ACCURACY RULE:
Describe only what is visible in the image or explicitly confirmed in the product data.
Do not guess, assume or invent scenes, functions, materials, locations or use cases.

ALT GENERATION RULES:
1. Length: Spanish ALT must be between 35 and 75 characters. Never exceed 75.
2. Uniqueness: Generate one unique ALT for each image. Do not repeat the same structure. Do not start every ALT with the same phrase. Do not repeat the full product name in every ALT.
3. Accuracy: Describe what is actually visible. If the image shows packaging, mention packaging. If it shows a detail, describe the detail. If it shows a connector, cable, port, screen or button, describe that detail.
4. SEO: Use natural Spanish from Spain. Use brand in 1-2 ALT texts only. Use model only if important. Avoid keyword stuffing.
5. Forbidden: Never mention outdoor use, office use, home use, professional use, commercial use, high demand, best seller, premium quality, warranty, certifications, safety standards, waterproof, shockproof, fast charging, wireless charging, power values, connector types, material names, device compatibility or any technical feature not confirmed.

GOOD EXAMPLES:
- Batería externa TEMCO 30000mAh con embalaje
- Power bank TEMCO con cables integrados
- Detalle de puertos y cables integrados
- Pantalla LED con nivel de batería

BAD EXAMPLES:
- Batería externa TEMCO 30000mAh cargando en oficina
- Producto premium de alta calidad para profesionales
- Power bank universal compatible con todos los dispositivos

Return JSON: {"es": "Spanish ALT here", "zh": "Chinese ALT here"}`;

            const userPrompt = `Product: ${productInfo.name}
Brand: ${productInfo.brand || 'TEMCO'}
Category: ${productInfo.category}
Image type: ${roleLabel}
Reference: ${productInfo.reference}

Generate bilingual ALT text. Spanish: max 75 chars, describe visible content. Chinese: internal reference.`;

            const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
              body: JSON.stringify({
                model: config.model || 'deepseek-chat',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,
                max_tokens: 200,
              }),
            });
            if (response.ok) {
              const data = await response.json() as any;
              const content = (data?.choices?.[0]?.message?.content || '').trim();
              // 尝试解析 JSON 格式的响应（包含 es/zh）
              try {
                const parsed = JSON.parse(content);
                alt = parsed.es || parsed.ES || parsed.Spanish || content.replace(/^["']|["']$/g, '').trim();
              } catch {
                alt = content.replace(/^["']|["']$/g, '').trim();
              }
            }
          } catch {
            // AI 失败时使用模板
          }
        }

        // 模板 ALT（AI 不可用或失败时的备选）
        if (!alt) {
          const namePart = productInfo.name || productInfo.reference;
          if (img.role === 'main_product' || img.image_index === 1) {
            alt = `${namePart} - ${productInfo.category} - ${productInfo.brand || 'TEMCO'}`;
          } else {
            alt = `${namePart} - ${roleLabel} - ${productInfo.category} TEMCO`;
          }
        }

        // 限制 ALT 长度
        alt = alt.substring(0, 255);

        // 更新数据库
        db.prepare('UPDATE product_images SET alt = ? WHERE id = ?').run(alt, img.id);
        results.push({ imageId: img.id, role: img.role, alt });
      } catch (imgErr: any) {
        results.push({ imageId: img.id, role: img.role, error: imgErr.message });
      }
    }

    res.json({
      success: true,
      message: `已生成 ${results.filter(r => !r.error).length}/${images.length} 条 ALT`,
      data: results,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
