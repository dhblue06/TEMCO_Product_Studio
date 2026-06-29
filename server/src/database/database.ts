import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../data/temco.db');

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initializeDatabase(): void {
  const db = getDatabase();

  db.exec(`
    -- 商品主表
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      prestashop_id TEXT DEFAULT '',
      name TEXT DEFAULT '',
      category TEXT DEFAULT '',
      brand TEXT DEFAULT 'TEMCO',
      model TEXT DEFAULT '',
      selling_points TEXT DEFAULT '',
      product_intro TEXT DEFAULT '',
      status TEXT DEFAULT '待处理',
      upload_status TEXT DEFAULT '未上传',
      sheet_raw_data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 商品内容表（双语）
    CREATE TABLE IF NOT EXISTS product_contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      lang TEXT NOT NULL CHECK(lang IN ('es', 'zh')),
      name TEXT DEFAULT '',
      description_short TEXT DEFAULT '',
      description TEXT DEFAULT '',
      seo_title TEXT DEFAULT '',
      seo_description TEXT DEFAULT '',
      friendly_url TEXT DEFAULT '',
      image_alt TEXT DEFAULT '',
      gallery_image_alts TEXT DEFAULT '[]',
      whatsapp_copy TEXT DEFAULT '',
      video_script TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(product_id, lang)
    );

    -- 图片表
    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      drive_id TEXT DEFAULT '',
      original_name TEXT DEFAULT '',
      export_name TEXT DEFAULT '',
      image_index INTEGER DEFAULT 0,
      role TEXT DEFAULT 'gallery' CHECK(role IN ('main', 'gallery')),
      mime_type TEXT DEFAULT 'image/jpeg',
      web_view_link TEXT DEFAULT '',
      thumbnail_link TEXT DEFAULT '',
      alt TEXT DEFAULT '',
      status TEXT DEFAULT 'ok',
      local_path TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- 视频表
    CREATE TABLE IF NOT EXISTS product_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL UNIQUE,
      drive_id TEXT DEFAULT '',
      name TEXT DEFAULT '',
      web_view_link TEXT DEFAULT '',
      local_path TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- Google Drive 素材匹配日志
    CREATE TABLE IF NOT EXISTS drive_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      asset_type TEXT NOT NULL CHECK(asset_type IN ('image', 'video', 'folder')),
      drive_id TEXT DEFAULT '',
      name TEXT DEFAULT '',
      web_view_link TEXT DEFAULT '',
      match_status TEXT DEFAULT 'pending',
      issue TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    -- API 设置表
    CREATE TABLE IF NOT EXISTS api_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 日志表
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT DEFAULT '',
      type TEXT DEFAULT '',
      model TEXT DEFAULT '',
      reference TEXT DEFAULT '',
      status TEXT DEFAULT '',
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      cost_estimate REAL DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      error TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 导出记录表
    CREATE TABLE IF NOT EXISTS export_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      export_type TEXT NOT NULL CHECK(export_type IN ('prestashop_csv', 'review_csv')),
      product_count INTEGER DEFAULT 0,
      file_path TEXT DEFAULT '',
      status TEXT DEFAULT 'success',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 批量限制设置表
    CREATE TABLE IF NOT EXISTS batch_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT ''
    );

    -- 创建索引
    CREATE INDEX IF NOT EXISTS idx_products_reference ON products(reference);
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_product_contents_product_id ON product_contents(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
    CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at);
  `);


  const ensureColumn = (table: string, column: string, definition: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === column)) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
  };

  ensureColumn('products', 'selling_points', `TEXT DEFAULT ''`);
  ensureColumn('products', 'product_intro', `TEXT DEFAULT ''`);
  // 初始化默认设置
  const insertDefaultSetting = (key: string, value: string) => {
    db.prepare('INSERT OR IGNORE INTO api_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(key, value);
  };

  insertDefaultSetting('copy_provider', 'deepseek');
  insertDefaultSetting('copy_api_base_url', 'https://api.deepseek.com');
  insertDefaultSetting('copy_api_key', '');
  insertDefaultSetting('copy_model', 'deepseek-chat');
  insertDefaultSetting('copy_temperature', '0.3');
  insertDefaultSetting('copy_max_tokens', '4000');

  
  insertDefaultSetting('article_provider', 'deepseek');
  insertDefaultSetting('article_api_base_url', 'https://api.deepseek.com');
  insertDefaultSetting('article_api_key', '');
  insertDefaultSetting('article_model', 'deepseek-chat');
  insertDefaultSetting('article_temperature', '0.5');
  insertDefaultSetting('article_max_tokens', '6000');

  insertDefaultSetting('image_provider', 'disabled');
  insertDefaultSetting('image_api_base_url', '');
  insertDefaultSetting('image_api_key', '');
  insertDefaultSetting('image_model', '');
  insertDefaultSetting('image_size', '1024x1024');
  insertDefaultSetting('image_style', 'ecommerce_white_background');

  insertDefaultSetting('google_sheet_url', 'https://docs.google.com/spreadsheets/d/10C954V-_NJU7dCO9M7Ts1pLudCk8F8BrhCXcsRqT12M/edit?gid=0#gid=0');
  insertDefaultSetting('google_sheet_mode', 'public_csv');
  insertDefaultSetting('google_drive_mode', 'api');
  insertDefaultSetting('google_api_key', '');
  insertDefaultSetting('google_access_token', '');

  insertDefaultSetting('prestashop_enabled', 'false');
  insertDefaultSetting('prestashop_base_url', 'https://www.temco.es');
  insertDefaultSetting('prestashop_api_key', '');
  insertDefaultSetting('prestashop_language_id', '');
  insertDefaultSetting('prestashop_upload_mode', 'csv_only');

  // 批量限制默认值
  insertDefaultSetting('batch_copy_limit', '50');
  insertDefaultSetting('batch_image_limit', '10');
  insertDefaultSetting('require_review_before_export', 'true');

  console.log('Database initialized successfully.');
}


