import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/database';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { KieImageGenerator, loadKieConfig, KieModel } from '../services/imageGenerator/kieGenerator';
import {
  loadImageConfig,
  renderPrompt,
  savePromptSetting,
  IMAGE_TYPES,
  DEFAULT_PROMPTS,
} from '../services/imageGenerator/types';

const router = Router();
const UPLOAD_DIR = path.join(__dirname, '../../data/uploads');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 获取图片生成配置（含提示词模板）
router.get('/config', (req: Request, res: Response) => {
  try {
    const config = loadImageConfig();
    res.json({
      success: true,
      data: {
        ...config,
        apiKey: config.apiKey ? config.apiKey.substring(0, 4) + '****' : '',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新图片生成提示词
router.patch('/prompts', (req: Request, res: Response) => {
  try {
    const { prompts } = req.body;
    if (!prompts || typeof prompts !== 'object') {
      return res.status(400).json({ success: false, error: '请提供 prompts 对象' });
    }

    for (const [key, value] of Object.entries(prompts)) {
      if (['product', 'packaging', 'scene1', 'scene2', 'scene3'].includes(key)) {
        savePromptSetting(`image_prompt_${key}`, value as string);
      }
    }

    res.json({ success: true, message: '提示词已更新' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 重置提示词为默认值
router.post('/prompts/reset', (req: Request, res: Response) => {
  try {
    for (const [key, value] of Object.entries(DEFAULT_PROMPTS)) {
      savePromptSetting(`image_prompt_${key}`, value);
    }
    res.json({ success: true, message: '提示词已重置为默认值' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/types', (_req: Request, res: Response) => {
  res.json({ success: true, data: IMAGE_TYPES });
});

function getProductForImage(reference: string) {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, reference, name, category, selling_points, product_intro
    FROM products WHERE reference = ?
  `).get(reference) as any;
}

function renderProductPrompts(product: any) {
  const config = loadImageConfig();
  const rendered: Record<string, string> = {};
  const context = {
    sellingPoints: product.selling_points || '',
    productIntro: product.product_intro || '',
    name: product.name || '',
  };

  for (const imgType of IMAGE_TYPES) {
    const template = (config.prompts as any)[imgType.id] || '';
    rendered[imgType.id] = renderPrompt(template, product.reference, product.category || 'product', context);
  }

  return { config, rendered };
}

function promptResults(rendered: Record<string, string>) {
  return IMAGE_TYPES.map((imgType, index) => ({
    type: imgType.id,
    label: imgType.label,
    prompt: rendered[imgType.id] || '',
    status: 'prompt_ready',
    imageIndex: index + 1,
    imageUrls: [],
  }));
}

function getReferenceImage(productId: number) {
  const db = getDatabase();
  const image = db.prepare(`
    SELECT * FROM product_images
    WHERE product_id = ? AND local_path IS NOT NULL AND local_path != ''
    ORDER BY CASE WHEN role = 'main' THEN 0 ELSE 1 END, image_index ASC, id ASC
    LIMIT 1
  `).get(productId) as any;
  if (!image?.local_path || !fs.existsSync(image.local_path)) return null;
  return image;
}

function imageFileToDataUrl(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const data = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${data}`;
}

function buildReferenceLockedPrompt(prompt: string, hasReferenceImage: boolean): string {
  const lock = hasReferenceImage
    ? `\n\nREFERENCE IMAGE LOCK: Use the provided input image as the exact product identity. Preserve the same product silhouette, proportions, color, finish, logo placement, LED/display position, ports, cable positions, buttons, seams, corners, scale, and all visible details. Do not replace it with another charger, power bank, package, or generic accessory. Only change the environment, background, lighting, hand placement, camera angle, and scene context. The final image must show the SAME physical product from the reference image.`
    : `\n\nPRODUCT CONSISTENCY WARNING: No reference image is available. Keep the product as described; do not invent labels, brands, screens, ports, or a different product type.`;
  return `${prompt}${lock}`;
}

function filenameFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    return `${uuidv4()}${ext || '.jpg'}`;
  } catch {
    return `${uuidv4()}.jpg`;
  }
}

async function downloadGeneratedImages(urls: string[], reference: string, product: any, imgType: any, prompt: string, imageIndex: number) {
  ensureUploadDir();
  const db = getDatabase();
  const downloaded: string[] = [];

  for (const url of urls) {
    const imgResp = await fetch(url);
    if (!imgResp.ok) continue;

    const fileName = filenameFromUrl(url);
    const filePath = path.join(UPLOAD_DIR, fileName);
    const buffer = Buffer.from(await imgResp.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    downloaded.push(fileName);

    const maxIdx = db.prepare('SELECT MAX(image_index) as mx FROM product_images WHERE product_id = ?').get(product.id) as any;
    const newIdx = (maxIdx?.mx || 0) + 1;
    const exportName = `ai_${imgType.id}_${reference}_${newIdx}.jpg`;
    const role = newIdx === 1 ? 'main' : 'gallery';

    db.prepare(`
      INSERT INTO product_images (product_id, original_name, export_name, image_index, role, mime_type, status, local_path, alt)
      VALUES (?, ?, ?, ?, ?, 'image/jpeg', 'ai_generated', ?, ?)
    `).run(product.id, `ai_${imgType.id}_${fileName}`, exportName, newIdx, role, filePath, prompt.substring(0, 220));
  }

  return downloaded;
}

async function generateWithKie(generator: KieImageGenerator, model: KieModel, prompt: string, referenceImageDataUrl?: string) {
  if (referenceImageDataUrl) {
    if (model === 'gpt-image-2-image-to-image') {
      return generator.gptImage2ImageToImage({ prompt, inputUrls: [referenceImageDataUrl], aspectRatio: '1:1' });
    }
    return generator.nanoBanana2({ prompt, imageUrls: [referenceImageDataUrl], aspectRatio: '1:1', outputFormat: 'png' });
  }

  if (model === 'gpt-image-2-text-to-image') {
    return generator.gptImage2TextToImage({ prompt, aspectRatio: '1:1' });
  }
  return generator.nanoBanana2({ prompt, aspectRatio: '1:1', outputFormat: 'png' });
}

router.get('/preview-prompts/:reference', (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const product = getProductForImage(reference);
    if (!product) return res.status(404).json({ success: false, error: '商品不存在' });

    const { rendered } = renderProductPrompts(product);
    const referenceImage = getReferenceImage(product.id);
    const lockedRendered = Object.fromEntries(
      Object.entries(rendered).map(([key, value]) => [key, buildReferenceLockedPrompt(value, !!referenceImage)])
    ) as Record<string, string>;
    res.json({ success: true, data: lockedRendered });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 为商品生成 AI 图片：先稳定生成提示词；配置可用时再调用真实图片 API；成功后写入商品图库。
router.post('/generate/:reference', async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const db = getDatabase();
    const product = db.prepare('SELECT * FROM products WHERE reference = ?').get(reference) as any;
    if (!product) return res.status(404).json({ success: false, error: '商品不存在' });

    const { config, rendered } = renderProductPrompts(product);
    const referenceImage = getReferenceImage(product.id);
    const referenceImageDataUrl = referenceImage ? imageFileToDataUrl(referenceImage.local_path) : undefined;
    const lockedRendered = Object.fromEntries(
      Object.entries(rendered).map(([key, value]) => [key, buildReferenceLockedPrompt(value, !!referenceImage)])
    ) as Record<string, string>;
    const basePromptResults = promptResults(lockedRendered);

    if (!config.enabled) {
      return res.json({
        success: true,
        message: '图片 API 未启用：已生成提示词，未调用外部生图接口。',
        data: {
          reference,
          mode: 'prompt_only',
          images: basePromptResults,
          prompts: lockedRendered,
        },
      });
    }

    const kieConfig = loadKieConfig();
    if (!kieConfig || config.provider !== 'kie') {
      return res.json({
        success: true,
        message: '当前图片 API 尚未接入真实生成：已生成提示词。请选择 KIE 并填写 API Key 后生成真实图片。',
        data: {
          reference,
          mode: 'prompt_only',
          config: { provider: config.provider, model: config.model, size: config.size },
          images: basePromptResults,
          prompts: lockedRendered,
        },
      });
    }

    const generator = new KieImageGenerator(kieConfig);
    const generated: any[] = [];

    for (const [index, imgType] of IMAGE_TYPES.entries()) {
      const prompt = lockedRendered[imgType.id] || '';
      try {
        const imgUrls = await generateWithKie(generator, kieConfig.model, prompt, referenceImageDataUrl);
        const files = await downloadGeneratedImages(imgUrls, reference, product, imgType, prompt, index + 1);
        generated.push({
          type: imgType.id,
          label: imgType.label,
          prompt,
          status: files.length > 0 ? 'generated' : 'failed',
          imageUrls: files,
          imageIndex: index + 1,
        });
      } catch (genErr: any) {
        generated.push({
          type: imgType.id,
          label: imgType.label,
          prompt,
          status: 'failed',
          error: genErr.message,
          imageUrls: [],
          imageIndex: index + 1,
        });
      }
    }

    const successCount = generated.filter(g => g.status === 'generated').length;
    db.prepare(`
      UPDATE products SET status = CASE
        WHEN ? > 0 THEN 'AI图片已生成'
        WHEN status LIKE 'AI%' THEN status
        ELSE 'AI示意图待确认'
      END, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(successCount, product.id);

    db.prepare(`
      INSERT INTO api_logs (provider, type, model, reference, status, created_at)
      VALUES (?, 'image_generation', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(config.provider, config.model, reference, successCount > 0 ? 'success' : 'failed');

    res.json({
      success: true,
      message: successCount > 0
        ? `成功生成 ${successCount}/${generated.length} 张 AI 图片，并已写入商品图库。`
        : '提示词已生成，但真实图片生成失败。请检查 KIE API Key、余额或模型。',
      data: {
        reference,
        mode: successCount > 0 ? 'generated' : 'failed_with_prompts',
        config: { provider: config.provider, model: config.model, size: config.size },
        images: generated,
        prompts: lockedRendered,
      },
    });
  } catch (error: any) {
    console.error('AI image generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;