# TEMCO Product Studio v1.4 — 手机采集模块开发文档

> 版本：v1.4（2026-08）
> 范围：手机采集闭环（第一阶段）— 手机端采集 + 电脑端审核 + 网站同步 + 手机壳点货统计
> 状态：已实现并验证（前后端编译通过、全链路 API + 浏览器实测通过）

> **v1.5 已发布**：仓库快速盘点模块（型号×颜色×数量×盘点批次）见文末「附：v1.5 仓库快速盘点」。

---

## 1. 项目概述

TEMCO Product Studio 是 TEMCO（西班牙电商）的商品管理后台，支持从 **PrestaShop 网站**拉取/推送商品数据。v1.4 新增**手机采集模块**：现场人员用手机扫码/搜索产品 → 拍照上传 → 标注颜色/库存/手机型号 → 提交 → 电脑端审核 → 同步图片/变体到网站。

### 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js 22 + Express + TypeScript + SQLite（better-sqlite3，WAL 模式） |
| 前端 | React 18 + Vite 5 + TypeScript |
| 手机端 | 同一 React 应用（`/mobile-capture` 路径路由），响应式布局，LAN 直连 |
| 网站集成 | PrestaShop WebService API（REST + XML，ws_key 认证） |
| 图片 | sharp（缩略图/校验）、multer（上传） |

### 端口与访问

- 后端：`http://localhost:3001`（vite 代理 `/api` → 3001）
- 前端：`http://localhost:5173`（`host: true`，局域网手机可访问）
- 手机端页面：`/mobile-capture`（电脑审核端：`/mobile-capture-review`）
- 局域网 IP：`192.168.1.27`（后端 `/api/mobile-capture/access-info` 实时返回）

---

## 2. 数据库设计（手机采集相关）

### 2.1 认证与会话

| 表 | 用途 |
|---|---|
| `mobile_auth_tokens` | 手机端登录 token（PIN 验证后签发，**持久化到数据库**，后端重启不掉线） |
| `mobile_capture_sessions` | 采集会话（操作员/设备/区域/状态 active|completed|cancelled，`session_code` 如 CAP-20260803-001） |

### 2.2 采集任务

| 表 | 用途 |
|---|---|
| `mobile_captures` | 采集任务：产品信息 + 状态（capture_status: draft/submitted/cancelled/approved；review_status: pending/approved/rejected；sync_status）；`colors`（产品级颜色 JSON）、`phone_models`（点货型号 JSON：`[{brand,model,colors:[]}]`）、`notes` |
| `mobile_capture_images` | 手机照片：sha256（**去重**）、role（front/back/detail/other）、status（uploaded/pending_review/approved/rejected）、is_cover |
| `mobile_capture_image_colors` | 图片-颜色关联 |
| `mobile_capture_inventory` | 按颜色库存（count_type: exact/estimated/sufficient/not_counted） |
| `mobile_capture_audio_notes` | 语音备注 |
| `mobile_capture_processed_images` | 处理后照片（AI 精修电商图，上传/推送状态 uploaded/approved/pushed，关联原图 source_image_id） |
| `variant_drafts` | 变体草稿（第二阶段正式同步的中间产物） |
| `phone_model_catalog` | 手机壳点货型号目录（brand + model + source: preset/website/website_category） |

### 2.3 扩展列（ensureColumn 迁移）

- `products.sold_out`（0/1）+ `products.sold_out_at`：已卖完标记
- `mobile_captures.phone_models`：点货型号 JSON
- `mobile_captures.colors`：产品级颜色标注

---

## 3. 后端 API（`server/src/routes/mobileCapture.ts`）

### 3.1 认证与访问（`requireMobileAuth` 中间件）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/pin` | PIN 登录（body: pin/operatorName/deviceName/areaCode）→ 签发 token |
| GET | `/access-info` | 电脑端访问信息：局域网 IP 列表 + pinConfigured（**不返回明文 PIN**） |

### 3.2 会话

| 方法 | 路径 | 说明 |
|---|---|---|
| POST/GET | `/sessions` | 创建/列表（?status=active） |
| GET | `/sessions/:id` | 会话详情（校验仍 active） |
| POST | `/sessions/:id/complete` | 完成会话 |
| POST | `/sessions/:id/cancel` | 取消会话 |

