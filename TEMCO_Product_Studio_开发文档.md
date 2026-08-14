# TEMCO Product Studio 开发文档

> 版本：v1.3  
> 更新日期：2026-07-23  
> v1.1 新增：分类图片管理  
> v1.2 新增：封面 POST → ps_method=PUT 覆盖、curlRunner(spawn)、FTP 缩略图直传  
> v1.3 新增：产品图片扫描、型号/序列号匹配、批量上传

---

## 1. 项目定位

TEMCO Product Studio 是一个本地运行的轻量 PIM + DAM + AI 内容管理平台，用于批量管理 TEMCO 在 PrestaShop 上的商品及分类资料。

核心能力：

```text
Google Sheet 商品库 → 本地管理
Google Drive 素材 → 本地匹配
AI 中西双语内容 → 人工审核
PrestaShop CSV 导出
PrestaShop API 上传（商品 + 分类图片）
```

v1.1 新增：PrestaShop 分类数据同步、分类图片匹配、批量上传、层级浏览。

---

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite 5 + TypeScript |
| 后端 | Node.js 22 + Express + TypeScript |
| 数据库 | SQLite (better-sqlite3 + WAL 模式) |
| 图片处理 | sharp |
| PrestaShop | Webservice API (XML) + curl |
| AI | DeepSeek / OpenAI-compatible |

启动方式：`start.bat`（后端 tsx + 前端 vite）

---

## 3. 核心模块

### 3.1 商品管理模块

- Google Sheet CSV 同步（公开 CSV）
- 商品列表（搜索、状态筛选、分类筛选、品牌筛选、日期筛选）
- 商品详情编辑（中/西双语文案、图片、视频、SEO）
- 批量操作：状态变更、文案生成、图片处理、导出、删除

### 3.2 商品图片/视频模块

- Google Drive 文件夹扫描匹配
- 按 `Images/商品编号/商品编号_N.jpg` 规则匹配
- 本地文件夹直接扫描上传
- AI 图片生成（默认关闭）

### 3.3 双语文案模块

- DeepSeek / OpenAI API 生成中西双语文案
- 无 Key 时模板兜底
- 单商品 / 批量生成

### 3.4 PrestaShop 商品同步

- 网站商品 CSV 导入 + 匹配
- 产品清单 xlsx 导入 + 核对
- 商品同步：文案、SEO、分类、品牌、图片、视频、价格、库存
- 图片同步到 PrestaShop（curl 方式上传）

### 3.5 PrestaShop 分类图片管理（v1.1 新增）

- 分类数据导入/同步
- 本地分类图片扫描
- 三级自动匹配（精确 → 别名 → 令牌）
- 人工映射确认/拒绝/批量确认
- 父分类筛选 + 层级路径显示
- 封面 + 缩略图双路上传
- Dry Run 预检 + 批量上传 + 失败重试 + 日志导出

---

## 4. 分类图片管理详细设计

### 4.1 数据流

```text
PrestaShop API / CSV
        ↓
本地 categories 表
        ↓
扫描本地目录 → category_images 表
        ↓
自动匹配 → category_image_mappings 表
        ↓
人工确认 → 已确认映射
        ↓
Dry Run 预检
        ↓
curl 上传 → PrestaShop
        ↓
上传日志 + 重试
```

### 4.2 数据库表

**categories** — 分类主表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 本地 ID |
| prestashop_category_id | INTEGER UNIQUE | PrestaShop 分类 ID |
| parent_id | INTEGER | 父分类的 prestashop_category_id |
| name | TEXT | 分类名称 |
| normalized_name | TEXT | 标准化名称（小写无重音） |
| full_path | TEXT | 完整层级路径（如 Accesorios > XIAOMI > Mi 15） |

**category_images** — 分类图片资产

| 字段 | 说明 |
|---|---|
| local_path | 绝对路径 |
| filename | 原始文件名 |
| normalized_filename | 标准化文件名 |
| sha256 | 文件哈希 |
| ignored | 忽略标记 |

**category_image_mappings** — 分类-图片映射

| 字段 | 说明 |
|---|---|
| category_id / category_image_id | 关联 |
| match_type | manual / exact / alias / fuzzy |
| confidence | 0-1 置信度 |
| status | suggested / confirmed / rejected / ignored / conflict |

**category_image_upload_jobs** — 上传任务

| 字段 | 说明 |
|---|---|
| batch_id | 批次 ID（格式：CATIMG-日期-UUID） |
| status | queued / processing / success / failed / cancelled |
| attempt_count | 重试次数 |
| http_status | PrestaShop 返回的 HTTP 状态码 |
| error_message | 错误详情 |

