import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/database';

const UPLOAD_DIR = path.join(__dirname, '../../data/uploads');

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 获取产品独立文件夹路径
function getProductFolder(reference: string): string {
  // 清理参考号中的特殊字符作为文件夹名
  const folderName = reference.replace(/[<>:"/\\|?*]/g, '_').trim();
  return path.join(UPLOAD_DIR, folderName);
}

// 确保产品文件夹存在
function ensureProductFolder(reference: string): string {
  const folder = getProductFolder(reference);
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  return folder;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // 从请求参数中获取 reference（兼容 params 和 body）
    const ref = req.params?.reference || (req.body as any)?.reference || 'shared';
    const folder = ensureProductFolder(ref);
    cb(null, folder);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('仅支持 JPG/PNG/WEBP 格式'));
  },
});

const router = Router();

const IMAGE_STATUSES = new Set(['ok', 'white_bg', 'scene', 'processed', 'ai_generated']);
function getUploadStatus(raw: unknown): string {
  const status = typeof raw === 'string' ? raw : 'ok';
  return IMAGE_STATUSES.has(status) ? status : 'ok';
}

function getUploadRole(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const trimmed = raw.trim();
  // 接受任何非空字符串作为角色
  return trimmed;
}

function deleteLocalUpload(localPath?: string | null): void {
  if (!localPath) return;
  const uploadRoot = path.resolve(UPLOAD_DIR);
  const resolved = path.resolve(localPath);
  if (resolved !== uploadRoot && !resolved.startsWith(uploadRoot + path.sep)) return;
  if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
}