### 3.3 产品（实时读写网站）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/products` | **手机端新增产品**（扫码/搜索无匹配时；reference 自动生成/冲突加后缀） |
| GET | `/products/search?q=` | **核心搜索**：本地匹配 + 实时网站同步（见 §4.2） |
| GET | `/products/fuzzy` | 模糊搜索（按名称） |
| GET | `/products/by-ean/:ean` 等 | 按 EAN/序列号/Reference/型号匹配 |
| GET | `/products/:id/capture-status` | 采集状态（activeCapture/lastCapture/图片数） |
| POST | `/products/:id/sold-out` | **标记已卖完**（body: soldOut bool） |
| GET | `/phone-models` | **手机型号目录**（品牌分组；预置 + 网站 Modelo 组 + 网站分类树） |
| PUT | `/captures/:id/phone-models` | 保存点货型号（body: models[{brand,model,colors}]） |

### 3.4 采集任务

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/captures` | 创建任务（sessionId + productId；支持 colors；重复创建返回 duplicate） |
| GET/PATCH | `/captures/:id` | 详情/草稿更新（notes/colors） |
| POST | `/captures/:id/submit` | 提交（守卫：仅 draft；至少一张照片） |
| POST | `/captures/:id/cancel` | 取消 |
| POST | `/captures/:id/reopen` | **重新打开**（submitted/approved 等 → draft；手机端提交前自动调用） |

### 3.5 图片

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/captures/:id/images` | 上传照片（multipart；sha256 去重；role/colors/sequence/isCoverCandidate） |
| GET | `/captures/:id/images` | 图片列表 |
| PATCH/DELETE | `/images/:imageId` | 修改角色/颜色、删除 |
| GET | `/images/:imageId/file` | 图片文件（query token 支持） |
| POST | `/review/captures/:id/images/reupload` | 电脑端补传（文件丢失时） |
| POST | `/review/captures/:id/processed-images` | **上传处理后照片**（AI 精修图，关联原图 + role + isCover） |
| GET/DELETE | `/review/processed-images/:imageId/file` 等 | 处理图查看/删除 |

### 3.6 库存 / 音频

| 方法 | 路径 | 说明 |
|---|---|---|
| PUT/GET | `/captures/:id/inventory` | 按颜色库存保存/读取 |
| POST | `/captures/:id/audio-note` | 上传语音备注（multipart audio） |
| GET | `/captures/:id/audio-notes` | 音频列表 |
| DELETE | `/audio-notes/:id` | 删除音频 |

### 3.7 审核（电脑端，管理员）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/stats` | 审核统计（今日/待审核/待重拍/待图片/待颜色/待库存/已就绪） |
| GET | `/review/captures` | 任务列表（筛选 + **thumbnail_image_id** 卡片缩略图 + product_sold_out + phone_models） |
| GET | `/review/captures/:id` | 任务详情（images + processedImages + inventory + colors + phone_models + website 数据） |
| PATCH | `/review/captures/:id` | 修改任务（colors/notes 等） |
| POST | `/review/captures/batch-delete` | **批量删除**（勾选卡片） |
| POST | `/review/captures/:id/start-review` | 开始审核 |
| POST | `/review/captures/:id/approve` / `reject` / `mark-ready` | 通过 / 打回 / 就绪 |
| POST | `/review/images/:imageId/approve` / `reject` / PATCH / colors | 图片审核（通过/拒绝/改角色/改颜色） |
| POST | `/review/captures/:id/inventory/approve` | 库存审核通过 |
| GET | `/review/colors` / POST `/review/colors/:colorId/map` | 颜色映射 |
| POST | `/review/captures/:id/sync-variants-to-website` | **一键同步变体到网站**（采集颜色+库存 → 网站组合；已有颜色更新库存，无则创建） |
| POST | `/review/captures/:id/push-to-product-images` | 推送图片到本地产品图片表（**优先处理后照片**） |
| POST | `/review/captures/:id/promote-images` | 提升照片（处理后照片 → 产品图候选） |
| POST | `/review/captures/:id/sync-images-to-website` | **同步产品图片到网站**（只同步处理后照片，原始照片不上网站） |
| POST | `/review/captures/:id/create-variant-drafts` | 生成变体草稿 |
| POST | `/variant-drafts` / PATCH `/variant-drafts/:id` | 变体草稿管理 |
| POST | `/cleanup` | 清理未引用文件 |

