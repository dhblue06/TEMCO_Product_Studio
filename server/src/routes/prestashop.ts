import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/database';
import { PrestaShopClient } from '../services/prestashop/prestashopClient';
import { validateProduct } from '../services/prestashop/prestashopValidator';
import { syncProductByRef, SyncResult } from '../services/prestashop/productSyncService';
import { syncSingleImage, syncImagesByProductRef } from '../services/prestashop/imageSyncService';

const router = Router();

// 获取设置中指定 key 的值
function getSetting(key: string): string {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any;
  return row?.value || '';
}

// 构建配置对象
function loadConfig() {
  return {
    baseUrl: getSetting('prestashop_base_url') || 'https://temcostar.com',
    apiKey: getSetting('prestashop_api_key') || '',
    defaultLangId: getSetting('prestashop_default_lang_id') || getSetting('prestashop_language_id') || '1',
    spanishLangId: getSetting('prestashop_spanish_lang_id') || '1',
    chineseLangId: getSetting('prestashop_chinese_lang_id') || '',
    defaultCategoryId: getSetting('prestashop_default_category_id') || '3',
    defaultManufacturerId: getSetting('prestashop_default_manufacturer_id') || '1',
    defaultShopId: getSetting('prestashop_default_shop_id') || '1',
  };
}