### 4.3 文件名标准化规则

```ts
function normalizeCategoryImageName(value: string): string {
  return value
    .normalize('NFD')                           // 分解重音字符
    .replace(/[\u0300-\u036f]/g, '')            // 去除重音
    .toLowerCase()
    .replace(/^imgi[_-]\d+[_-]/, '')            // 去除 imgi_数字_ 前缀
    .replace(/\.(webp|png|jpe?g)$/i, '')        // 去除扩展名
    .replace(/[_/\\-]+/g, ' ')                  // 分隔符统一为空格
    .replace(/\s+/g, ' ')
    .trim();
}
```

示例：

| 原始 | 标准化 |
|---|---|
| `imgi_185_mi-15-ultra.webp` | `mi 15 ultra` |
| `Xiaomi Mi 15 Ultra` | `xiaomi mi 15 ultra` |
| `imgi_183_xiaomi-15t.webp` | `xiaomi 15t` |

### 4.4 匹配算法（三级）

**第一层：人工映射**
用户手动指定的映射，优先级最高，不会被自动匹配覆盖。

**第二层：精确匹配**
`normalize(分类名) === normalize(图片名)` → 状态 `suggested`，置信度 1.0。

**第三层：令牌子集匹配**
图片名的所有单词都在分类名中出现（或反过来）→ 状态 `suggested`，置信度 0.85。

```text
mi 15 ultra ⊆ xiaomi mi 15 ultra → 匹配
xiaomi 14 ultra ⊆ xiaomi mi 14 ultra → 匹配
xiaomi 15t ⊆ xiaomi mi 15t → 匹配
```

**冲突检测：**
- 一个分类匹配多张图片 → 状态 `conflict`
- 一张图片匹配多个分类 → 状态 `conflict`
- 确认一条时自动拒绝同分类的其他冲突

### 4.5 图片预处理

上传前统一处理：

```ts
await sharp(inputPath)
  .rotate()                               // EXIF 方向校正
  .flatten({ background: '#ffffff' })      // 透明→白底
  .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 92, mozjpeg: true })
  .toBuffer();
```

### 4.6 上传机制

使用和产品图片一致的方式：

```bash
curl -s -X POST "https://temcostar.com/api/images/categories/{id}?ws_key=KEY" -F "image=@文件路径"
```

封面 + 缩略图分别上传到：
- 封面：`POST /api/images/categories/{id}`
- 缩略图：`POST /api/images/categories/{id}/thumb`

POST 失败且 PrestaShop 返回 "already exists" 时，自动用 `curl -X PUT` 重试覆盖。

用户可选择只传封面、只传缩略图、或两者都传（默认两者都传）。

### 4.7 操作流程

```
1. 打开「分类管理」
2. 导入 CSV 或 🔄 同步 PrestaShop 分类
3. 父分类下拉筛选 → 勾选目标分类 → ✅ 确认 → 去匹配
4. 切到「图片库」→ 扫描文件夹 → 🔍 扫描图片
5. 切到「匹配管理」→ 🔗 匹配选中 (N)
6. 检查匹配结果 → 单独确认/拒绝 或 全选 → ✅ 批量确认
7. 切到「上传任务」→ 🚀 批量上传
8. 勾选封面/缩略图选项 → 确认 → 开始上传
9. 查看结果 → 🔁 重试失败项 → 📥 导出日志 CSV
```

---

## 5. 前端页面路由

| 路由/入口 | 组件 | 说明 |
|---|---|---|
| `/` | App.tsx + ProductTable + ProductDetail | 商品管理主页 |
| 设置 → API 设置 | SettingsModal | API Key、PrestaShop 连接等 |
| 顶栏 → 分类管理 | CategoriesPage | 分类图片管理（4 Tab） |
| 顶栏 → 同步 Sheet | SheetSyncModal | Google Sheet 同步 |
| 顶栏 → 素材匹配 | DriveScanModal | Drive 图片/视频匹配 |
| 顶栏 → 批量文案 | CopyGenerationModal | AI 双语文案 |
| 顶栏 → 图片工坊 | ImageWorkshopModal | 图片手动分配 |
| 顶栏 → 图片处理 | ImageProcessModal | 图片裁剪/压缩 |
| 顶栏 → 批量图片 | AiImageModal | AI 生成图片 |
| 顶栏 → 导出 CSV | ExportModal | PrestaShop/审核 CSV |
| 顶栏 → 导入网站商品 | WebsiteImportModal | 网站商品抓取 |
| 顶栏 → 导入产品清单 | ProductListImportModal | xlsx 清单导入 |
| 顶栏 → 扫描文件夹 | App.handleScanFolder | 本地文件夹→产品匹配 |