### 3.8 PrestaShop 变体管理（`server/src/routes/prestashop.ts`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/combinations/:productId` | **读取网站现有变体**（组合 + 真实库存 stock_availables 合并） |
| POST | `/combinations/:productId` | 创建变体（XML 补齐 minimal_quantity 等必填） |
| PUT | `/combinations/:id` | 更新变体（含库存） |
| DELETE | `/combinations/:id` | 删除变体 |
| GET | `/option-values` | 属性值（**仅 Color 组** id_attribute_group=1/9，排除型号/尺寸组） |
| GET | `/permission-check` | API Key 权限检测（combinations/product_option_values/stock_availables） |

---

## 4. 核心逻辑

### 4.1 手机型号目录（点货统计）

数据来源三层合并（`phoneModelService.ts`）：
1. **预置** 80+ 常见型号（iPhone/Samsung/Xiaomi/Huawei/OPPO/vivo/realme…）
2. **网站 Modelo 属性组**（`product_option_values?filter[id_attribute_group]=[8]`）
3. **网站分类树**（`categories` 全量扫描 → 品牌容器 `Accesorios para SAMSUNG` 等 → 子分类 = 型号；Samsung 85、iPhone 39、Xiaomi 46+65+23…）

品牌归类：`classifyBrand()` 关键词匹配（iphone→iPhone、galaxy/samsung→Samsung、redmi/poco/xiaomi→Xiaomi…）。手机端按品牌分组显示，每个型号可勾选并**选择颜色**（红/黄/蓝/绿…12 色，多选），随任务保存，**仅统计不同步网站**。

### 4.2 产品搜索 — 实时读写网站（`websiteProductSyncService.ts`）

`GET /products/search` 流程：
1. 本地 `matchProduct(q)`（reference/EAN/序列号/型号/名称匹配）
2. **本地无匹配** → `syncProductFromWebsite(q)`：按 reference → 再按 EAN 查网站 → **upsert 本地 products**（名称/价格/EAN/quantity/ps_id）
3. **本地有匹配** → 实时刷新网站价格等
4. 命中后 `fetchWebsiteProductExtras(psId)` 并行读取：**图片数量**（images/products/{id}）+ **真实库存**（stock_availables 合计：变体产品=组合库存合计，单一产品=id_product_attribute=0 库存）+ **变体列表**（颜色名×库存）
5. 候选列表 → `fetchProductsActiveMap(psIds)` 批量查询网站 **active 启用状态**
6. 手机端展示「🌐 网站实时数据」+ 🟢/🔴/⚪ 激活图标

**关键坑**：PrestaShop XML 数字字段带 `@_notFilterable` 属性 → fast-xml-parser 解析为 `{#text:0}` → 需 `toNumber()` 取 `#text` 防 NaN（否则 SQLite 存 NULL）。

### 4.3 状态机与恢复

- `ensureDraft()`（前端）：提交/保存前若任务非 draft（submitted/rejected/approved）→ 自动调用 `/reopen` → 刷新状态 → 继续，用户无感
- 401 事件驱动：token 失效 → `mobile-auth-expired` 事件 → 自动回登录界面
- token 持久化：`mobile_auth_tokens` 表（数据库）+ localStorage（前端），重启不掉线

### 4.4 图片去重与安全

- sha256 指纹去重（同一张照片重复上传返回 duplicate）
- role 白名单（front/back/detail/other）+ basename 校验 → **防路径穿越**
- 文件存储在 `server/data/mobile-captures/`（按 capture 分目录）
- `/cleanup` 删除未被引用的文件（**跳过被 product_scan_images 引用的原图**，避免破坏上传批次）

### 4.5 同步到网站

- **图片**：只同步「处理后照片」（AI 精修电商图），原始照片不上网站；未上传处理图时明确提示
- **变体**：采集颜色+库存 → 网站现有变体匹配（颜色名规范化比对）→ 有则更新库存、无则创建

---

## 5. 前端

### 5.1 页面

