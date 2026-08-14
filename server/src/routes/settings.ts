import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/database';

const router = Router();

const ALLOWED_SETTINGS = new Set([
  'copy_provider', 'copy_api_base_url', 'copy_api_key', 'copy_model', 'copy_temperature', 'copy_max_tokens',
  'article_provider', 'article_api_base_url', 'article_api_key', 'article_model', 'article_temperature', 'article_max_tokens',
  'image_provider', 'image_api_base_url', 'image_api_key', 'image_model', 'image_size', 'image_style',
  'google_sheet_url', 'google_sheet_mode', 'google_drive_mode', 'google_api_key', 'google_access_token',
  'prestashop_enabled', 'prestashop_base_url', 'prestashop_api_key', 'prestashop_language_id', 'prestashop_upload_mode',
  'prestashop_default_lang_id', 'prestashop_spanish_lang_id', 'prestashop_chinese_lang_id',
  'prestashop_default_category_id', 'prestashop_default_manufacturer_id', 'prestashop_default_shop_id',
  'prestashop_video_mode', 'prestashop_image_sync_mode', 'prestashop_batch_limit',
  'category_image_upload_enabled', 'category_image_api_path', 'category_image_method_override',
  'category_image_concurrency', 'category_image_timeout_seconds', 'category_image_retry_limit',
  'category_image_jpeg_quality', 'category_image_max_size', 'category_image_dir',
  'category_upload_batch_limit', 'category_image_max_file_size_mb',
  'ftp_host', 'ftp_port', 'ftp_username', 'ftp_password', 'ftp_category_image_dir',
  'batch_copy_limit', 'batch_image_limit', 'require_review_before_export',
  'scan_input_path',
  'mobile_capture_enabled', 'mobile_capture_pin', 'mobile_capture_dir', 'mobile_capture_max_file_mb',
  'mobile_capture_max_images_per_product', 'mobile_capture_jpeg_quality', 'mobile_capture_max_dimension',
  'mobile_capture_allow_audio', 'mobile_capture_audio_max_seconds', 'mobile_capture_duplicate_check',
  'mobile_capture_require_photo', 'mobile_capture_require_color_for_single',
  'mobile_capture_auto_push_mapping', 'mobile_capture_retention_days', 'mobile_capture_offline_enabled',
]);

const SENSITIVE_KEYS = new Set([
  'copy_api_key', 'article_api_key', 'image_api_key', 'google_api_key', 'google_access_token', 'prestashop_api_key',
]);

// 获取所有 API 设置
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const settings = db.prepare('SELECT key, value FROM api_settings').all() as any[];

    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = SENSITIVE_KEYS.has(s.key) ? maskSensitiveValue(s.value) : s.value;
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 测试文案/图片/文章 API 配置
router.post('/test/:section', async (req: Request, res: Response) => {
  try {
    const { section } = req.params;
    if (!['copy', 'image', 'article'].includes(section)) {
      return res.status(400).json({ success: false, error: '无效的测试类型' });
    }

    if (section === 'image') {
      const result = await testImageApi();
      return res.json({ success: true, message: result.message, data: result.data });
    }

    const result = await testChatApi(section as 'copy' | 'article');
    res.json({ success: true, message: result.message, data: result.data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新单个设置
router.patch('/:key', (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!ALLOWED_SETTINGS.has(key)) {
      return res.status(400).json({ success: false, error: '无效的设置项' });
    }

    if (SENSITIVE_KEYS.has(key) && isMaskedValue(value)) {
      return res.json({ success: true, message: '设置未变化' });
    }

    upsertSetting(key, value ?? '');
    res.json({ success: true, message: '设置已更新' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量更新设置
router.put('/batch', (req: Request, res: Response) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: '请提供 settings 对象' });
    }

    const entries = Object.entries(settings).filter(([key, value]) => {
      if (!ALLOWED_SETTINGS.has(key)) return false;
      if (SENSITIVE_KEYS.has(key) && isMaskedValue(value)) return false;
      return true;
    }) as [string, string][];

    const db = getDatabase();
    const updateMany = db.transaction((items: [string, string][]) => {
      for (const [key, value] of items) {
        upsertSetting(key, value ?? '');
      }
    });

    updateMany(entries);
    res.json({ success: true, message: '设置已批量更新' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取批量限制设置
router.get('/batch-limits', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const settings = db.prepare("SELECT key, value FROM batch_settings").all() as any[];
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function getSetting(key: string): string {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any;
  return row?.value || '';
}

function upsertSetting(key: string, value: string): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO api_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
}

async function testChatApi(section: 'copy' | 'article') {
  const provider = getSetting(`${section}_provider`) || 'template';
  const apiKey = getSetting(`${section}_api_key`);
  const baseUrl = getSetting(`${section}_api_base_url`) || 'https://api.deepseek.com';
  const model = getSetting(`${section}_model`) || 'deepseek-chat';
  const temperature = Number(getSetting(`${section}_temperature`) || '0.3');
  const maxTokens = Number(getSetting(`${section}_max_tokens`) || '1000');

  if (provider === 'template') {
    return { message: '当前使用本地模板模式，不需要 API Key', data: { provider, mode: 'template' } };
  }
  if (!apiKey) {
    throw new Error('请先填写 API Key');
  }

  const apiBaseUrl = provider === 'deepseek' ? 'https://api.deepseek.com' : baseUrl.replace(/\/$/, '');
  const response = await fetch(`${apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Return only JSON.' },
        { role: 'user', content: 'Return {"ok":true,"message":"connected"}' },
      ],
      temperature,
      max_tokens: Math.min(maxTokens, 200),
    }),
  });

  if (!response.ok) {
    throw new Error(`API 测试失败: HTTP ${response.status} - ${await response.text()}`);
  }

  return { message: 'API 连接测试成功', data: { provider, model } };
}

async function testImageApi() {
  const provider = getSetting('image_provider') || 'disabled';
  const apiKey = getSetting('image_api_key');
  const baseUrl = getSetting('image_api_base_url') || 'https://api.openai.com/v1';
  const model = getSetting('image_model') || '';

  if (provider === 'disabled') {
    return { message: '图片生成当前关闭，不会调用外部 API', data: { provider, mode: 'disabled' } };
  }
  if (!apiKey) {
    throw new Error('请先填写图片 API Key');
  }

  // KIE 的任务创建接口会真实消耗额度；后台测试只做配置完整性检查，不提交生图任务。
  if (provider === 'kie') {
    return {
      message: 'KIE 配置已保存。为避免消耗额度，测试按钮不提交真实生图任务；请用单个商品生成进行真实验证。',
      data: { provider, mode: 'kie', model: model || 'nano-banana-2' },
    };
  }

  // OpenAI-compatible API 测试：检查 /models
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`图片 API 测试失败: HTTP ${response.status} - ${await response.text()}`);
  }

  return { message: '图片 API 连接测试成功（未生成图片）', data: { provider, model } };
}

function maskSensitiveValue(value: string): string {
  if (!value || value.length < 8) return value;
  const prefix = value.substring(0, 3);
  const suffix = value.substring(value.length - 4);
  return `${prefix}****${suffix}`;
}

function isMaskedValue(value: unknown): boolean {
  return typeof value === 'string' && value.includes('****');
}

export default router;