---

## 6. 后端 API 端点

### 6.1 分类管理 `/api/categories`

| 方法 | 端点 | 说明 |
|---|---|---|
| POST | `/import-csv` | 导入分类 CSV（multipart file） |
| POST | `/sync-prestashop` | 从 PrestaShop API 同步分类 |
| GET | `/` | 分类列表（支持 search/matchStatus/parentId/page） |
| GET | `/stats` | 统计（总数/已匹配/已确认/冲突/已上传） |
| GET | `/parents` | 父分类列表（用于筛选下拉） |
| POST | `/scan-images` | 扫描本地分类图片目录 |
| GET | `/images` | 图片列表 |
| POST | `/images/clear` | 清空图片库 |
| POST | `/images/:id/ignore` | 忽略/恢复图片 |

### 6.2 匹配 `/api/categories/matching`

| 方法 | 端点 | 说明 |
|---|---|---|
| POST | `/run` | 执行匹配（可传 categoryIds 只匹配选中） |
| GET | `/results` | 获取匹配结果 |
| POST | `/confirm` | 确认映射（自动拒绝同分类其他冲突） |
| POST | `/reject` | 拒绝映射 |
| POST | `/manual-map` | 人工指定映射 |

### 6.3 上传 `/api/categories/uploads`

| 方法 | 端点 | 说明 |
|---|---|---|
| POST | `/preview` | Dry Run 预检 |
| POST | `/create` | 创建上传批次 |
| POST | `/:batchId/start` | 开始上传（传 cover/thumb 参数） |
| POST | `/:batchId/cancel` | 取消上传 |
| POST | `/:batchId/retry-failed` | 重试失败项 |
| GET | `/:batchId` | 批次状态 |
| GET | `/:batchId/logs` | 导出日志 CSV |
| GET | `/` | 所有批次列表 |

---

## 7. 设置项

新增分类图片相关设置（Key → 默认值）：

| 设置 Key | 默认值 | 说明 |
|---|---|---|
| `category_image_upload_enabled` | `true` | 启用上传功能 |
| `category_image_dir` | 空 | 分类图片本地目录 |
| `category_image_concurrency` | `2` | 上传并发数 |
| `category_image_retry_limit` | `2` | 最大重试次数 |
| `category_image_timeout_seconds` | `60` | 单次上传超时 |
| `category_image_jpeg_quality` | `92` | JPEG 压缩质量 |
| `category_image_max_size` | `1600` | 图片最大尺寸 |
| `category_image_max_file_size_mb` | `10` | 源文件最大 MB |
| `category_upload_batch_limit` | `200` | 单批最大分类数 |

---

## 8. 目录结构

```text
TEMCO-Product-Studio/
├─ client/src/
│  ├─ App.tsx                    # 主入口
│  ├─ pages/
│  │  └─ CategoriesPage.tsx      # 分类图片管理（4 Tab）
│  ├─ components/
│  │  ├─ TopBar.tsx
│  │  ├─ SettingsModal.tsx       # 含分类图片目录、上传开关
│  │  └─ ...
│  ├─ services/
│  │  └─ api.ts                  # categoriesApi (20+ 方法)
│  └─ types/
│     └─ index.ts
├─ server/src/
│  ├─ index.ts                   # Express 入口
│  ├─ database/
│  │  └─ database.ts             # 含 4 张分类表 + 索引
│  ├─ routes/
│  │  ├─ categories.ts           # 19 个端点
│  │  ├─ prestashop.ts
│  │  └─ settings.ts
│  ├─ services/
│  │  ├─ categoryImage/
│  │  │  ├─ types.ts
│  │  │  ├─ categoryImageService.ts     # 扫描/匹配/预处理/DryRun
│  │  │  └─ categoryImageUploadService.ts  # 上传/批次/日志/curl
│  │  ├─ prestashop/
│  │  │  └─ prestashopClient.ts         # getCategories(含extract)
│  │  └─ imageProcessor.ts
│  └─ ...
├─ server/data/
│  ├─ temco.db
│  ├─ category-images/           # 默认分类图片目录
│  └─ uploads/
├─ start.bat
└─ stop.bat
```

---

## 9. 关键实现细节

### 9.1 PrestaShop `id_parent` 提取

PrestaShop API 返回的 `id_parent` 是 `{#text: 36, @_xlink:href: "..."}` 对象形式。使用 `extract()` 函数从 `#text` 取值，0 值保留不转为 null。

### 9.2 父分类路径

