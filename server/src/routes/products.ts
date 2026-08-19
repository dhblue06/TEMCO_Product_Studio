import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/database';

const router = Router();

// 获取商品列表（支持筛选、搜索、分页）
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const {
      search,
      status,
      category,
      upload_status,
      page = '1',
      pageSize = '50',
      brand,
      dateFilter,
      refs,
      websiteStatus,
      sortBy = 'updated_at',
      sortOrder = 'DESC'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(pageSize as string, 10) || 50));
    const offset = (pageNum - 1) * limit;

    let whereClauses: string[] = ['1=1'];
    let params: any[] = [];

    if (search) {
      whereClauses.push('(p.reference LIKE ? OR p.name LIKE ? OR p.category LIKE ? OR p.model LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (status) {
      if (status === '已上传图片') {
        // 动态状态：有图片但无西语文案
        whereClauses.push('p.id IN (SELECT DISTINCT product_id FROM product_images)');
        whereClauses.push('p.id NOT IN (SELECT product_id FROM product_contents WHERE lang = \'es\' AND name IS NOT NULL AND name != \'\')');
        whereClauses.push("(p.status IS NULL OR p.status != '已下架')");
      } else {
        whereClauses.push('p.status = ?');
        params.push(status);
      }
    }

    if (category) {
      whereClauses.push('p.category = ?');
      params.push(category);
    }

    if (upload_status) {
      whereClauses.push('p.upload_status = ?');
      params.push(upload_status);
    }

    if (brand) {
      whereClauses.push('p.brand = ?');
      params.push(brand);
    }

    if (dateFilter) {
      // dateFilter 格式: YYYY-MM-DD，比较日期部分
      whereClauses.push("date(p.updated_at) = ?");
      params.push(dateFilter);
    }

    if (refs) {
      const refList = (refs as string).split(',').map(r => r.trim()).filter(Boolean);
      if (refList.length > 0) {
        whereClauses.push(`p.reference IN (${refList.map(() => '?').join(',')})`);
        params.push(...refList);
      }
    }

    const allowedSortColumns = ['reference', 'name', 'category', 'status', 'updated_at', 'created_at'];
    const column = allowedSortColumns.includes(sortBy as string) ? sortBy as string : 'updated_at';
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const whereSQL = whereClauses.join(' AND ');

    // 获取总数
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM products p WHERE ${whereSQL}`).get(...params) as any;
    const total = countRow.total;

    // 获取商品列表（含西语和中文内容）
    const products = db.prepare(`
      SELECT 
        p.*,
        es.name as es_name,
        es.description_short as es_description_short,
        es.description as es_description,
        es.seo_title as es_seo_title,
        es.seo_description as es_seo_description,
        es.friendly_url as es_friendly_url,
        es.image_alt as es_image_alt,
        zh.name as zh_name,
        zh.description_short as zh_description_short,
        zh.description as zh_description,
        (SELECT COUNT(*) FROM product_images WHERE product_id = p.id) as image_count,
        (SELECT COUNT(*) FROM product_images WHERE product_id = p.id AND (image_slot = 'main_product' OR role = 'main_product')) as main_image_count,
        (SELECT COUNT(*) FROM product_videos WHERE product_id = p.id) as video_count,
        (SELECT
          CASE
            WHEN MAX(CASE WHEN pwm.match_status = 'matched' AND pwm.is_on_website = 1 THEN 1 ELSE 0 END) = 1 THEN 'on'
            WHEN MAX(CASE WHEN pwm.match_status = 'conflict' THEN 1 ELSE 0 END) = 1 THEN 'conflict'
            WHEN pib.id IS NOT NULL THEN 'off'
            ELSE 'unknown'
          END
          FROM product_website_matches pwm
          JOIN prestashop_import_batches pib ON pib.id = pwm.batch_id AND pib.is_current = 1 AND pib.status = 'completed'
          WHERE pwm.product_id = p.id
        ) as website_status,
        (SELECT pps.prestashop_id FROM product_website_matches pwm
          JOIN prestashop_product_snapshots pps ON pps.id = pwm.snapshot_id
          JOIN prestashop_import_batches pib ON pib.id = pwm.batch_id AND pib.is_current = 1
          WHERE pwm.product_id = p.id AND pwm.match_status = 'matched' LIMIT 1
        ) as website_prestashop_id
      FROM products p
      LEFT JOIN product_contents es ON p.id = es.product_id AND es.lang = 'es'
      LEFT JOIN product_contents zh ON p.id = zh.product_id AND zh.lang = 'zh'
      WHERE ${whereSQL}
      ORDER BY p.${column} ${order}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // 动态计算状态
    const productsWithStatus = products.map((p: any) => {
      const hasMainImage = p.main_image_count > 0 || (db.prepare(
        "SELECT COUNT(*) as c FROM product_images WHERE product_id = ? AND (image_slot = 'main_product' OR role = 'main_product')"
      ).get(p.id) as any).c > 0;
      const hasESPacking = (db.prepare("SELECT COUNT(*) as c FROM product_images WHERE product_id = ? AND image_slot = 'packaging'").get(p.id) as any).c > 0;
      const hasScene1 = (db.prepare("SELECT COUNT(*) as c FROM product_images WHERE product_id = ? AND image_slot = 'scene1'").get(p.id) as any).c > 0;
      const hasESName = !!p.es_name;
      const hasSEOTitle = !!p.es_seo_title;
      const hasSEODesc = !!p.es_seo_description;
      const hasPsId = !!p.prestashop_id;
      const psSynced = p.prestashop_sync_status === 'synced';

      const dbStatus = p.status || '';
      const hasAnyImage = p.image_count > 0;
      let computedStatus = '待处理';
      if (hasAnyImage && !hasESName) computedStatus = '已上传图片';
      else if (hasMainImage) computedStatus = '已匹配图片';
      if (hasESName && !hasSEOTitle) computedStatus = '双语文案待生成';
      if (hasESName && hasSEOTitle && !hasSEODesc) computedStatus = '西语文案待审核';
      if (hasESName) computedStatus = '双语文案已生成';
      if (hasSEOTitle && hasSEODesc) computedStatus = 'SEO通过';
      if (hasPsId && psSynced) {
        if (hasAnyImage && !hasESName) computedStatus = '已上传图片';
        else if (hasAnyImage) computedStatus = '已上传';
        else computedStatus = '已上传';
      }
      else if (hasPsId) {
        if (hasAnyImage && !hasESName) computedStatus = '已上传图片';
        else if (hasAnyImage) computedStatus = '已上传';
      }
      if (dbStatus === '已下架') computedStatus = '已下架';

      return { ...p, dynamicStatus: computedStatus };
    });

    res.json({
      success: true,
      data: {
        products: productsWithStatus,
        pagination: {
          page: pageNum,
          pageSize: limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error: any) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个商品详情
router.get('/:reference', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { reference } = req.params;

    const product = db.prepare(`
      SELECT * FROM products WHERE reference = ?
    `).get(reference) as any;

    if (!product) {
      return res.status(404).json({ success: false, error: '商品不存在' });
    }

    // 获取双语内容
    const contents = db.prepare(`
      SELECT * FROM product_contents WHERE product_id = ?
    `).all(product.id) as any[];

    const content: any = { es: null, zh: null };
    for (const c of contents) {
      content[c.lang] = {
        name: c.name,
        descriptionShort: c.description_short,
        description: c.description,
        seoTitle: c.seo_title,
        seoDescription: c.seo_description,
        friendlyUrl: c.friendly_url,
        imageAlt: c.image_alt,
        galleryImageAlts: JSON.parse(c.gallery_image_alts || '[]'),
        whatsappCopy: c.whatsapp_copy,
        videoScript: c.video_script,
      };
    }

    // 获取图片
    const images = db.prepare(`
      SELECT * FROM product_images WHERE product_id = ? ORDER BY image_index ASC
    `).all(product.id);

    // 获取视频
    const video = db.prepare(`
      SELECT * FROM product_videos WHERE product_id = ?
    `).get(product.id) || null;

    res.json({
      success: true,
      data: {
        ...product,
        content,
        images,
        video,
        sheetRawData: JSON.parse(product.sheet_raw_data || '{}'),
      }
    });
  } catch (error: any) {
    console.error('Error fetching product:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建新商品
router.post('/', (req: Request, res: Response) => {
  try {
    const { reference, name, category, brand } = req.body;
    if (!reference || !reference.trim()) {
      return res.status(400).json({ success: false, error: 'Reference 不能为空' });
    }

    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM products WHERE reference = ?').get(reference.trim());
    if (existing) {
      return res.status(400).json({ success: false, error: `Reference "${reference}" 已存在` });
    }

    const result = db.prepare(`
      INSERT INTO products (reference, name, category, brand, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, '待处理', datetime('now'), datetime('now'))
    `).run(reference.trim(), name || '', category || '', brand || '');

    res.json({
      success: true,
      message: `商品 ${reference} 创建成功`,
      data: { id: result.lastInsertRowid, reference: reference.trim() },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新商品字段
router.patch('/:reference', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { reference } = req.params;
    const updates = req.body;

    const product = db.prepare('SELECT * FROM products WHERE reference = ?').get(reference) as any;
    if (!product) {
      return res.status(404).json({ success: false, error: '商品不存在' });
    }

    // 更新主表字段
    const allowedFields = ['name', 'category', 'brand', 'model', 'selling_points', 'product_intro', 'status', 'upload_status', 'prestashop_id', 'video_url', 'ean13', 'upc', 'mpn', 'price', 'wholesale_price', 'quantity'];
    const productUpdates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        productUpdates[field] = updates[field];
      }
    }

    if (Object.keys(productUpdates).length > 0) {
      productUpdates.updated_at = new Date().toISOString();
      const setClauses = Object.keys(productUpdates).map(k => `${k} = ?`).join(', ');
      const values = Object.values(productUpdates);
      db.prepare(`UPDATE products SET ${setClauses} WHERE reference = ?`).run(...values, reference);
    }

    // 更新内容表
    if (updates.content) {
      const now = new Date().toISOString();
      for (const lang of ['es', 'zh']) {
        const langContent = updates.content[lang];
        if (!langContent) continue;

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
            langContent.name || '',
            langContent.descriptionShort || '',
            langContent.description || '',
            langContent.seoTitle || '',
            langContent.seoDescription || '',
            langContent.friendlyUrl || '',
            langContent.imageAlt || '',
            JSON.stringify(langContent.galleryImageAlts || []),
            langContent.whatsappCopy || '',
            langContent.videoScript || '',
            now,
            product.id,
            lang
          );
        } else {
          db.prepare(`
            INSERT INTO product_contents 
              (product_id, lang, name, description_short, description, seo_title, seo_description, 
               friendly_url, image_alt, gallery_image_alts, whatsapp_copy, video_script, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            product.id,
            lang,
            langContent.name || '',
            langContent.descriptionShort || '',
            langContent.description || '',
            langContent.seoTitle || '',
            langContent.seoDescription || '',
            langContent.friendlyUrl || '',
            langContent.imageAlt || '',
            JSON.stringify(langContent.galleryImageAlts || []),
            langContent.whatsappCopy || '',
            langContent.videoScript || '',
            now
          );
        }
      }
    }

    res.json({ success: true, message: '商品更新成功' });
  } catch (error: any) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量更新商品状态
router.post('/batch-status', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { references, status } = req.body;

    if (!Array.isArray(references) || references.length === 0 || !status) {
      return res.status(400).json({ success: false, error: '请提供商品编号列表和目标状态' });
    }

    const now = new Date().toISOString();
    const updateStmt = db.prepare('UPDATE products SET status = ?, updated_at = ? WHERE reference = ?');

    const updateMany = db.transaction((refs: string[]) => {
      for (const ref of refs) {
        updateStmt.run(status, now, ref);
      }
    });

    updateMany(references);

    res.json({
      success: true,
      message: `已更新 ${references.length} 个商品状态为 ${status}`
    });
  } catch (error: any) {
    console.error('Error batch updating status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量更新商品分类
router.post('/batch-category', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { references, category } = req.body;

    if (!Array.isArray(references) || references.length === 0 || category === undefined || category === null) {
      return res.status(400).json({ success: false, error: '请提供商品编号列表和目标分类' });
    }

    const now = new Date().toISOString();
    const updateStmt = db.prepare('UPDATE products SET category = ?, updated_at = ? WHERE reference = ?');

    const updateMany = db.transaction((refs: string[]) => {
      for (const ref of refs) {
        updateStmt.run(category, now, ref);
      }
    });

    updateMany(references);

    res.json({
      success: true,
      message: `已更新 ${references.length} 个商品分类为 ${category || '(空)'}`
    });
  } catch (error: any) {
    console.error('Error batch updating category:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除商品
router.delete('/:reference', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { reference } = req.params;

    const product = db.prepare('SELECT id FROM products WHERE reference = ?').get(reference) as any;
    if (!product) {
      return res.status(404).json({ success: false, error: '商品不存在' });
    }

    // 级联删除关联数据（外键 ON DELETE CASCADE）
    db.prepare('DELETE FROM products WHERE id = ?').run(product.id);

    res.json({ success: true, message: `商品 ${reference} 已删除` });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量删除商品
router.post('/batch-delete', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { references } = req.body;

    if (!Array.isArray(references) || references.length === 0) {
      return res.status(400).json({ success: false, error: '请提供商品编号列表' });
    }

    const deleteStmt = db.prepare('DELETE FROM products WHERE reference = ?');
    const deleteMany = db.transaction((refs: string[]) => {
      for (const ref of refs) {
        deleteStmt.run(ref);
      }
    });

    deleteMany(references);

    res.json({
      success: true,
      message: `已删除 ${references.length} 个商品`
    });
  } catch (error: any) {
    console.error('Error batch deleting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有可用分类
router.get('/meta/categories', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const categories = db.prepare(
      "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' ORDER BY category ASC"
    ).all();
    res.json({ success: true, data: categories.map((c: any) => c.category) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有可用品牌
router.get('/meta/brands', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const brands = db.prepare(
      "SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != '' ORDER BY brand ASC"
    ).all();
    res.json({ success: true, data: brands.map((b: any) => b.brand) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取状态统计数据
router.get('/meta/statistics', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const total = (db.prepare('SELECT COUNT(*) as count FROM products').get() as any).count;
    const statusStats = db.prepare(
      'SELECT status, COUNT(*) as count FROM products GROUP BY status ORDER BY count DESC'
    ).all() as Array<{ status: string; count: number }>;

    // 动态计算"已上传图片"数量：有图片但无西语文案（匹配动态状态逻辑）
    const hasImageNoContent = (db.prepare(`
      SELECT COUNT(*) as count FROM products p
      WHERE (p.status IS NULL OR p.status != '已下架')
      AND p.id IN (SELECT DISTINCT product_id FROM product_images)
      AND p.id NOT IN (SELECT product_id FROM product_contents WHERE lang = 'es' AND name IS NOT NULL AND name != '')
    `).get() as any).count || 0;

    // 合并到 statusStats（如果"已上传图片"已存在则覆盖，否则追加）
    const existing = statusStats.find((s: any) => s.status === '已上传图片');
    if (existing) {
      existing.count = hasImageNoContent;
    } else {
      statusStats.push({ status: '已上传图片', count: hasImageNoContent });
    }
    const uploadStats = db.prepare(
      'SELECT upload_status, COUNT(*) as count FROM products GROUP BY upload_status ORDER BY count DESC'
    ).all() as Array<{ upload_status: string; count: number }>;

    res.json({
      success: true,
      data: { total, statusStats, uploadStats }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
