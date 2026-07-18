# TEMCO Product Studio - 开发文档

---

## 架构总览

### 前后端分离
```
┌──────────┐      HTTP/JSON       ┌──────────┐      SQL       ┌──────────┐
│  Frontend │ ──────────────────→ │  Backend  │ ────────────→ │  SQLite  │
│  :5173   │ ←────────────────── │  :3001   │ ←──────────── │  .db     │
│ Vite+React│                    │ Express  │               │          │
└──────────┘                      └──────────┘               └──────────┘
       │                                │
       │ Vite Proxy                     │ PrestaShop API (XML)
       ↓                                ↓
  Browser                        PrestaShop Website
```

### 关键设计决策
| 决策 | 选择 | 原因 |
|------|------|------|
| 数据库 | SQLite | 零配置，单文件，适合本地工具 |
| API 格式 | REST + JSON | 简单直观，符合 Express 惯例 |
| 前端状态 | React useState + props | 无复杂状态管理，组件树简单 |
| 图片存储 | 文件系统 | 无需对象存储，本地访问快 |
| 类型检查 | TypeScript strict | 保证代码质量 |
| 样式方案 | CSS 变量 + 纯 CSS | 无需 CSS-in-JS 运行时开销 |

---

## 数据库完整 Schema

```sql
-- 商品主表
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,          -- 商品编号
  prestashop_id TEXT,                       -- PrestaShop 商品 ID
  name TEXT,                                -- 商品名称（中文）
  category TEXT,                            -- 分类
  brand TEXT,                               -- 品牌
  model TEXT,                               -- 型号
  status TEXT DEFAULT '待处理',             -- 当前状态
  upload_status TEXT,                       -- 上传状态
  selling_points TEXT,                      -- 产品卖点
  product_intro TEXT,                       -- 产品介绍
  video_url TEXT,                           -- YouTube 视频链接
  price REAL DEFAULT 0,                     -- 价格（欧元）
  wholesale_price REAL DEFAULT 0,           -- 批发价
  ean13 TEXT, upc TEXT, mpn TEXT,           -- 商品条码/编码
  prestashop_sync_status TEXT,              -- 同步状态
  prestashop_last_sync_at TEXT,             -- 最后同步时间
  prestashop_last_error TEXT,               -- 最后同步错误
  prestashop_category_id TEXT,              -- PrestaShop 分类 ID
  prestashop_manufacturer_id TEXT,          -- PrestaShop 制造商 ID
  sheet_raw_data TEXT,                      -- Sheet 导入的原始 JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 双语内容表
CREATE TABLE product_contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,              -- 关联 products.id
  lang TEXT NOT NULL,                        -- 语言: 'es' / 'zh'
  name TEXT,                                 -- 商品名
  description_short TEXT,                    -- 短描述
  description TEXT,                          -- 长描述（HTML）
  seo_title TEXT,                            -- SEO 标题
  seo_description TEXT,                      -- SEO 描述
  friendly_url TEXT,                         -- 友好 URL
  image_alt TEXT,                            -- 主图 ALT
  gallery_image_alts TEXT,                   -- 附图 ALT（JSON 数组）
  whatsapp_copy TEXT,                        -- WhatsApp 文案
  video_script TEXT,                         -- 视频脚本
  updated_at TEXT,
  UNIQUE(product_id, lang)
);

-- 图片表
CREATE TABLE product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  role TEXT,                                 -- 角色: main_product/packaging/scene1/scene2/scene3/gallery/main
  original_name TEXT,                        -- 原始文件名
  export_name TEXT,                          -- SEO 导出文件名
  image_index INTEGER,                       -- 图片序号
  alt TEXT,                                  -- ALT 文本
  status TEXT DEFAULT 'ok',                  -- 状态: ok/white_bg/scene/processed/ai_generated
  local_path TEXT,                           -- 本地文件系统路径
  web_view_link TEXT,                        -- Google Drive 查看链接
  thumbnail_link TEXT,                       -- Google Drive 缩略图
  mime_type TEXT,
  prestashop_image_id TEXT,                  -- PrestaShop 图片 ID
  prestashop_sync_status TEXT,
  prestashop_last_sync_at TEXT,
  image_slot TEXT,                           -- 槽位标识
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 视频表
CREATE TABLE product_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  title TEXT,
  url TEXT,
  type TEXT,
  drive_id TEXT
);

-- Google Drive 资源表
CREATE TABLE drive_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  drive_file_id TEXT,
  name TEXT,
  mime_type TEXT,
  web_view_link TEXT,
  thumbnail_link TEXT,
  asset_type TEXT,
  reference TEXT,
  issues TEXT,
  parent_folder TEXT,
  created_at TEXT
);

-- API 设置表
CREATE TABLE api_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 同步日志表
CREATE TABLE prestashop_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  action TEXT,
  status TEXT,
  request_payload TEXT,
  response_data TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## 完整 API 路由文档

### 商品管理 `/api/products`
| 方法 | 路由 | 说明 | 参数 |
|------|------|------|------|
| GET | `/` | 商品列表 | `search, status, category, brand, dateFilter, page, pageSize, sortBy, sortOrder` |
| GET | `/:reference` | 商品详情 | - |
| PATCH | `/:reference` | 更新商品 | JSON body（允许字段列表中的字段） |
| DELETE | `/:reference` | 删除商品 | - |
| GET | `/meta/statistics` | 状态统计 | - |
| GET | `/meta/categories` | 分类列表 | - |
| GET | `/meta/brands` | 品牌列表 | - |

### 文案生成 `/api/copy`
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/generate/:reference` | 生成单商品文案 |
| POST | `/generate-batch` | 批量生成文案 |
| POST | `/generate-alt/:reference` | 生成图片 ALT |
| GET | `/config` | 获取生成配置 |
| POST | `/test` | 测试 API 连接 |

