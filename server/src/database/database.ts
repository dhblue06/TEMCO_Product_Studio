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

  ensureColumn('products', 'fixed_colors', `TEXT DEFAULT ''`); // JSON 数组：手机壳固定颜色（点货自动勾选）
  ensureColumn('products', 'product_intro', `TEXT DEFAULT ''`);
  ensureColumn('products', 'prestashop_sync_status', `TEXT DEFAULT ''`);
  ensureColumn('products', 'prestashop_last_sync_at', `TEXT DEFAULT ''`);
  ensureColumn('products', 'prestashop_last_error', `TEXT DEFAULT ''`);
  ensureColumn('products', 'prestashop_category_id', `TEXT DEFAULT ''`);
  ensureColumn('products', 'prestashop_manufacturer_id', `TEXT DEFAULT ''`);
  ensureColumn('products', 'prestashop_shop_id', `TEXT DEFAULT ''`);
  ensureColumn('products', 'video_url', `TEXT DEFAULT ''`);
  ensureColumn('products', 'ean13', `TEXT DEFAULT ''`);
  ensureColumn('products', 'upc', `TEXT DEFAULT ''`);
  ensureColumn('products', 'mpn', `TEXT DEFAULT ''`);
  ensureColumn('products', 'price', `REAL DEFAULT 0`);
  ensureColumn('products', 'quantity', `INTEGER DEFAULT 0`);
  ensureColumn('products', 'wholesale_price', `REAL DEFAULT 0`);
  ensureColumn('product_images', 'image_slot', `TEXT DEFAULT ''`);
  ensureColumn('product_images', 'prestashop_image_id', `TEXT DEFAULT ''`);
  ensureColumn('product_images', 'prestashop_sync_status', `TEXT DEFAULT ''`);
  ensureColumn('product_images', 'prestashop_last_sync_at', `TEXT DEFAULT ''`);
  ensureColumn('product_images', 'prestashop_last_error', `TEXT DEFAULT ''`);
  // v1.2 迁移：分类图片上传任务新增字段
  ensureColumn('category_image_upload_jobs', 'image_type', `TEXT DEFAULT 'cover'`);
  ensureColumn('category_image_upload_jobs', 'operation', `TEXT`);
  ensureColumn('category_image_upload_jobs', 'request_method', `TEXT`);
  // v1.3 产品图功能
  ensureColumn('products', 'serial_number', `TEXT DEFAULT ''`);
  ensureColumn('products', 'model', `TEXT DEFAULT ''`);
  ensureColumn('products', 'aliases', `TEXT DEFAULT ''`);
  ensureColumn('products', 'image_count', `INTEGER DEFAULT 0`);
  ensureColumn('mobile_captures', 'phone_models', `TEXT DEFAULT ''`);
  ensureColumn('products', 'sold_out', `INTEGER DEFAULT 0`);
  ensureColumn('products', 'sold_out_at', `TEXT DEFAULT ''`);
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
  insertDefaultSetting('prestashop_default_lang_id', '1');
  insertDefaultSetting('prestashop_spanish_lang_id', '1');
  insertDefaultSetting('prestashop_chinese_lang_id', '');
  insertDefaultSetting('prestashop_default_category_id', '3');
  insertDefaultSetting('prestashop_default_manufacturer_id', '1');
  insertDefaultSetting('prestashop_default_shop_id', '1');
  insertDefaultSetting('prestashop_video_mode', 'link');
  insertDefaultSetting('prestashop_image_sync_mode', 'skipExists');
  insertDefaultSetting('prestashop_batch_limit', '50');
  insertDefaultSetting('prestashop_upload_mode', 'csv_only');

  // 分类图片批量上传设置
  insertDefaultSetting('category_image_upload_enabled', 'true');
  insertDefaultSetting('category_image_api_path', '/api/images/categories');
  insertDefaultSetting('category_image_method_override', 'true');
  insertDefaultSetting('category_image_concurrency', '2');
  insertDefaultSetting('category_image_timeout_seconds', '60');
  insertDefaultSetting('category_image_retry_limit', '2');
  insertDefaultSetting('category_image_jpeg_quality', '92');
  insertDefaultSetting('category_image_max_size', '1600');
  insertDefaultSetting('category_image_dir', '');
  insertDefaultSetting('category_upload_batch_limit', '200');
  insertDefaultSetting('category_image_max_file_size_mb', '10');

  // FTP 缩略图上传设置
  insertDefaultSetting('ftp_host', '');
  insertDefaultSetting('ftp_port', '21');
  insertDefaultSetting('ftp_username', '');
  insertDefaultSetting('ftp_password', '');
  insertDefaultSetting('ftp_category_image_dir', '');

  // 产品图片上传设置
  insertDefaultSetting('product_image_upload_enabled', 'true');
  insertDefaultSetting('product_image_dir', '');
  insertDefaultSetting('product_image_concurrency', '2');
  insertDefaultSetting('product_image_retry_limit', '2');
  insertDefaultSetting('product_image_jpeg_quality', '92');
  insertDefaultSetting('product_image_max_size', '1600');
  insertDefaultSetting('product_image_max_file_size_mb', '10');
  insertDefaultSetting('product_image_batch_limit', '200');
  insertDefaultSetting('product_image_skip_uploaded', 'true');

  // 批量限制默认值
  insertDefaultSetting('batch_copy_limit', '50');
  insertDefaultSetting('batch_image_limit', '10');
  insertDefaultSetting('require_review_before_export', 'true');

  // === 导入批次表 ===
  db.exec(`CREATE TABLE IF NOT EXISTS prestashop_import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL DEFAULT 'csv', source_name TEXT,
    import_mode TEXT NOT NULL DEFAULT 'replace',
    activation_assumption TEXT NOT NULL DEFAULT 'active_only',
    total_rows INTEGER DEFAULT 0, valid_rows INTEGER DEFAULT 0,
    matched_rows INTEGER DEFAULT 0, unmatched_rows INTEGER DEFAULT 0,
    conflict_rows INTEGER DEFAULT 0, invalid_rows INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'processing',
    is_current INTEGER NOT NULL DEFAULT 0,
    updates_website_status INTEGER NOT NULL DEFAULT 1,
    delimiter TEXT, encoding TEXT, field_mapping TEXT, import_options TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT
  );`);

  // === 网站商品快照表 ===
  db.exec(`CREATE TABLE IF NOT EXISTS prestashop_product_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL, prestashop_id TEXT NOT NULL,
    image_url TEXT, website_name TEXT,
    reference TEXT NOT NULL, normalized_reference TEXT NOT NULL,
    website_category TEXT,
    price_tax_excl TEXT, price_tax_excl_value REAL,
    price_tax_incl TEXT, price_tax_incl_value REAL,
    quantity_text TEXT, quantity_value INTEGER,
    assumed_active INTEGER, raw_data TEXT, row_number INTEGER,
    validation_status TEXT DEFAULT 'valid', validation_errors TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(batch_id) REFERENCES prestashop_import_batches(id) ON DELETE CASCADE
  );`);

  // === 网站匹配关系表 ===
  db.exec(`CREATE TABLE IF NOT EXISTS product_website_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL, snapshot_id INTEGER NOT NULL, product_id INTEGER,
    match_status TEXT NOT NULL, match_method TEXT,
    confidence INTEGER DEFAULT 0, is_on_website INTEGER DEFAULT 0,
    local_reference TEXT, website_reference TEXT, conflict_details TEXT,
    matched_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(batch_id) REFERENCES prestashop_import_batches(id) ON DELETE CASCADE,
    FOREIGN KEY(snapshot_id) REFERENCES prestashop_product_snapshots(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
  );`);

  // 索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ps_batch_current ON prestashop_import_batches(is_current, status);
    CREATE INDEX IF NOT EXISTS idx_ps_snapshot_batch ON prestashop_product_snapshots(batch_id);
    CREATE INDEX IF NOT EXISTS idx_ps_snapshot_reference ON prestashop_product_snapshots(normalized_reference);
    CREATE INDEX IF NOT EXISTS idx_ps_snapshot_product_id ON prestashop_product_snapshots(prestashop_id);
    CREATE INDEX IF NOT EXISTS idx_ps_match_product ON product_website_matches(product_id);
    CREATE INDEX IF NOT EXISTS idx_ps_match_batch ON product_website_matches(batch_id);
    CREATE INDEX IF NOT EXISTS idx_ps_match_status ON product_website_matches(match_status);`);

  // === 分类图片批量上传模块 ===

  // 分类表
  db.exec(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prestashop_category_id INTEGER NOT NULL UNIQUE,
    parent_id INTEGER,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    full_path TEXT,
    active INTEGER DEFAULT 1,
    raw_data TEXT,
    synced_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );`);

  // 分类图片资产表
  db.exec(`CREATE TABLE IF NOT EXISTS category_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_path TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    normalized_filename TEXT NOT NULL,
    mime_type TEXT,
    extension TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    sha256 TEXT,
    ignored INTEGER DEFAULT 0,
    scanned_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );`);

  // 分类图片映射表
  db.exec(`CREATE TABLE IF NOT EXISTS category_image_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    category_image_id INTEGER NOT NULL,
    match_type TEXT NOT NULL CHECK(match_type IN ('manual','exact','alias','fuzzy')),
    confidence REAL DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('suggested','confirmed','rejected','ignored','conflict')),
    confirmed_by_user INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY(category_image_id) REFERENCES category_images(id) ON DELETE CASCADE,
    UNIQUE(category_id, category_image_id)
  );`);

  // 分类图片上传任务表
  db.exec(`CREATE TABLE IF NOT EXISTS category_image_upload_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    category_image_id INTEGER NOT NULL,
    image_type TEXT DEFAULT 'cover' CHECK(image_type IN ('cover','thumb')),
    status TEXT NOT NULL CHECK(status IN ('queued','processing','success','failed','cancelled','skipped')),
    operation TEXT,
    request_method TEXT,
    attempt_count INTEGER DEFAULT 0,
    http_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY(category_image_id) REFERENCES category_images(id) ON DELETE CASCADE
  );`);

  // 索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_categories_ps_id ON categories(prestashop_category_id);
    CREATE INDEX IF NOT EXISTS idx_categories_normalized_name ON categories(normalized_name);
    CREATE INDEX IF NOT EXISTS idx_category_images_normalized ON category_images(normalized_filename);
    CREATE INDEX IF NOT EXISTS idx_category_images_sha256 ON category_images(sha256);
    CREATE INDEX IF NOT EXISTS idx_cim_category ON category_image_mappings(category_id);
    CREATE INDEX IF NOT EXISTS idx_cim_image ON category_image_mappings(category_image_id);
    CREATE INDEX IF NOT EXISTS idx_cim_status ON category_image_mappings(status);
    CREATE INDEX IF NOT EXISTS idx_ciuj_batch ON category_image_upload_jobs(batch_id);
    CREATE INDEX IF NOT EXISTS idx_ciuj_status ON category_image_upload_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_ciuj_category_type ON category_image_upload_jobs(category_id, image_type);`);

  // === 产品图片批量上传模块 ===

  // 产品图片资产表
  db.exec(`CREATE TABLE IF NOT EXISTS product_scan_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_path TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    extension TEXT,
    mime_type TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    sha256 TEXT,
    normalized_filename TEXT,
    extracted_model TEXT,
    extracted_serial TEXT,
    extracted_sequence INTEGER,
    detected_role TEXT,
    ignored INTEGER DEFAULT 0,
    scan_batch_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );`);

  // 产品图片映射表
  db.exec(`CREATE TABLE IF NOT EXISTS product_scan_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    scan_image_id INTEGER NOT NULL,
    match_type TEXT NOT NULL,
    matched_value TEXT,
    confidence REAL DEFAULT 0,
    image_position INTEGER,
    is_cover INTEGER DEFAULT 0,
    status TEXT DEFAULT 'suggested',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(product_id, scan_image_id),
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY(scan_image_id) REFERENCES product_scan_images(id) ON DELETE CASCADE
  );`);

  // 产品图片上传任务表
  db.exec(`CREATE TABLE IF NOT EXISTS product_image_upload_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    prestashop_product_id INTEGER NOT NULL,
    scan_image_id INTEGER NOT NULL,
    image_position INTEGER,
    is_cover INTEGER DEFAULT 0,
    local_source_path TEXT,
    processed_image_path TEXT,
    status TEXT DEFAULT 'queued',
    operation TEXT,
    request_method TEXT,
    remote_image_id INTEGER,
    attempt_count INTEGER DEFAULT 0,
    http_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  );`);

  // 索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ps_img_sha256 ON product_scan_images(sha256);
    CREATE INDEX IF NOT EXISTS idx_ps_img_model ON product_scan_images(extracted_model);
    CREATE INDEX IF NOT EXISTS idx_ps_img_serial ON product_scan_images(extracted_serial);
    CREATE INDEX IF NOT EXISTS idx_ps_map_product ON product_scan_mappings(product_id);
    CREATE INDEX IF NOT EXISTS idx_ps_map_status ON product_scan_mappings(status);
    CREATE INDEX IF NOT EXISTS idx_ps_upload_batch ON product_image_upload_jobs(batch_id);
    CREATE INDEX IF NOT EXISTS idx_ps_upload_status ON product_image_upload_jobs(status);`);

  // === 产品清单批次表 ===
  db.exec(`CREATE TABLE IF NOT EXISTS product_list_import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL DEFAULT 'xlsx', source_name TEXT, sheet_name TEXT,
    total_rows INTEGER DEFAULT 0, valid_rows INTEGER DEFAULT 0,
    on_website_rows INTEGER DEFAULT 0, not_on_website_rows INTEGER DEFAULT 0,
    missing_local_rows INTEGER DEFAULT 0, conflict_rows INTEGER DEFAULT 0, invalid_rows INTEGER DEFAULT 0,
    website_batch_id INTEGER,
    field_mapping TEXT, import_options TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT, error_message TEXT,
    FOREIGN KEY(website_batch_id) REFERENCES prestashop_import_batches(id)
  );`);

  // === 产品清单明细表 ===
  db.exec(`CREATE TABLE IF NOT EXISTS product_list_import_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL, source_row_no INTEGER,
    reference TEXT, normalized_reference TEXT,
    label_name_es TEXT, product_name_zh TEXT, model TEXT, brand TEXT,
    source_price_text TEXT, source_price_value REAL, remark TEXT, raw_data TEXT,
    local_product_id INTEGER, website_snapshot_id INTEGER,
    check_status TEXT NOT NULL, match_method TEXT, conflict_details TEXT,
    checked_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(batch_id) REFERENCES product_list_import_batches(id) ON DELETE CASCADE,
    FOREIGN KEY(local_product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY(website_snapshot_id) REFERENCES prestashop_product_snapshots(id) ON DELETE SET NULL
  );`);

  // 索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_product_list_batch ON product_list_import_items(batch_id);
    CREATE INDEX IF NOT EXISTS idx_product_list_reference ON product_list_import_items(normalized_reference);
    CREATE INDEX IF NOT EXISTS idx_product_list_status ON product_list_import_items(check_status);
    CREATE INDEX IF NOT EXISTS idx_product_list_local_product ON product_list_import_items(local_product_id);
    CREATE INDEX IF NOT EXISTS idx_product_list_website_snapshot ON product_list_import_items(website_snapshot_id);`);

  // === v1.4 Mobile Capture 模块 ===

  // 手机端认证 token（持久化，服务重启不失效）
  db.exec(`CREATE TABLE IF NOT EXISTS mobile_auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    operator_name TEXT DEFAULT '',
    device_name TEXT DEFAULT '',
    created_at INTEGER DEFAULT 0,
    expires_at INTEGER DEFAULT 0
  );`);

  // 手机采集会话表
  db.exec(`CREATE TABLE IF NOT EXISTS mobile_capture_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_code TEXT NOT NULL UNIQUE,
    operator_name TEXT NOT NULL DEFAULT '',
    device_name TEXT NOT NULL DEFAULT '',
    area_code TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );`);

  // 手机采集任务表
  db.exec(`CREATE TABLE IF NOT EXISTS mobile_captures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    prestashop_product_id INTEGER DEFAULT 0,
    serial_number TEXT DEFAULT '',
    reference TEXT DEFAULT '',
    ean13 TEXT DEFAULT '',
    model TEXT DEFAULT '',
    capture_status TEXT NOT NULL DEFAULT 'draft' CHECK(capture_status IN ('draft','submitted','reviewing','approved','rejected','processing','ready','synced','cancelled')),
    review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected')),
    processing_status TEXT NOT NULL DEFAULT 'none' CHECK(processing_status IN ('none','pending','processing','done')),
    sync_status TEXT NOT NULL DEFAULT 'none' CHECK(sync_status IN ('none','pushed','ready','synced')),
    notes TEXT DEFAULT '',
    colors TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    submitted_at TEXT,
    reviewed_at TEXT,
    synced_at TEXT,
    FOREIGN KEY(session_id) REFERENCES mobile_capture_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  );`);

  // 手机采集图片表
  db.exec(`CREATE TABLE IF NOT EXISTS mobile_capture_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capture_id INTEGER NOT NULL,
    local_path TEXT NOT NULL,
    processed_path TEXT DEFAULT '',
    filename TEXT NOT NULL,
    sha256 TEXT DEFAULT '',
    mime_type TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    role TEXT DEFAULT 'other',
    sequence INTEGER DEFAULT 0,
    is_cover_candidate INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','pending_review','approved','rejected','processing','processed','ai_generating','ai_ready','pushed','uploaded_ps')),
    rejection_reason TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(capture_id) REFERENCES mobile_captures(id) ON DELETE CASCADE
  );`);

  // 手机采集图片颜色绑定表
  db.exec(`CREATE TABLE IF NOT EXISTS mobile_capture_image_colors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capture_image_id INTEGER NOT NULL,
    color_name TEXT NOT NULL,
    normalized_color TEXT DEFAULT '',
    prestashop_attribute_id INTEGER DEFAULT 0,
    mapping_status TEXT NOT NULL DEFAULT 'pending' CHECK(mapping_status IN ('pending','mapped','new','ignored')),
    is_primary INTEGER DEFAULT 0,
    FOREIGN KEY(capture_image_id) REFERENCES mobile_capture_images(id) ON DELETE CASCADE
  );`);

  // 手机采集库存表
  db.exec(`CREATE TABLE IF NOT EXISTS mobile_capture_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capture_id INTEGER NOT NULL,
    color_name TEXT DEFAULT '',
    normalized_color TEXT DEFAULT '',
    quantity INTEGER,
    count_type TEXT NOT NULL DEFAULT 'unknown' CHECK(count_type IN ('exact','estimated','sufficient','unknown')),
    notes TEXT DEFAULT '',
    reviewed_quantity INTEGER,
    review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected')),
    FOREIGN KEY(capture_id) REFERENCES mobile_captures(id) ON DELETE CASCADE
  );`);

  // 手机采集语音备注表
  db.exec(`CREATE TABLE IF NOT EXISTS mobile_capture_audio_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capture_id INTEGER NOT NULL,
    local_path TEXT DEFAULT '',
    mime_type TEXT DEFAULT '',
    duration_seconds INTEGER DEFAULT 0,
    transcript TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(capture_id) REFERENCES mobile_captures(id) ON DELETE CASCADE
  );`);

  // 手机采集处理图（AI 精修后的电商图，一对多：一张原图可有多张处理图）
  db.exec(`CREATE TABLE IF NOT EXISTS mobile_capture_processed_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capture_id INTEGER NOT NULL,
    source_image_id INTEGER DEFAULT 0,
    product_id INTEGER NOT NULL,
    local_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    sha256 TEXT DEFAULT '',
    mime_type TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    role TEXT DEFAULT 'other',
    is_cover INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','approved','pushed')),
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(capture_id) REFERENCES mobile_captures(id) ON DELETE CASCADE
  );`);

  // 变体草稿表（第二阶段正式同步）
  db.exec(`CREATE TABLE IF NOT EXISTS variant_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capture_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    prestashop_product_id INTEGER DEFAULT 0,
    attribute_group_id INTEGER DEFAULT 0,
    attribute_value_id INTEGER DEFAULT 0,
    color_name TEXT DEFAULT '',
    quantity INTEGER,
    capture_image_id INTEGER,
    existing_combination_id INTEGER DEFAULT 0,
    action_type TEXT NOT NULL DEFAULT 'create' CHECK(action_type IN ('create','update','ignore')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','reviewed','conflict','ready','syncing','synced','failed','ignored')),
    error_message TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(capture_id) REFERENCES mobile_captures(id) ON DELETE CASCADE
  );`);

  // 手机壳点货：手机型号目录（品牌 → 型号），仅用于统计，不同步网站
  db.exec(`CREATE TABLE IF NOT EXISTS phone_model_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand TEXT NOT NULL DEFAULT '其他品牌',
    model TEXT NOT NULL,
    source TEXT DEFAULT 'preset',
    UNIQUE(brand, model)
  );`);

  // ===== v1.5 仓库快速盘点 =====
  db.exec(`CREATE TABLE IF NOT EXISTS inventory_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_code TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    inventory_type TEXT DEFAULT 'phone_case',
    operator_name TEXT DEFAULT '',
    device_name TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS inventory_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_session_id INTEGER NOT NULL,
    product_id INTEGER,
    prestashop_product_id INTEGER DEFAULT 0,
    product_name TEXT DEFAULT '',
    reference TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    snapshot_json TEXT DEFAULT '',       -- 网站库存快照（组合/库存/颜色）
    progress_json TEXT DEFAULT '',       -- 进度记忆（当前品牌/型号索引）
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY(inventory_session_id) REFERENCES inventory_sessions(id) ON DELETE CASCADE
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS inventory_model_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_product_id INTEGER NOT NULL,
    brand TEXT DEFAULT '',
    model TEXT NOT NULL,
    model_catalog_id INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'counted' CHECK(status IN ('counted','skipped','out_of_stock')),
    counted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(inventory_product_id) REFERENCES inventory_products(id) ON DELETE CASCADE
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS inventory_color_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_count_id INTEGER NOT NULL,
    color_name TEXT NOT NULL,
    color_id INTEGER DEFAULT 0,
    quantity INTEGER,
    count_type TEXT NOT NULL DEFAULT 'exact' CHECK(count_type IN ('exact','estimated','not_counted')),
    stock_status TEXT DEFAULT 'in_stock' CHECK(stock_status IN ('in_stock','low','out_of_stock','not_counted')),
    website_quantity INTEGER,
    difference INTEGER,
    counted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(model_count_id) REFERENCES inventory_model_counts(id) ON DELETE CASCADE
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS inventory_stock_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    brand TEXT DEFAULT '',
    model TEXT DEFAULT '',
    color_name TEXT DEFAULT '',
    status TEXT NOT NULL CHECK(status IN ('low','out_of_stock','restocked')),
    operator_name TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  // 轻量缺货上报（扫码/输条码 → 剩X件 / 剩X箱 / 已卖完）—— 区别于重型盘点批次
  db.exec(`CREATE TABLE IF NOT EXISTS stock_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    prestashop_product_id INTEGER DEFAULT 0,
    reference TEXT NOT NULL,
    product_name TEXT DEFAULT '',
    barcode TEXT DEFAULT '',
    report_type TEXT NOT NULL CHECK(report_type IN ('pieces','boxes','sold_out')),
    quantity INTEGER DEFAULT 0,          -- pieces/boxes 时的数量；sold_out 为 0
    box_size INTEGER DEFAULT 0,          -- 每箱件数（report_type='boxes' 时）
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','synced','resolved')),
    sync_status TEXT DEFAULT 'pending',  -- pending / synced / failed
    sync_error TEXT DEFAULT '',
    website_quantity INTEGER,            -- 上报时网站的实时库存（供对比）
    operator_name TEXT DEFAULT '',
    device_name TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS warehouse_colors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_name TEXT UNIQUE NOT NULL,
    display_name TEXT DEFAULT '',
    hex_color TEXT DEFAULT '',
    prestashop_color_id INTEGER DEFAULT 0,
    aliases TEXT DEFAULT '',
    active INTEGER DEFAULT 1
  );`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_inv_sessions_status ON inventory_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_inv_products_session ON inventory_products(inventory_session_id);
    CREATE INDEX IF NOT EXISTS idx_inv_products_product ON inventory_products(product_id);
    CREATE INDEX IF NOT EXISTS idx_inv_model_product ON inventory_model_counts(inventory_product_id);
    CREATE INDEX IF NOT EXISTS idx_inv_color_model ON inventory_color_counts(model_count_id);
    CREATE INDEX IF NOT EXISTS idx_inv_flags_product ON inventory_stock_flags(product_id);`);

  // 缺货上报索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_reports_status ON stock_reports(status);
    CREATE INDEX IF NOT EXISTS idx_stock_reports_product ON stock_reports(product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_reports_reference ON stock_reports(reference);
    CREATE INDEX IF NOT EXISTS idx_stock_reports_created ON stock_reports(created_at);`);

  // Mobile Capture 索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mobile_captures_session ON mobile_captures(session_id);
    CREATE INDEX IF NOT EXISTS idx_mobile_captures_product ON mobile_captures(product_id);
    CREATE INDEX IF NOT EXISTS idx_mobile_captures_status ON mobile_captures(capture_status, review_status, sync_status);
    CREATE INDEX IF NOT EXISTS idx_mobile_capture_images_capture ON mobile_capture_images(capture_id);
    CREATE INDEX IF NOT EXISTS idx_mobile_capture_images_sha ON mobile_capture_images(sha256);
    CREATE INDEX IF NOT EXISTS idx_mobile_capture_inventory_capture ON mobile_capture_inventory(capture_id);
    CREATE INDEX IF NOT EXISTS idx_mobile_capture_colors_image ON mobile_capture_image_colors(capture_image_id);
    CREATE INDEX IF NOT EXISTS idx_variant_drafts_product ON variant_drafts(prestashop_product_id);
    CREATE INDEX IF NOT EXISTS idx_variant_drafts_status ON variant_drafts(status);
    CREATE INDEX IF NOT EXISTS idx_processed_images_capture ON mobile_capture_processed_images(capture_id);
    CREATE INDEX IF NOT EXISTS idx_processed_images_source ON mobile_capture_processed_images(source_image_id);
    CREATE INDEX IF NOT EXISTS idx_mobile_sessions_status ON mobile_capture_sessions(status);`);

  // 迁移：mobile_captures 增加 colors 列（产品级颜色标注，JSON 数组）
  {
    const cols = db.prepare('PRAGMA table_info(mobile_captures)').all() as any[];
    if (!cols.find(c => c.name === 'colors')) {
      db.exec(`ALTER TABLE mobile_captures ADD COLUMN colors TEXT DEFAULT ''`);
    }
  }

  // v1.4 默认设置
  insertDefaultSetting('mobile_capture_enabled', 'true');
  insertDefaultSetting('mobile_capture_pin', '');
  insertDefaultSetting('mobile_capture_dir', '');
  insertDefaultSetting('mobile_capture_max_file_mb', '15');
  insertDefaultSetting('mobile_capture_max_images_per_product', '20');
  insertDefaultSetting('mobile_capture_jpeg_quality', '88');
  insertDefaultSetting('mobile_capture_max_dimension', '2400');
  insertDefaultSetting('mobile_capture_allow_audio', 'true');
  insertDefaultSetting('mobile_capture_audio_max_seconds', '120');
  insertDefaultSetting('mobile_capture_duplicate_check', 'true');
  insertDefaultSetting('mobile_capture_require_photo', 'true');
  insertDefaultSetting('mobile_capture_require_color_for_single', 'true');
  insertDefaultSetting('mobile_capture_auto_push_mapping', 'false');
  insertDefaultSetting('mobile_capture_retention_days', '180');
  insertDefaultSetting('mobile_capture_offline_enabled', 'false');

  // === v1.6 CAJA 新品检查 ===
  db.exec(`CREATE TABLE IF NOT EXISTS caja_check_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_hash TEXT,
    total_rows INTEGER DEFAULT 0,
    existing_count INTEGER DEFAULT 0,
    new_count INTEGER DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    website_product_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS caja_check_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    caja_reference TEXT,
    barcode TEXT,
    name TEXT,
    name2 TEXT,
    purchase_price REAL,
    sale_price REAL,
    edit_date TEXT,
    caja_status TEXT,
    result_status TEXT NOT NULL,
    match_method TEXT,
    prestashop_product_id INTEGER,
    prestashop_reference TEXT,
    prestashop_ean13 TEXT,
    prestashop_name TEXT,
    match_score REAL,
    raw_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(batch_id) REFERENCES caja_check_batches(id) ON DELETE CASCADE
  );`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_caja_check_items_batch ON caja_check_items(batch_id);
    CREATE INDEX IF NOT EXISTS idx_caja_check_items_status ON caja_check_items(batch_id, result_status);
    CREATE INDEX IF NOT EXISTS idx_caja_check_items_reference ON caja_check_items(caja_reference);
    CREATE INDEX IF NOT EXISTS idx_caja_check_items_barcode ON caja_check_items(barcode);`);

  // v1.6 CAJA 新品 → 网站批量上传（失败原因 / 上传方式：created=新建 exists=网站已有）
  ensureColumn('caja_check_items', 'upload_error', 'TEXT DEFAULT NULL');
  ensureColumn('caja_check_items', 'upload_status', "TEXT DEFAULT NULL");

  // v1.7 CAJA 新品检查：价格比对（网站价格 / 是否有变动 / 同步状态）
  ensureColumn('caja_check_items', 'prestashop_price', 'REAL DEFAULT NULL');
  ensureColumn('caja_check_items', 'price_changed', 'INTEGER DEFAULT 0');
  ensureColumn('caja_check_items', 'price_sync_status', "TEXT DEFAULT NULL");
  ensureColumn('caja_check_items', 'price_sync_error', 'TEXT DEFAULT NULL');
  ensureColumn('caja_check_batches', 'price_changed_count', 'INTEGER DEFAULT 0');

  console.log('Database initialized successfully.');
}