function localImageToDataUrl(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function lockPromptToReferenceImage(prompt: string): string {
  return `${prompt}\n\nREFERENCE IMAGE LOCK: Use the provided input image as the exact product identity. Preserve the same product silhouette, proportions, color, finish, logo placement, LED/display position, ports, cables, buttons, seams, corners, scale, and all visible details. Do not replace it with another charger, power bank, package, or generic accessory. Only change the environment, background, lighting, hand placement, camera angle, and scene context. The final image must show the SAME physical product from the reference image.`;
}

// 上传图片到商品
router.post('/upload/:reference', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const db = getDatabase();

    const product = db.prepare('SELECT id, category FROM products WHERE reference = ?').get(reference) as any;
    if (!product) {
      // 删除已上传的文件
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, error: '商品不存在' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: '请选择要上传的图片' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;

    // 获取当前图片的最大序号
    const maxIdx = db.prepare(`
      SELECT MAX(image_index) as max_idx FROM product_images WHERE product_id = ?
    `).get(product.id) as any;
    const newIndex = (maxIdx?.max_idx || 0) + 1;

    // 生成 SEO 导出名
    const { createExportImageName } = require('../services/imageProcessor');
    const category = product.category || 'producto';
    const exportName = createExportImageName(reference, category, newIndex);

    const uploadStatus = getUploadStatus(req.body?.status);
    const requestedRole = getUploadRole(req.body?.role);
    const role = requestedRole || (newIndex === 1 ? 'main' : 'gallery');

    if (role === 'main') {
      db.prepare('UPDATE product_images SET role = ? WHERE product_id = ?').run('gallery', product.id);
    }

    // 写入数据库
    const result = db.prepare(`
      INSERT INTO product_images (product_id, original_name, export_name, image_index, role, mime_type, status, local_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(product.id, originalName, exportName, newIndex, role, `image/${path.extname(originalName).slice(1)}`, uploadStatus, filePath);

    res.json({
      success: true,
      message: `图片 ${originalName} 上传成功`,
      data: {
        id: result.lastInsertRowid,
        originalName,
        exportName,
        index: newIndex,
        role,
        status: uploadStatus,
        localPath: filePath,
      },
    });
  } catch (error: any) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量上传图片
router.post('/upload-batch/:reference', upload.array('images', 10), async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const db = getDatabase();

    const product = db.prepare('SELECT id, category FROM products WHERE reference = ?').get(reference) as any;
    if (!product) {
      if (req.files) (req.files as Express.Multer.File[]).forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
      return res.status(404).json({ success: false, error: '商品不存在' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: '请选择要上传的图片' });
    }

    // 获取当前最大序号
    const maxIdx = db.prepare(`
      SELECT MAX(image_index) as max_idx FROM product_images WHERE product_id = ?
    `).get(product.id) as any;
    let startIndex = (maxIdx?.max_idx || 0) + 1;

    const { createExportImageName } = require('../services/imageProcessor');
    const category = product.category || 'producto';
    const results: any[] = [];
    const uploadStatus = getUploadStatus(req.body?.status);
    const requestedRole = getUploadRole(req.body?.role);

    for (const file of files) {
      const exportName = createExportImageName(reference, category, startIndex);
      const role = requestedRole || 'gallery';
      if (role === 'main') {
        db.prepare('UPDATE product_images SET role = ? WHERE product_id = ?').run('gallery', product.id);
      }
      const imgResult = db.prepare(`
        INSERT INTO product_images (product_id, original_name, export_name, image_index, role, mime_type, status, local_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(product.id, file.originalname, exportName, startIndex, role, `image/${path.extname(file.originalname).slice(1)}`, uploadStatus, file.path);

      results.push({
        id: imgResult.lastInsertRowid,
        originalName: file.originalname,
        exportName,
        index: startIndex,
        role,
        status: uploadStatus,
      });
      startIndex++;
    }

    res.json({
      success: true,
      message: `成功上传 ${files.length} 张图片`,
      data: results,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 根据上传的图片生成白底图
router.post('/white-bg/:reference/:imageId', async (req: Request, res: Response) => {
  try {
    const { reference, imageId } = req.params;
    const db = getDatabase();

    const image = db.prepare(`
      SELECT pi.*, p.reference, p.name, p.category, p.selling_points, p.product_intro FROM product_images pi
      JOIN products p ON pi.product_id = p.id
      WHERE pi.id = ? AND p.reference = ?
    `).get(imageId, reference) as any;

    if (!image) {
      return res.status(404).json({ success: false, error: '图片不存在' });
    }

    if (!image.local_path || !fs.existsSync(image.local_path)) {
      return res.status(400).json({ success: false, error: '原始图片文件不存在，请先上传' });
    }

    // 用 sharp 生成白底图，保存到产品文件夹
    const productFolder = getProductFolder(reference);
    const outputFileName = `wb_${path.basename(image.local_path)}`;
    const outputPath = path.join(productFolder, outputFileName);

    await sharp(image.local_path)
      .resize(1000, 1000, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    // 创建新图片记录（保留原图）
    const maxIdx = db.prepare(
      'SELECT MAX(image_index) as mx FROM product_images WHERE product_id = ?'
    ).get(image.product_id) as any;
    const newIdx = (maxIdx?.mx || 0) + 1;
    const exportName = `wb_${image.export_name || image.original_name}`;

    db.prepare(`
      INSERT INTO product_images (product_id, original_name, export_name, image_index, role, mime_type, status, local_path)
      VALUES (?, ?, ?, ?, 'gallery', 'image/jpeg', 'white_bg', ?)
    `).run(image.product_id, `wb_${image.original_name}`, exportName, newIdx, outputPath);

    res.json({
      success: true,
      message: '白底图生成成功',
      data: {
        originalName: `wb_${image.original_name}`,
        exportName,
        whiteBgPath: outputPath,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 根据上传的图片生成使用场景图
router.post('/scene/:reference/:imageId', async (req: Request, res: Response) => {
  try {
    const { reference, imageId } = req.params;
    const { sceneType } = req.body;
    const db = getDatabase();

    const image = db.prepare(`
      SELECT pi.*, p.reference, p.name, p.category, p.selling_points, p.product_intro FROM product_images pi
      JOIN products p ON pi.product_id = p.id
      WHERE pi.id = ? AND p.reference = ?
    `).get(imageId, reference) as any;

    if (!image) {
      return res.status(404).json({ success: false, error: '图片不存在' });
    }

    // 读取 AI 图片配置中的场景提示词
    const { renderPrompt, loadImageConfig } = require('../services/imageGenerator/types');
    const config = loadImageConfig();
    const promptKey = sceneType || 'scene1';
    const template = config.prompts[promptKey] || config.prompts.scene1;
    const category = image.category || 'producto';
    const basePrompt = renderPrompt(template, reference, category, {
      sellingPoints: image.selling_points || '',
      productIntro: image.product_intro || '',
      name: image.name || '',
    });
    const hasReferenceImage = !!(image.local_path && fs.existsSync(image.local_path));
    const prompt = hasReferenceImage ? lockPromptToReferenceImage(basePrompt) : basePrompt;

    // 检查是否配置了 KIE API
    const { loadKieConfig, KieImageGenerator } = require('../services/imageGenerator/kieGenerator');
    const kieConfig = loadKieConfig();

    if (kieConfig && config.enabled) {
      // 用 KIE 实际生成场景图
      try {
        const generator = new KieImageGenerator(kieConfig);
        const uploadsDir = path.join(__dirname, '../../data/uploads');

        let imgUrls: string[] = [];
        if (hasReferenceImage) {
          const imageInput = localImageToDataUrl(image.local_path);
          if (kieConfig.model === 'gpt-image-2-image-to-image') {
            imgUrls = await generator.gptImage2ImageToImage({
              prompt,
              inputUrls: [imageInput],
              aspectRatio: '1:1',
            });
          } else {
            imgUrls = await generator.nanoBanana2({
              prompt,
              imageUrls: [imageInput],
              aspectRatio: '1:1',
              outputFormat: 'png',
            });
          }
        } else {
          imgUrls = await generator.nanoBanana2({
            prompt,
            aspectRatio: '1:1',
            outputFormat: 'png',
          });
        }

        // 下载生成的图片到产品文件夹
        const downloadedFiles: string[] = [];
        const productFolder = getProductFolder(reference);

        for (const url of imgUrls) {
          try {
            const imgResp = await fetch(url);
            if (imgResp.ok) {
              const ext = '.jpg';
              const fileName = `scene_${promptKey}_${uuidv4()}${ext}`;
              const filePath = path.join(productFolder, fileName);
              const buffer = Buffer.from(await imgResp.arrayBuffer());
              fs.writeFileSync(filePath, buffer);
              downloadedFiles.push(fileName);

              // 写入数据库
              const { createExportImageName } = require('../services/imageProcessor');
              const maxIdx = db.prepare(
                'SELECT MAX(image_index) as mx FROM product_images WHERE product_id = ?'
              ).get(image.product_id) as any;
              const newIdx = (maxIdx?.mx || 0) + 1;

              db.prepare(`
                INSERT INTO product_images (product_id, original_name, export_name, image_index, role, mime_type, status, local_path, alt)
                VALUES (?, ?, ?, ?, 'gallery', 'image/jpeg', 'scene', ?, ?)
              `).run(image.product_id, `scene_${promptKey}.jpg`, `scene_${promptKey}_${reference}.jpg`, newIdx, filePath, prompt.substring(0, 200));
            }
          } catch (dlErr) {
            console.warn(`[Scene] Download failed:`, dlErr);
          }
        }

        return res.json({
          success: true,
          message: `场景图已通过 KIE 生成，下载了 ${downloadedFiles.length} 张图片`,
          data: { reference, sceneType: promptKey, prompt, generatedFiles: downloadedFiles },
        });
      } catch (kieErr: any) {
        console.error('[Scene] KIE generation failed:', kieErr.message);
        // KIE 失败时：用 sharp 对原图做一些基本处理
        try {
          if (image.local_path && fs.existsSync(image.local_path)) {
            const sceneFileName = `scene_${promptKey}_${path.basename(image.local_path)}`;
            const sceneFilePath = path.join(UPLOAD_DIR, sceneFileName);
            
            // 用 sharp 做基本变换（调整亮度、添加轻微效果）
            const sharp = require('sharp');
            await sharp(image.local_path)
              .modulate({ brightness: promptKey === 'scene1' ? 1.05 : promptKey === 'scene2' ? 0.95 : 1.0 })
              .jpeg({ quality: 92 })
              .toFile(sceneFilePath);

            const maxIdx = db.prepare(
              'SELECT MAX(image_index) as mx FROM product_images WHERE product_id = ?'
            ).get(image.product_id) as any;
            const newIdx = (maxIdx?.mx || 0) + 1;

            db.prepare(`
              INSERT INTO product_images (product_id, original_name, export_name, image_index, role, mime_type, status, local_path, alt)
              VALUES (?, ?, ?, ?, 'gallery', 'image/jpeg', 'scene', ?, ?)
            `).run(image.product_id, sceneFileName, `scene_${promptKey}_${reference}.jpg`, newIdx, sceneFilePath, prompt.substring(0, 200));

            return res.json({
              success: true,
              message: `场景图已生成（KIE 余额不足，使用原图调整作为预览），${promptKey}`,
              data: { reference, sceneType: promptKey, prompt, generatedFiles: [sceneFileName] },
            });
          }
        } catch (copyErr) {
          console.error('[Scene] Sharp fallback failed:', copyErr);
        }

        return res.json({
          success: true,
          message: `场景图提示词已生成（KIE 余额不足，请到 https://kie.ai 充值）`,
          data: { reference, imageId: image.id, sceneType: promptKey, prompt },
        });
      }
    }

    // 没有 KIE 配置：用 sharp 处理原图作为场景占位图
    try {
      if (image.local_path && fs.existsSync(image.local_path)) {
        const sceneFileName = `scene_${promptKey}_${path.basename(image.local_path)}`;
        const sceneFilePath = path.join(UPLOAD_DIR, sceneFileName);
        
        const sharp = require('sharp');
        await sharp(image.local_path)
          .modulate({ brightness: promptKey === 'scene1' ? 1.05 : promptKey === 'scene2' ? 0.95 : 1.0 })
          .jpeg({ quality: 92 })
          .toFile(sceneFilePath);

        const maxIdx = db.prepare(
          'SELECT MAX(image_index) as mx FROM product_images WHERE product_id = ?'
        ).get(image.product_id) as any;
        const newIdx = (maxIdx?.mx || 0) + 1;

        db.prepare(`
          INSERT INTO product_images (product_id, original_name, export_name, image_index, role, mime_type, status, local_path, alt)
          VALUES (?, ?, ?, ?, 'gallery', 'image/jpeg', 'scene', ?, ?)
        `).run(image.product_id, sceneFileName, `scene_${promptKey}_${reference}.jpg`, newIdx, sceneFilePath, prompt.substring(0, 200));

        return res.json({
          success: true,
          message: `场景预览图已生成（配置 KIE 并充值后可生成真实场景图）`,
          data: { reference, sceneType: promptKey, prompt, generatedFiles: [sceneFileName] },
        });
      }
    } catch (copyErr) {
      console.error('[Scene] Sharp fallback failed:', copyErr);
    }

    res.json({
      success: true,
      message: `场景图提示词已生成（配置 KIE API Key 并充值后可自动生成图片）`,
      data: { reference, imageId: image.id, sceneType: promptKey, prompt },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新图片信息
router.patch('/image/:imageId', (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;
    const db = getDatabase();
    const image = db.prepare('SELECT * FROM product_images WHERE id = ?').get(imageId) as any;
    if (!image) return res.status(404).json({ success: false, error: '图片不存在' });

    const updates = req.body || {};
    const allowedFields = ['original_name', 'export_name', 'alt', 'image_index', 'status', 'role'];
    const imageUpdates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (updates[field] === undefined) continue;
      if (field === 'role') {
        const role = getUploadRole(updates[field]);
        if (!role) continue;
        imageUpdates.role = role;
      } else if (field === 'status') {
        imageUpdates.status = getUploadStatus(updates[field]);
      } else if (field === 'image_index') {
        const idx = Number(updates[field]);
        if (Number.isFinite(idx) && idx > 0) imageUpdates.image_index = Math.round(idx);
      } else {
        imageUpdates[field] = String(updates[field] ?? '').trim();
      }
    }

    if (imageUpdates.role === 'main') {
      db.prepare('UPDATE product_images SET role = ? WHERE product_id = ? AND id != ?').run('gallery', image.product_id, image.id);
    }

    if (Object.keys(imageUpdates).length > 0) {
      const setClauses = Object.keys(imageUpdates).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE product_images SET ${setClauses} WHERE id = ?`).run(...Object.values(imageUpdates), image.id);
    }

    const updated = db.prepare('SELECT * FROM product_images WHERE id = ?').get(image.id);
    res.json({ success: true, message: '图片信息已保存', data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除单张商品图片，同时删除本地上传目录里的对应文件
router.delete('/image/:imageId', (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;
    const db = getDatabase();
    const image = db.prepare('SELECT * FROM product_images WHERE id = ?').get(imageId) as any;
    if (!image) return res.status(404).json({ success: false, error: '图片不存在' });

    db.prepare('DELETE FROM product_images WHERE id = ?').run(image.id);
    deleteLocalUpload(image.local_path);

    if (image.role === 'main') {
      const nextImage = db.prepare(
        'SELECT id FROM product_images WHERE product_id = ? ORDER BY image_index ASC LIMIT 1'
      ).get(image.product_id) as any;
      if (nextImage) db.prepare('UPDATE product_images SET role = ? WHERE id = ?').run('main', nextImage.id);
    }

    res.json({ success: true, message: '图片已删除' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取商品图片（含本地文件）
router.get('/product/:reference', (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const db = getDatabase();

    const product = db.prepare('SELECT id FROM products WHERE reference = ?').get(reference) as any;
    if (!product) return res.status(404).json({ success: false, error: '商品不存在' });

    const images = db.prepare(`
      SELECT * FROM product_images WHERE product_id = ? ORDER BY image_index ASC
    `).all(product.id);

    res.json({ success: true, data: images });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 列出上传文件夹中的文件（必须先于 /file/:filename 注册）
router.get('/files/list', (_req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR)
      .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(UPLOAD_DIR, f));
        return {
          name: f,
          size: stat.size,
          sizeKB: Math.round(stat.size / 1024),
          modified: stat.mtime,
          url: `/api/upload/file/${encodeURIComponent(f)}`,
        };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime())
      .slice(0, 200);

    res.json({ success: true, data: { files, total: files.length, folderPath: UPLOAD_DIR } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 图片文件夹浏览器（HTML 页面）
router.get('/files/browse', (_req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR)
      .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .sort((a, b) => {
        const sa = fs.statSync(path.join(UPLOAD_DIR, a));
        const sb = fs.statSync(path.join(UPLOAD_DIR, b));
        return sb.mtime.getTime() - sa.mtime.getTime();
      })
      .slice(0, 200);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>图片文件夹</title>
<style>
body{font-family:sans-serif;background:#1a1a2e;color:#ccc;margin:0;padding:20px}
h1{color:white;font-size:18px;margin-bottom:16px}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.item{background:#2a2a3e;border-radius:8px;overflow:hidden;text-align:center}
.item img{width:100%;height:140px;object-fit:cover;display:block}
.item .info{padding:6px 8px;font-size:11px;color:#aaa;word-break:break-all}
.item .info .name{color:#8be9fd;margin-bottom:2px}
a{color:#8be9fd;text-decoration:none}
.stats{margin-bottom:12px;font-size:13px;color:#666}
</style></head><body>
<h1>📂 图片文件夹</h1>
<div class="stats">${UPLOAD_DIR} · 共 ${files.length} 个文件</div>
<div class="gallery">${files.map(f => {
  const stat = fs.statSync(path.join(UPLOAD_DIR, f));
  const sizeKB = Math.round(stat.size / 1024);
  const time = stat.mtime.toLocaleString();
  return `<div class="item">
    <a href="/api/upload/file/${encodeURIComponent(f)}" target="_blank">
      <img src="/api/upload/file/${encodeURIComponent(f)}" loading="lazy" onerror="this.alt='加载失败'">
    </a>
    <div class="info">
      <div class="name">${f}</div>
      <div>${sizeKB}KB · ${time}</div>
    </div>
  </div>`;
}).join('')}</div></body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error: any) {
    res.status(500).send(`<h1>Error</h1><pre>${error.message}</pre>`);
  }
});

// 列出产品文件夹内的文件
router.get('/files/product/:reference', (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const folder = getProductFolder(reference);
    const accept = (req.headers.accept as string) || '';

    // 浏览器直接访问返回 HTML 页面
    if (accept.includes('text/html')) {
      const files: { name: string; sizeKB: number; time: string }[] = [];
      if (fs.existsSync(folder)) {
        const names = fs.readdirSync(folder)
          .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
          .sort((a, b) => { const sa = fs.statSync(path.join(folder, a)); const sb = fs.statSync(path.join(folder, b)); return sb.mtime.getTime() - sa.mtime.getTime(); });
        for (const name of names) {
          const stat = fs.statSync(path.join(folder, name));
          files.push({ name, sizeKB: Math.round(stat.size / 1024), time: stat.mtime.toLocaleString() });
        }
      }
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>📂 ${reference}</title><style>body{font-family:sans-serif;background:#1a1a2e;color:#ccc;margin:0;padding:20px}h1{color:white;font-size:18px;margin-bottom:4px}h2{color:#666;font-size:13px;font-weight:normal;margin-bottom:16px}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}.item{background:#2a2a3e;border-radius:8px;overflow:hidden;text-align:center}.item img{width:100%;height:140px;object-fit:cover;display:block}.item .info{padding:6px 8px;font-size:11px;color:#aaa;word-break:break-all}.item .info .name{color:#8be9fd}.empty{text-align:center;padding:40px;color:#666}.btn{display:inline-block;background:#444;color:#8be9fd;padding:6px 14px;border-radius:4px;font-size:13px;margin-bottom:16px;margin-right:8px}</style></head><body><h1>📂 ${reference}</h1><h2>${folder}</h2><a class="btn" href="javascript:history.back()">← 返回</a><a class="btn" href="/api/upload/files/browse">全部图片</a>${files.length === 0 ? '<div class="empty"><div class="empty" style="font-size:48px">📂</div>该产品文件夹为空</div>' : `<div style="margin:0 0 10px;font-size:13px;color:#666">共 ${files.length} 个文件</div><div class="gallery">${files.map(f => `<div class="item"><a href="/api/upload/file/product/${encodeURIComponent(reference)}/${encodeURIComponent(f.name)}" target="_blank"><img src="/api/upload/file/product/${encodeURIComponent(reference)}/${encodeURIComponent(f.name)}" loading="lazy" onerror="this.alt='加载失败'"></a><div class="info"><div class="name">${f.name}</div><div>${f.sizeKB}KB · ${f.time}</div></div></div>`).join('')}</div>`}</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    if (!fs.existsSync(folder)) {
      return res.json({ success: true, data: { reference, files: [], folderPath: folder } });
    }

    const files = fs.readdirSync(folder)
      .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(folder, f));
        return {
          name: f,
          size: stat.size,
          sizeKB: Math.round(stat.size / 1024),
          modified: stat.mtime,
          url: `/api/upload/file/product/${encodeURIComponent(reference)}/${encodeURIComponent(f)}`,
        };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());

    res.json({ success: true, data: { reference, files, total: files.length, folderPath: folder } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 提供产品文件夹内文件的访问
router.get('/file/product/:reference/:filename', (req: Request, res: Response) => {
  const { reference, filename } = req.params;
  const folder = getProductFolder(reference);
  const safeName = path.basename(filename);
  const filePath = path.join(folder, safeName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '文件不存在' });
  }
  res.sendFile(filePath);
});

// 打开 Windows 资源管理器中的产品文件夹（支持 GET 和 POST）
router.all('/open-folder/:reference', (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const folder = getProductFolder(reference);
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    // 在 Windows 上使用 explorer 打开文件夹
    const { exec } = require('child_process');
    exec(`cmd /c start "" "${folder}"`, (err: any) => {
      if (err) {
        console.error('打开文件夹失败:', err.message);
        // 返回错误 HTML 页面
        return res.status(500).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>打开失败</title><style>body{font-family:sans-serif;background:#1a1a2e;color:#ccc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}div{max-width:400px}.error{color:#e74c3c;font-size:48px;margin-bottom:12px}</style></head><body><div><div class="error">❌</div><h2>打开文件夹失败</h2><p style="color:#888">${err.message}</p><button onclick="history.back()" style="background:#444;color:#8be9fd;border:none;padding:8px 20px;border-radius:4px;cursor:pointer">← 返回</button></div></body></html>`);
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件夹已打开</title><style>body{font-family:sans-serif;background:#1a1a2e;color:#ccc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}div{max-width:400px}.ok{font-size:64px;margin-bottom:12px}.path{color:#888;font-size:12px;word-break:break-all;margin-top:12px}button{background:#444;color:#8be9fd;border:none;padding:8px 20px;border-radius:4px;cursor:pointer}</style></head><body><div><div class="ok">📂</div><h2>文件夹已打开</h2><p>Windows 资源管理器已弹出</p><p class="path">${folder}</p><button onclick="window.close()" style="margin-top:16px">关闭此页</button></div></body></html>`);
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 验证产品文件夹中的图片文件是否存在
router.post("/verify-images/:reference", (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const db = getDatabase();
    const product = db.prepare("SELECT id FROM products WHERE reference = ?").get(reference) as any;
    if (!product) return res.status(404).json({ success: false, error: "商品不存在" });

    const images = db.prepare("SELECT * FROM product_images WHERE product_id = ?").all(product.id) as any[];
    const folder = getProductFolder(reference);
    let deleted = 0;
    let valid = 0;

    for (const img of images) {
      if (!img.local_path || !fs.existsSync(img.local_path)) {
        // 删除数据库中已不存在的图片记录
        db.prepare("DELETE FROM product_images WHERE id = ?").run(img.id);
        deleted++;
      } else {
        valid++;
      }
    }

    // 更新主图状态
    const mainCount = db.prepare("SELECT COUNT(*) as c FROM product_images WHERE product_id = ? AND role = ?").get(product.id, "main_product") as any;
    const imgCount = db.prepare("SELECT COUNT(*) as c FROM product_images WHERE product_id = ?").get(product.id) as any;

    res.json({
      success: true,
      message: `验证完成，删除 ${deleted} 条失效记录，保留 ${valid} 条`,
      data: { deleted, valid, remainingImages: imgCount.c, hasMainImage: mainCount.c > 0 },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 导出产品数据到产品文件夹
router.post('/export-data/:reference', (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const db = getDatabase();
    const product = db.prepare(`
      SELECT p.*, es.*, zh.* FROM products p
      LEFT JOIN product_contents es ON p.id = es.product_id AND es.lang = 'es'
      LEFT JOIN product_contents zh ON p.id = zh.product_id AND zh.lang = 'zh'
      WHERE p.reference = ?
    `).get(reference) as any;

    if (!product) return res.status(404).json({ success: false, error: '商品不存在' });

    const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY image_index').all(product.id);
    const folder = ensureProductFolder(reference);

    // 导出 JSON 数据
    const jsonPath = path.join(folder, `${reference}_data.json`);
    fs.writeFileSync(jsonPath, JSON.stringify({ product, images }, null, 2), 'utf-8');

    // 导出 CSV 数据（简化版）
    const csvPath = path.join(folder, `${reference}_data.csv`);
    const csvLines: string[] = [];
    csvLines.push('Field,Value_ES,Value_ZH');
    if (product.name) csvLines.push(`name,${product.name},${product.zh_name || ''}`);
    if (product.description) csvLines.push(`description,"${(product.description || '').replace(/"/g, '""')}","${(product.zh_description || '').replace(/"/g, '""')}"`);
    if (product.seo_title) csvLines.push(`seo_title,${product.seo_title},${product.zh_seo_title || ''}`);
    if (product.seo_description) csvLines.push(`seo_description,${product.seo_description},${product.zh_seo_description || ''}`);
    csvLines.push(`category,,${product.category}`);
    csvLines.push(`brand,,${product.brand}`);
    csvLines.push(`model,,${product.model}`);
    csvLines.push(`images,${images.length},`);
    images.forEach((img: any) => csvLines.push(`image_${img.image_index},${img.original_name},${img.export_name}`));
    fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');

    res.json({
      success: true,
      message: `数据已导出到产品文件夹`,
      data: { jsonPath, csvPath, folder },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 迁移旧图片到产品文件夹
router.post('/migrate-images/:reference', (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const db = getDatabase();
    const product = db.prepare('SELECT id FROM products WHERE reference = ?').get(reference) as any;
    if (!product) return res.status(404).json({ success: false, error: '商品不存在' });

    const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? AND local_path IS NOT NULL').all(product.id) as any[];
    const folder = ensureProductFolder(reference);
    let moved = 0;

    for (const img of images) {
      if (!img.local_path || !fs.existsSync(img.local_path)) continue;
      // 如果已经在产品文件夹中则跳过
      if (img.local_path.startsWith(folder)) continue;

      const oldPath = img.local_path;
      const newPath = path.join(folder, path.basename(oldPath));

      try {
        // 检查目标是否已存在，存在则跳过
        if (!fs.existsSync(newPath)) {
          fs.copyFileSync(oldPath, newPath);
        }
        // 更新数据库中的路径指向新位置
        db.prepare('UPDATE product_images SET local_path = ? WHERE id = ?').run(newPath, img.id);
        moved++;
      } catch (copyErr) {
        console.warn(`[Migrate] Failed to move ${img.id}:`, copyErr);
      }
    }

    res.json({
      success: true,
      message: `已迁移 ${moved}/${images.length} 张图片到产品文件夹`,
      data: { moved, total: images.length, folder },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 提供上传文件的访问 - 支持文件名和完整路径
router.get('/file/:filename', (req: Request, res: Response) => {
  const rawName = req.params.filename;
  const fileName = path.basename(rawName);
  const filePath = path.join(UPLOAD_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '文件不存在' });
  }
  res.sendFile(filePath);
});

export default router;