### 图片管理 `/api/upload`
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/upload-batch/:reference` | 批量上传图片 |
| DELETE | `/image/:imageId` | 删除图片 |
| PATCH | `/image/:imageId` | 更新图片信息 |
| POST | `/white-bg/:reference/:imageId` | 生成白底图 |
| POST | `/scene/:reference/:imageId` | 生成场景图 |
| POST | `/open-folder/:reference` | 打开资源管理器 |
| GET | `/file/product/:reference/:filename` | 查看产品图片 |
| GET | `/files/product/:reference` | 列出产品文件夹 |
| POST | `/verify-images/:reference` | 验证/同步文件状态 |
| POST | `/export-data/:reference` | 导出产品数据到文件夹 |

### PrestaShop 同步 `/api/prestashop`
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/sync-product/:ref` | 同步商品 |
| POST | `/sync-images/:ref` | 同步图片 |
| POST | `/sync-image/:imgId` | 同步单张图片 |
| POST | `/sync-all-prices` | 批量同步价格 |
| POST | `/toggle-active/:ref` | 激活/停用 |
| GET | `/manufacturers` | 制造商列表 |
| GET | `/categories` | 分类列表 |
| GET | `/languages` | 语言列表 |
| GET | `/check-alt/:ref` | 检查图片 ALT |

### 数据导入 `/api/sheet`
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/sync` | 从 Sheet/CSV 同步 |
| POST | `/test` | 测试连接 |

### 设置 `/api/settings`
| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/` | 获取全部设置 |
| PATCH | `/:key` | 更新设置 |

---

## 动态状态计算逻辑

状态在服务端 `products.ts` 的列表查询中实时计算：

```typescript
// 简化逻辑
let computedStatus = '待处理';
if (有任意图片 && !有西语文案) computedStatus = '已上传图片';
else if (有主图) computedStatus = '已匹配图片';

if (有西语文案) computedStatus = '双语文案已生成';
if (有 SEO标题 && SEO描述) computedStatus = 'SEO通过';

if (有 PS_ID && 已同步) {
  if (有图片 && !有文案) computedStatus = '已上传图片';
  else if (有图片) computedStatus = '已上传';
  else computedStatus = '可导出PrestaShop';
} else if (有 PS_ID) {
  if (有图片 && !有文案) computedStatus = '已上传图片';
  else if (有图片) computedStatus = '可导出PrestaShop';
}

if (数据库状态 === '已下架') computedStatus = '已下架';
```

### 已下架状态
- 在详情页手动设置 `status = '已下架'`
- 同步到 PrestaShop 时发送 `active: '0'` → 前台不可见
- 动态状态优先级最高：无论其他条件如何，`status = '已下架'` 优先显示
- 筛选器中可单独筛选已下架商品