`categories.full_path` 通过自引用递归构建（如 `Accesorios > XIAOMI > Xiaomi Mi 15 Ultra`），在 CSV 导入和 PrestaShop 同步后自动更新。

### 9.3 并发控制

上传使用简单的 `while(index < jobs.length)` 循环 + N 个 worker，避免一次并发几十个请求导致 PrestaShop 超时。

### 9.4 文件安全性

- 禁止用户通过 API 传任意系统路径
- 只允许 `.jpg/.jpeg/.png/.webp` 扩展名
- 校验文件大小上限
- API Key 存储在后端，前端脱敏显示

---

## 10. 验收标准

```text
✅ 能导入带 ID 和 Nombre 的分类 CSV
✅ 能通过 PrestaShop API 同步分类（含 parent_id 正确提取）
✅ 能扫描本地 JPG/PNG/WebP 分类图片
✅ 能去除 imgi_数字_ 文件名前缀
✅ 能按分类名精确匹配 + 令牌匹配
✅ 能识别未匹配、重复和冲突
✅ 能人工指定/批量确认分类与图片关系
✅ 能按父分类筛选 + 显示完整层级路径
✅ 能执行 Dry Run 预检
✅ 正式上传前需勾选确认
✅ 能用 curl 将 JPEG 上传至封面 + 缩略图
✅ POST 失败时自动 PUT 覆盖
✅ 可选择上传封面/缩略图/两者
✅ 能记录每项上传结果 + 失败重试
✅ API Key 不在前端明文显示
✅ 不会因单项失败中断整个批次
✅ 能导出上传日志 CSV
✅ 能限制并发和单批数量
```

---

## 11. 产品图片管理（v1.3）

### 11.1 数据流

```
本地产品图片目录（递归扫描）
  → product_scan_images 表（提取型号/序列号/序号/角色）
  → product_scan_mappings 表（自动匹配）
  → 人工确认/批量确认
  → product_image_upload_jobs（串行上传）
  → PrestaShop API
```

### 11.2 匹配优先级

| 顺序 | 匹配方式 | 置信度 |
|---|---|---|
| 1 | 6 位序列号 = serial_number 或 reference | 1.0 |
| 2 | 型号精确匹配（KMS-322 = KMS322） | 0.98 |
| 3 | Reference 精确匹配 | 1.0 |
| 4 | 型号出现在产品名称中 | 0.95 |

### 11.3 数据库表

- `product_scan_images` — 扫描图片资产（local_path, sha256, extracted_model, extracted_serial, extracted_sequence, detected_role）
- `product_scan_mappings` — 匹配关系（match_type, confidence, status, image_position, is_cover）
- `product_image_upload_jobs` — 上传任务（batch_id, prestashop_product_id, remote_image_id, status）

### 11.4 上传

- 模式：**追加**（不做删除/替换）
- SHA-256 去重：同一产品 + 同一哈希 = 跳过
- 并发：2 产品同时上传，单产品内串行
- curl 方式：`POST /api/images/products/{productId}?ws_key=KEY -F image=@文件`

### 11.5 操作流程

```
1. 顶栏 → 📦 产品图片
2. 图片库 → 填目录路径 → 🔍 扫描
3. 匹配管理 → 🔗 自动匹配 → 全选 → ✅ 批量确认
4. 🚀 批量上传 → 查看进度
```

### 11.6 API 端点 `/api/product-images`

| 方法 | 端点 | 说明 |
|---|---|---|
| POST | `/scan` | 扫描目录 |
| GET | `/` | 图片列表 |
| GET | `/stats` | 统计 |
| POST | `/clear` | 清空 |
| POST | `/matching/run` | 自动匹配 |
| GET | `/matching/results` | 匹配结果 |
| POST | `/matching/confirm` | 确认 |
| POST | `/matching/reject` | 拒绝 |
| POST | `/matching/manual-map` | 人工映射 |
| POST | `/uploads/create` | 创建批次 |
| POST | `/uploads/:batchId/start` | 开始上传 |
| POST | `/uploads/:batchId/retry-failed` | 重试 |
| GET | `/uploads/:batchId` | 批次状态 |

### 11.7 新增文件

```
server/src/services/productImage/
├─ productImageNameParser.ts    # 标准化/序列号/型号/序号/角色提取
├─ productImageScanner.ts       # 递归扫描 + SHA-256
├─ productImageMatchingService.ts # 多级匹配
└─ productImageUploadService.ts # 批次/curl上传/重试

server/src/routes/productImages.ts  # 14 个 API 端点
client/src/pages/ProductImagesPage.tsx # 3 Tab 管理页
```