| 页面 | 路径 | 说明 |
|---|---|---|
| `MobileCapturePage.tsx` | `/mobile-capture` | 手机端：登录 → 会话 → 扫码/搜索 → 采集（拍照/颜色/库存/型号/备注）→ 提交（880 行） |
| `MobileCaptureReviewPage.tsx` | `/mobile-capture-review` | 电脑审核端：统计卡 + 筛选 + 任务卡片（缩略图/已卖完红字/型号）+ 详情面板；15 秒自动刷新；批量删除 |

### 5.2 手机端组件（`components/mobileCapture/`）

`SessionStart`（PIN 登录）、`ProductScanner`（拍照扫码 BarcodeDetector→ZXing 兜底，无超时限制）、`ProductSearch`（手动搜索 + 候选激活图标 + 结果记忆返回）、`ProductSummary`（产品信息 + 网站实时数据 + 已卖完标记）、`CameraCapture`（拍照/相册）、`CaptureImageCard`、`ImageRoleSelector`、`ColorSelector`（网站颜色）、`InventoryInput`（按颜色库存）、`PhoneModelSelector`（**品牌→型号→颜色**，展开全部/收起）、`UploadQueue`、`AudioNoteRecorder`、`NewProductModal`（新增产品，三段式布局：固定头部+滚动内容+固定底部按钮）

### 5.3 电脑端组件

`CaptureTaskCard`（缩略图 + 状态 + 型号 + 已卖完红字 + 勾选）、`CaptureReviewPanel`（原图/处理图/颜色/库存/型号/审核操作）、`ProcessedImagesSection`（处理后照片上传/下载）、`InventoryReviewPanel`、`ColorMappingPanel`、`VariantEditPanel`（**实时读写网站变体**）、`VariantDraftPanel`、`ProductQuickEdit`（产品属性编辑 + 8 槽位图片 + 同步按钮）、`MobileCaptureAccessModal`（IP/PIN/二维码）

### 5.4 关键 Hook

- `useMobileCaptureSession`：登录状态 + 会话 + localStorage 持久化 + 401 事件
- `useBarcodeScanner`：照片扫码（BarcodeDetector 优先，ZXing `decodeFromImageElement` 兜底；解码前缩放到 1500px）
- `useCameraCapture`：拍照/相册

---

## 6. 配置项（`api_settings` 表，mobile_capture_* 前缀）

| 键 | 默认 | 说明 |
|---|---|---|
| `mobile_capture_pin` | 空 | 访问 PIN（空则不要求） |
| `mobile_capture_require_photo` | true | 提交是否必须照片 |
| `mobile_capture_photo_quality` | 80 | JPEG 质量 |
| `mobile_capture_max_photo_size` | 8MB | 单张上限 |
| `mobile_capture_max_video_size` | 50MB | 视频上限 |
| `mobile_capture_session_timeout_min` | 480 | 会话超时 |
| `mobile_capture_pin_max_attempts` | 5 | PIN 最大尝试次数 |
| `mobile_capture_lockout_minutes` | 15 | 锁定时间 |
| `mobile_capture_pin_require_operator` | true | 是否要求操作员姓名 |

PrestaShop：`prestashop_base_url` / `prestashop_api_key` / `prestashop_default_lang_id` / `prestashop_spanish_lang_id` 等。

---

## 7. 安全

- PIN 认证：数据库持久化 token + 尝试次数限制 + 锁定
- **access-info 不返回明文 PIN**（此前泄露已修复）
- 图片 role 白名单 + basename 校验（路径穿越修复）
- 上传限制（multer 大小/类型）
- 手机端图片 URL 支持 query token（img 标签无法带 Authorization header）
- 审核端（PC）路由无手机 token 要求（内网后台）

---

## 8. 测试

- 全链路 API 冒烟：登录 → 建会话 → 扫码搜索 → 建任务 → 拍照上传（去重）→ 库存 → 提交 → 审核 → 推送 → 同步
- 浏览器实测（Playwright + chromium）：手机视口（390×844）验证 UI 流程
- 真实网站验证：变体创建/删除/库存更新、图片同步、实时数据读取
- 测试数据均清理（注意：清理不删除 `data/mobile-captures` 目录本身，曾误删真实照片）

---

## 9. 后续规划（未实现）