### 已上传图片状态
- 有任意图片（`image_count > 0`）但无西语文案（`es.name` 为空）时显示
- 即使有 `prestashop_id` 也优先显示此状态（表示"有图无文案"）
- 左侧面板统计和筛选器均支持此状态
- 筛选时使用动态 SQL 而非静态字段匹配

### 状态筛选实现
```
状态筛选通过 status 查询参数传递。对于动态状态"已上传图片"，
后端使用特殊的 SQL 条件代替静态字段匹配：

已上传图片 → WHERE id IN (product_images) AND id NOT IN (product_contents WITH es)
其他状态   → WHERE status = 'xxx'
```

---

## PrestaShop 同步功能详情

### 激活/停用商品
```
POST /api/prestashop/toggle-active/:ref
```
- 从 PrestaShop 获取完整商品 XML
- 提取当前 active 值（0/1）并取反
- 移除只读字段（manufacturer_name, quantity 等）
- PUT 回 PrestaShop
- 前端按钮显示 🔴 未激活 / 🟢 已激活

### 图片同步
```
POST /api/prestashop/sync-images/:ref
```
- 查询 `role IN ('main_product','packaging','scene1','scene2','scene3','main','gallery')`
- 按角色排序，通过 PrestaShop API 逐个上传
- 支持 skipExists（跳过已存在）和 append（追加）模式
- 返回 total/successCount/skippedCount/failedCount

### 价格同步
```
POST /api/prestashop/sync-all-prices
```
- 遍历所有 `price > 0 AND prestashop_id IS NOT NULL` 的商品
- 逐个调用 syncProductByRef 更新价格
- 分类自动匹配：同步时从 PrestaShop 查找分类名称匹配

---

## UI 组件架构

### TopBar 操作栏
分组结构（应用 Corporate/Professional 设计技能）：
```
┌──────────────────────────────────────────────────────────┐
│ TEMCO Product Studio                                     │
│                                                          │
│ [🔁 同步 Sheet] [＋ 素材匹配] ┊ [📄 批量文案] [📸 图片   │
│  数据导入组           内容处理组                          │
│                                                          │
│  [🖼 图片处理] [✨ 批量图片]  ┊ [📥 导出 CSV] ┊ [⚙ 设置]│
│   图片处理组                导出组      系统组            │
└──────────────────────────────────────────────────────────┘
```

CSS 实现：
```css
.topbar-group { display: flex; gap: var(--space-1); align-items: center; }
.topbar-divider { width: 1px; height: 24px; background: var(--border-color); }
```

### 产品详情页组件结构
```
ProductDetail.tsx
├── 标题栏（reference + 文件夹/网页/激活按钮 + 保存/同步）
├── 基本信息面板（分类/品牌/型号/价格/状态/视频）
├── AI 生成素材面板（卖点/介绍 + 生成文案 + 同步）
├── 双语内容面板（西班牙语/中文切换 tab）
│   ├── 7 个编辑字段（名称/短描述/长描述/SEO标题/SEO描述/友好URL）
│   └── 对侧语言参考
├── 5 槽位图片管理（上传/AI ALT/删除）
├── 全部图片管理（展开/编辑 ALT/删除）
├── 7 个内容编辑区（卖点/介绍/视频等）
└── 操作按钮（同步到 PS/同步图片/删除商品）
```

---

## AI 提示词系统

### 文案提示词（v11）
```
文件: server/src/services/copyGenerator/openaiGenerator.ts
功能: 生成 7 个字段（标题/短描述/长描述/SEO标题/SEO描述/友好URL/WhatsApp/视频脚本）
规则:
  - 标题 ≤65 字符
  - Meta标题 ≤60 字符
  - Meta描述 ≤155 字符
  - 短描述 120-170 字符
  - 长描述 160-240 词（4 段落）
  - 双语输出（西班牙语 + 中文）
禁止项:
  - 航空/飞行/航空公司规则
  - 价格/利润/销售额/畅销
  - 认证/安全标准/保修
  - 防水/防震/防火/防刮
  - 快充/无线充电（未确认时）
  - 材质/兼容性（未确认时）
  - "inteligente"（非智能功能时）
  - "materiales resistentes"（无数据时）
  - "múltiples cargas completas"
  - "demandada"/"popular"/"alta rotación"
  - "profesionales y usuarios exigentes"
```