// GET /api/prestashop/config - 获取配置
router.get('/config', (req: Request, res: Response) => {
  try {
    const config = loadConfig();
    res.json({
      success: true,
      data: {
        ...config,
        apiKey: config.apiKey
          ? config.apiKey.substring(0, 4) + '****' + config.apiKey.substring(config.apiKey.length - 4)
          : '',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/prestashop/config - 保存配置
router.patch('/config', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const updates = req.body;
    const allowed = [
      'prestashop_base_url', 'prestashop_api_key',
      'prestashop_default_lang_id', 'prestashop_spanish_lang_id', 'prestashop_chinese_lang_id',
      'prestashop_default_category_id', 'prestashop_default_manufacturer_id',
      'prestashop_default_shop_id', 'prestashop_video_mode',
      'prestashop_image_sync_mode', 'prestashop_batch_limit',
    ];

    const stmt = db.prepare(`
      INSERT INTO api_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    const batch = db.transaction(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (allowed.includes(key)) {
          stmt.run(key, String(value));
        }
      }
    });
    batch();

    res.json({ success: true, message: 'PrestaShop 配置已保存' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/prestashop/test-connection - 测试连接
router.get('/test-connection', async (req: Request, res: Response) => {
  try {
    const config = loadConfig();
    if (!config.apiKey) {
      return res.json({ success: false, message: '请先配置 PrestaShop API Key' });
    }
    const client = new PrestaShopClient(config);
    const result = await client.testConnection();
    res.json(result);
  } catch (error: any) {
    res.json({ success: false, message: error.message });
  }
});

// GET /api/prestashop/languages - 读取语言列表
router.get('/languages', async (req: Request, res: Response) => {
  try {
    const client = new PrestaShopClient(loadConfig());
    const languages = await client.getLanguages();
    res.json({ success: true, data: languages });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/prestashop/categories - 读取分类列表
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const client = new PrestaShopClient(loadConfig());
    const categories = await client.getCategories();
    res.json({ success: true, data: categories });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/prestashop/manufacturers - 读取品牌列表
router.get('/manufacturers', async (req: Request, res: Response) => {
  try {
    const client = new PrestaShopClient(loadConfig());
    const manufacturers = await client.getManufacturers();
    console.log('[PrestaShop] Manufacturers result:', JSON.stringify(manufacturers).substring(0, 200));
    res.json({ success: true, data: manufacturers });
  } catch (error: any) {
    console.error('[PrestaShop] Manufacturers error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/prestashop/shops - 读取店铺列表
router.get('/shops', async (req: Request, res: Response) => {
  try {
    const client = new PrestaShopClient(loadConfig());
    const shops = await client.getShops();
    res.json({ success: true, data: shops });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/prestashop/validate-product/:ref - 同步前校验
router.get('/validate-product/:ref', (req: Request, res: Response) => {
  try {
    const result = validateProduct(req.params.ref);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, canSync: false, errors: [error.message], warnings: [] });
  }
});

// POST /api/prestashop/sync-all-prices - 批量同步所有有价格的商品到 PrestaShop
router.post('/sync-all-prices', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const products = db.prepare(
      "SELECT reference, price, wholesale_price, prestashop_id FROM products WHERE price > 0 AND prestashop_id IS NOT NULL"
    ).all() as any[];

    const { syncProductByRef } = require('../services/prestashop/productSyncService');
    let updated = 0;
    let failed = 0;

    for (const p of products) {
      try {
        const result = await syncProductByRef(p.reference, {
          syncContent: false,
          syncSeo: false,
          syncCategory: false,
          syncBrand: false,
          syncImages: false,
          syncVideos: false,
          syncPrice: true,
          forceUpdate: true,
        });
        if (result.success) updated++; else failed++;
      } catch {
        failed++;
      }
    }

    res.json({
      success: true,
      message: `价格同步完成：成功 ${updated}，失败 ${failed}`,
      data: { updated, failed, total: products.length },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/prestashop/sync-product/:ref - 同步商品到 PrestaShop
router.post('/sync-product/:ref', async (req: Request, res: Response) => {
  try {
    const options = {
      syncContent: req.body.syncContent !== false,
      syncSeo: req.body.syncSeo !== false,
      syncCategory: req.body.syncCategory !== false,
      syncBrand: req.body.syncBrand !== false,
      syncImages: req.body.syncImages === true,
      syncVideos: req.body.syncVideos === true,
      syncPrice: req.body.syncPrice === true,
      syncStock: req.body.syncStock === true,
      forceUpdate: req.body.forceUpdate === true,
    };
    const result = await syncProductByRef(req.params.ref, options);
    res.json({ success: result.success, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/prestashop/toggle-active/:ref - 激活/停用商品
router.post('/toggle-active/:ref', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    const db = getDatabase();

    const psBaseUrl = (db.prepare("SELECT value FROM api_settings WHERE key = 'prestashop_base_url'").get() as any)?.value || 'https://temcostar.com';
    const psApiKey = (db.prepare("SELECT value FROM api_settings WHERE key = 'prestashop_api_key'").get() as any)?.value || '';
    const product = db.prepare('SELECT reference, prestashop_id FROM products WHERE reference = ?').get(ref) as any;

    if (!product || !product.prestashop_id) {
      return res.status(404).json({ success: false, error: '商品未同步到 PrestaShop' });
    }

    // 1. 获取当前商品 XML
    const url = `${psBaseUrl}/api/products/${product.prestashop_id}?ws_key=${psApiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) return res.status(400).json({ success: false, error: `PrestaShop API ${resp.status}` });

    const xml = await resp.text();

    // 2. 提取当前 active 值并取反
    const activeMatch = xml.match(/<active(?:[^>]*)>(?:<!\[CDATA\[)?([01])(?:\]\]>)?<\/active>/);
    if (!activeMatch) return res.status(400).json({ success: false, error: '无法读取商品状态' });

    const currentActive = activeMatch[1];
    const newActive = currentActive === '1' ? '0' : '1';

    // 3. 替换 active 值
    let modified = xml.replace(/(<active[^>]*>)(?:<!\[CDATA\[)?[01](?:\]\]>)?(<\/active>)/, `$1${newActive}$2`);

    // 4. 移除只读字段
    const readOnlyFields = ['manufacturer_name', 'supplier_name', 'category_name', 'position_in_category', 'position', 'id_default_image', 'quantity', 'nb_products_recursive'];
    for (const field of readOnlyFields) {
      modified = modified.replace(new RegExp(`\\s*<${field}[^>]*>.*?<\\/${field}>\\s*`, 'gs'), '\n');
    }

    // 5. PUT 回 PrestaShop
    const putResp = await fetch(`${psBaseUrl}/api/products/${product.prestashop_id}?ws_key=${psApiKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/xml' },
      body: modified,
    });

    if (!putResp.ok) {
      const errText = await putResp.text();
      const errMsg = errText.replace(/<[^>]*>/g, ' ').substring(0, 200).trim();
      return res.status(400).json({ success: false, error: `PrestaShop 返回错误: ${errMsg}` });
    }

    res.json({
      success: true,
      message: newActive === '1' ? '商品已激活' : '商品已停用',
      data: { prestashopId: product.prestashop_id, newActive },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/prestashop/sync-image/:imgId - 同步单张图片
router.post('/sync-image/:imgId', async (req: Request, res: Response) => {
  try {
    const imageMode = req.body.imageMode || 'skipExists';
    const result = await syncSingleImage(Number(req.params.imgId), imageMode);
    res.json({ success: result.status === 'synced', data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/prestashop/sync-images/:ref - 同步商品全部图片
router.post('/sync-images/:ref', async (req: Request, res: Response) => {
  try {
    const imageMode = req.body.imageMode || 'skipExists';
    const result = await syncImagesByProductRef(req.params.ref, imageMode);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/prestashop/check-alt/:reference - 检查 PrestaShop 商品图片是否有 ALT
router.get('/check-alt/:ref', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    const db = getDatabase();

    const baseUrl = (db.prepare("SELECT value FROM api_settings WHERE key = 'prestashop_base_url'").get() as any)?.value || 'https://temcostar.com';
    const apiKey = (db.prepare("SELECT value FROM api_settings WHERE key = 'prestashop_api_key'").get() as any)?.value || '';

    const product = db.prepare('SELECT prestashop_id FROM products WHERE reference = ?').get(ref) as any;
    if (!product || !product.prestashop_id) {
      return res.status(404).json({ success: false, error: '商品未同步到 PrestaShop' });
    }

    // 查询 PrestaShop 获取该商品的所有图片及 legend (ALT)
    const { XMLParser } = require('fast-xml-parser');
    const parser = new XMLParser({ ignoreAttributes: false });

    const psId = product.prestashop_id;
    const response = await fetch(`${baseUrl}/api/images/products/${psId}?ws_key=${apiKey}`);
    if (!response.ok) {
      return res.status(400).json({ success: false, error: `PrestaShop API ${response.status}` });
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);
    const images = parsed?.prestashop?.image || [];
    const imgList = Array.isArray(images) ? images : [images];

    // 每个图片查询 legend
    const results: any[] = [];
    for (const img of imgList) {
      const imgId = img.id || img['@_id'];
      try {
        const imgResp = await fetch(`${baseUrl}/api/images/products/${psId}/${imgId}?ws_key=${apiKey}`);
        if (imgResp.ok) {
          const imgXml = await imgResp.text();
          const imgParsed = parser.parse(imgXml);
          const imgData = imgParsed?.prestashop?.image;
          const legend = imgData?.legend || '';
          const legends = imgData?.legend?.language || [];
          const legendTexts = Array.isArray(legends) ? legends.map((l: any) => l['#text'] || l).join('; ') : (legends?.['#text'] || '');
          results.push({ imageId: imgId, hasAlt: !!legendTexts, alt: legendTexts || '' });
        }
      } catch {
        results.push({ imageId: imgId, hasAlt: false, alt: '(查询失败)' });
      }
    }

    const withAlt = results.filter(r => r.hasAlt).length;
    res.json({
      success: true,
      data: {
        reference: ref,
        prestashopId: psId,
        totalImages: results.length,
        withAlt,
        withoutAlt: results.length - withAlt,
        details: results,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