- 第二阶段：AI 图片处理（抠图/精修）、PrestaShop 变体正式批量同步
- 第三阶段：PWA 离线采集（Service Worker + 本地队列）
- 型号目录 PC 端维护界面（当前由网站分类树自动同步）

---

# 附：v1.5 仓库快速盘点（型号 × 颜色 × 数量 × 盘点批次）

> 版本：v1.5（2026-08-07）
> 核心：产品款式 → 手机型号 → 颜色 → 数量 → 盘点批次；**不依赖固定货位**；盘点数据与商品采集数据职责分离。

## 1. 数据库新增（database.ts）

| 表 | 用途 |
|---|---|
| `inventory_sessions` | 盘点批次（session_code INV-YYYYMMDD-XXX、名称、类型、操作员、状态 active/completed/cancelled） |
| `inventory_products` | 批次内盘点产品（+ `snapshot_json` 网站库存快照、`progress_json` 进度记忆） |
| `inventory_model_counts` | 型号盘点行（品牌/型号/状态 counted/skipped/out_of_stock） |
| `inventory_color_counts` | 颜色×数量（quantity、count_type exact/estimated/not_counted、stock_status in_stock/low/out_of_stock、website_quantity、difference） |
| `inventory_stock_flags` | 缺货巡视记录（low/out_of_stock/restocked） |
| `warehouse_colors` | 颜色标准库（canonical_name + aliases，P1 预留） |

## 2. API（`/api/inventory`，`routes/inventory.ts` + `services/inventoryService.ts`）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST/GET | `/sessions` | 创建批次（自动编号）/ 列表（?status=active） |
| GET | `/sessions/:id` | 批次详情 + 统计（产品/型号/颜色/总数/无货/少量） |
| POST | `/sessions/:id/complete` / `cancel` | 完成/取消 |
| POST | `/sessions/:id/products` | 加入盘点产品（自动抓网站库存快照） |
| GET | `/products/:id` | 盘点产品详情（型号目录+已盘+上次盘点+网站快照） |
| PUT | `/products/:id/models/:model` | 保存单型号（颜色数组重写） |
| POST | `/products/:id/batch` | 批量保存多个型号 |
| GET | `/products/:id/summary` | 汇总矩阵（型号×颜色） |
| GET | `/products/:id/differences` | 与网站快照差异比较（match/small/large） |
| POST/GET | `/stock-flags` | 缺货巡视记录/查询 |

## 3. 前端

- 手机端 `/mobile-inventory`（`MobileInventoryPage.tsx` + `components/mobileInventory/InventoryModelCounter.tsx`）：
  批次选择/新建 → 搜索产品 → 品牌分组（显示已盘数）→ **连续型号盘点**（一次一个型号：颜色行下拉 + `[-5][-1]` `[+1][+5]` 数量步进 + 数字输入；精确/大约；输入 0 = 无货红显；**☑ 自动继承上一型号颜色**；跳过=skipped；保存并下一个；800ms debounce 自动保存 + `✓ 已保存`；进度条 + 已盘 ✓ 标记）→ 汇总矩阵（型号×颜色表 + 统计 + 网站差异大项）→ 完成批次
- 电脑端 `/inventory`（`InventoryDashboardPage.tsx`）：当前盘点（批次卡/统计/产品卡/矩阵弹窗）、历史记录、库存差异（大差异=绝对值>3 红色）
- 路由：`main.tsx` 注册 + TopBar「📦 仓库盘点」入口

## 4. 关键设计

- 颜色自动继承：`prevColors` 传入下一型号，`autoInherit` 默认开启
- 进度记忆：localStorage `mobile_inventory_progress`（退出重进可继续上次批次/产品）
- 网站快照：加入产品时异步 `fetchCombinations` + 全量属性值 → `snapshot_json`，差异比较用快照（不实时请求网站）
- 盘点路由不要求手机 token（内网后台 + 手机共用）
- 与 v1.4 完全兼容：`/mobile-capture`、`/mobile-capture-review` 未改动

## 5. v1.5 未实现（后续）

- 选中差异批量同步 PrestaShop 库存（当前只对比不写网站）
- CSV/Excel 导出、颜色标准库维护 UI、缺货巡视独立页面
- 本地离线队列（localStorage 缓存）、PWA