### ALT 提示词（v10）
```
文件: server/src/routes/copy.ts（generate-alt 路由内）
功能: 仅生成图片 ALT 文本
规则:
  - 每图 35-75 字符
  - 每张 ALT 必须唯一
  - 不重复完整产品名
  - 不编造场景（户外/办公室/家用/商用）
  - 只描述图片可见内容
  - GOOD/BAD 示例对比
```

---

## 关键组件说明

### 前端组件依赖关系
```
App.tsx
├── TopBar.tsx            — 顶部操作栏（触发各类弹窗）
├── LeftPanel.tsx         — 左侧筛选面板（状态/分类统计）
├── content-area          — 产品列表 + 分页
│   └── ProductTable.tsx  — 商品列表表格
├── splitter              — 可拖拽分割线
└── detail-panel
    └── ProductDetail.tsx — 商品详情编辑（核心大组件）
        ├── 基本信息面板
        ├── AI 生成素材面板
        ├── 双语内容面板（西班牙语/中文切换）
        ├── 5 槽位图片管理
        ├── 全部图片管理
        ├── 7 个 SEO/内容编辑区
        └── 同步/激活/删除按钮

Modals（由 TopBar / App 触发）:
├── SheetSyncModal.tsx    — Sheet/CSV 导入弹窗
├── SettingsModal.tsx     — 设置弹窗
├── DriveScanModal.tsx    — Drive 扫描弹窗
├── ExportModal.tsx       — CSV 导出弹窗
├── CopyBatchModal.tsx    — 批量文案生成弹窗
└── ImageWorkshopModal.tsx— 图片工坊弹窗
```

### CSS 变量体系
```css
:root {
  /* 颜色 */
  --bg-primary: #f4f5f7;
  --bg-secondary: #ffffff;
  --bg-hover: #eef1f5;
  --bg-active: #e8f0fe;
  --border-color: #e2e5e9;
  --text-primary: #1a1d23;
  --text-secondary: #5f6b7a;
  --text-muted: #9aa4b2;
  --accent: #2563eb;

  /* 布局 */
  --sidebar-width: 260px;
  --detail-width: min(45vw, 960px);
  --topbar-height: 52px;

  /* 间距 (8pt 基线) */
  --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-5: 24px; --space-6: 32px;

  /* 圆角 */
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px;

  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.08);
  --shadow-lg: 0 4px 16px rgba(0,0,0,0.1);
}
```

---

## 开发工作流

### 本地开发
```bash
# 启动开发服务器（热更新）
npm run dev

# 类型检查
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit

# 构建前端
cd client && npx vite build
```

### 添加新 API 路由
1. 在 `server/src/routes/` 下新建 `.ts` 文件
2. 使用 `Router()` 定义路由
3. 在 `server/src/index.ts` 中注册: `app.use('/api/xxx', router)`
4. 在 `client/src/services/api.ts` 中添加对应的方法

### 添加新前端组件
1. 在 `client/src/components/` 下新建 `.tsx` 文件
2. 定义 Props 接口
3. 在父组件中引用
4. 更新 `client/src/types/index.ts` 类型定义

### 数据库迁移
SQLite 无内置迁移工具，建议：
1. 在 `database.ts` 的 `initializeDatabase()` 中添加 `ALTER TABLE`
2. 用 `try/catch` 包裹，防止重复执行报错

---

## 常见开发问题

### 代理不生效
检查 `client/vite.config.ts` 中 proxy 配置是否正确：
```typescript
proxy: {
  '/api': { target: 'http://localhost:3001', changeOrigin: true }
}
```

### 图片路径问题
- `getImageUrl()` 解析 `local_path` 生成访问 URL
- 路径格式: `data/uploads/{reference}/{filename}`
- 访问路由: `/api/upload/file/product/:reference/:filename`

### 状态不同步
- 列表状态是动态计算的，不依赖数据库 `status` 字段
- `status` 字段仅在"已下架"时被读取
- 其他状态根据图片/内容/同步情况实时计算

### PrestaShop API 错误
- 403/400 通常包含错误 XML，检查 `prestashopClient.ts` 中的错误解析
- 常见错误: 只读字段（manufacturer_name/quantity）、缺少必填字段（name/link_rewrite）
