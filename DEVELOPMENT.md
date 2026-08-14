# TEMCO Product Studio - 开发文档

> 版本：v1.6+（2026-08）
> 覆盖模块：商品管理、AI 双语文案/图片、PrestaShop 同步与变体（组合）、分类图片、产品图片、网站商品导入、产品清单核对、手机采集（v1.4）、仓库快速盘点（v1.5）、CAJA 新品检查与批量上传（v1.6）

---

## 架构总览

### 前后端分离 + 移动端页面
```
┌─────────────────────────┐      HTTP/JSON       ┌──────────────────┐      SQL      ┌──────────┐
│  Frontend :5173         │ ────────────────────→ │  Backend :3001   │ ───────────→ │  SQLite  │
│  React 18 + Vite 5      │ ←──────────────────── │  Express + TS    │ ←─────────── │ temco.db │
│  ├── 主工作台 /         │                      │  (tsx 运行)      │               │          │
│  ├── /mobile-capture    │                      └──────────────────┘               └──────────┘
│  ├── /mobile-capture-review │                          │
│  ├── /mobile-inventory  │                              │ PrestaShop WebService API (XML, ws_key)
│  └── /inventory         │                              ↓
└─────────────────────────┘                     ┌──────────────────────┐
       │  手机（同一 Wi-Fi 局域网直连）          │  PrestaShop 网站      │
       ↓                                        │  (www.temco.es)       │
  Browser / 手机浏览器                           └──────────────────────┘
       │
       │ Vite Proxy（/api → :3001）
       ↓
  外部依赖：Google Sheet（公开 CSV）/ Google Drive（素材）/ DeepSeek·OpenAI（文案）/ KIE（AI 图片）
```

### 端口与访问
| 项 | 值 |
|---|---|
| 后端 | `http://localhost:3001`（`process.env.PORT || 3001`） |
| 前端 | `http://localhost:5173`（`host: true`，局域网可访问） |
| 手机采集页 | `/mobile-capture` |
| 采集审核页 | `/mobile-capture-review`（独立路径，也可从主工作台顶栏进入） |
| 手机盘点页 | `/mobile-inventory` |
| 盘点仪表盘 | `/inventory`（整页跳转） |

### 关键设计决策
| 决策 | 选择 | 原因 |
|------|------|------|
| 数据库 | SQLite (better-sqlite3, WAL) | 零配置，单文件，适合本地工具 |
| API 格式 | REST + JSON | 简单直观，符合 Express 惯例 |
| 前端状态 | React useState + props | 无复杂状态管理，组件树简单 |
| 路由 | 无 react-router，`main.tsx` 手写 `location.pathname` 分支 | 依赖少，页面少 |
| 图片存储 | 文件系统（`server/data/`） | 无需对象存储，本地访问快 |
| 类型检查 | TypeScript strict | 保证代码质量 |
| 网站集成 | PrestaShop WebService API（XML + `ws_key` 查询参数） | PrestaShop 官方标准接口 |
| 移动端认证 | Bearer token（`mobile_auth_tokens` 持久化，12h 过期） | 手机端与电脑端分离鉴权 |

---

## 目录结构

```text
TEMCO_Product_Studio/
├── package.json / start.bat / stop.bat     # 一键启动/停止（后端 + 前端）
├── server/
│   ├── src/
│   │   ├── index.ts                        # Express 入口：中间件 + 19 组路由挂载 + 健康检查
│   │   ├── database/database.ts            # 建表 + ensureColumn 迁移 + 默认设置（全部表）
│   │   ├── middleware/
│   │   │   ├── mobileAccessAuth.ts         # 手机 PIN 登录 + token 签发/校验（requireMobileAuth）
│   │   │   └── mobileUpload.ts             # 手机图片/音频 multer 内存上传（大小/MIME 白名单）
│   │   ├── routes/                         # 见「API 路由文档」
│   │   └── services/                       # 见「服务层」
│   └── data/                               # temco.db、uploads/、mobile-captures/、exports/、processed/
└── client/
    ├── vite.config.ts                      # host:true、端口 5173、/api 代理 → :3001
    └── src/
        ├── main.tsx                        # 手写路由分支 + LanguageProvider(i18n)
        ├── App.tsx                         # 主工作台（顶栏/左栏/列表/详情 + 弹窗状态开关）
        ├── pages/                          # MobileCapturePage / MobileCaptureReviewPage /
        │                                   # MobileInventoryPage / InventoryDashboardPage /
        │                                   # CategoriesPage / ProductImagesPage
        ├── components/                     # 弹窗 + 主界面组件 + mobileCapture/ 子目录
        ├── services/api.ts                 # 按模块分组的 API 封装
        ├── hooks/                          # useMobileCaptureSession / useBarcodeScanner / useCameraCapture
        ├── i18n/                           # 中西双语轻量 i18n（LanguageProvider / useI18n）
        └── types/                          # index.ts + mobileCapture.ts 类型
```

---

## 数据库 Schema（按模块）

数据库文件：`server/data/temco.db`。所有建表/迁移集中在 `server/src/database/database.ts` 的 `initializeDatabase()`。

### 基础表
| 表 | 用途 |
|---|---|
| `products` | 商品主表（`reference` 唯一；名称/分类/品牌/型号/状态/价格/条码/`sheet_raw_data` 原始 JSON） |
| `product_contents` | 商品双语内容（`lang` es/zh 唯一；名称/短描述/长描述/SEO/友好URL/WhatsApp 文案/视频脚本） |
| `product_images` | 商品图片（角色 main/gallery、槽位 `image_slot`、ALT、本地路径、PrestaShop 图片 ID） |
| `product_videos` | 商品视频（每商品一条，Drive 链接/本地路径） |
| `drive_assets` | Google Drive 素材匹配日志（image/video/folder） |
| `api_settings` | API 设置 KV 表（PrestaShop / AI / Google / FTP / 批量限制等） |
| `api_logs` | AI API 调用日志（provider/模型/token/耗时/成本估算） |
| `export_logs` | 导出记录（`prestashop_csv` / `review_csv`） |
| `batch_settings` | 批量限制 KV 表 |

### 网站导入/匹配模块（websiteImport）
| 表 | 用途 |
|---|---|
| `prestashop_import_batches` | 网站商品导入批次（行数/匹配数/`is_current`/导入模式 replace|append/激活假设） |
| `prestashop_product_snapshots` | 网站商品快照（reference/价格含税不含税/数量/激活假设/校验结果/`raw_data`） |
| `product_website_matches` | 本地商品 ↔ 网站快照匹配关系（matched/conflict/unmatched、置信度） |

### 分类图片模块（categories，v1.1）
| 表 | 用途 |
|---|---|
| `categories` | 分类树（`prestashop_category_id` 唯一、父级、`full_path` 全路径） |
| `category_images` | 分类图片资产（路径/sha256/忽略标记） |
| `category_image_mappings` | 分类↔图片映射（match_type exact/alias/fuzzy/manual、status suggested/confirmed/rejected/conflict） |
| `category_image_upload_jobs` | 分类图片上传任务（cover/thumb、attempt_count、http_status、error_message） |

### 产品图片模块（productImages，v1.3）
| 表 | 用途 |
|---|---|
| `product_scan_images` | 扫描到的产品图片资产（提取型号/序列号/序号/角色） |
| `product_scan_mappings` | 扫描图片↔产品映射（match_type、confidence、image_position、is_cover） |
| `product_image_upload_jobs` | 产品图片上传任务（batch_id、prestashop_product_id、remote_image_id） |

### 产品清单核对模块（productListImport）
| 表 | 用途 |
|---|---|
| `product_list_import_batches` | 产品清单导入批次（关联 `website_batch_id`） |
| `product_list_import_items` | 清单明细（reference/名称/型号/品牌/价格 + 检查状态 + 冲突详情） |

### 手机采集模块（mobileCapture，v1.4）
| 表 | 用途 |
|---|---|
| `mobile_auth_tokens` | 手机端认证 token（PIN 签发，**持久化**，后端重启不掉线） |
| `mobile_capture_sessions` | 采集会话（操作员/设备/区域，`session_code` 如 CAP-20260803-001） |
| `mobile_captures` | 采集任务（序列号/EAN/型号/颜色 `colors`/点货型号 `phone_models`；状态机 draft→submitted→approved→…→synced） |
| `mobile_capture_images` | 手机原图（sha256 **去重**、role、is_cover、审核状态） |
| `mobile_capture_image_colors` | 图片↔颜色绑定（`prestashop_attribute_id` 映射状态） |
| `mobile_capture_inventory` | 按颜色库存（count_type: exact/estimated/sufficient/unknown） |
| `mobile_capture_audio_notes` | 语音备注（时长/转写） |
| `mobile_capture_processed_images` | AI 精修处理图（一对多关联原图 `source_image_id`，只上网站） |
| `variant_drafts` | 变体草稿（颜色/数量/action_type create|update|ignore、同步状态） |
| `phone_model_catalog` | 手机壳点货型号目录（brand+model+source: preset/website/website_category，**仅统计用**） |

### 仓库盘点模块（inventory，v1.5）
| 表 | 用途 |
|---|---|
| `inventory_sessions` | 盘点批次（`session_code` 如 INV-20260807-001、状态 active/completed/cancelled） |
| `inventory_products` | 盘点产品（`snapshot_json` 网站库存快照、`progress_json` 进度记忆） |
| `inventory_model_counts` | 型号数量（counted/skipped/out_of_stock） |
| `inventory_color_counts` | 颜色数量（与 `website_quantity` 差异对比） |
| `inventory_stock_flags` | 缺货巡视记录（low/out_of_stock/restocked） |
| `warehouse_colors` | 仓库颜色字典（canonical_name/display_name/hex/prestashop_color_id/aliases） |

### CAJA 新品检查模块（cajaCheck，v1.6）
| 表 | 用途 |
|---|---|
| `caja_check_batches` | 检查批次（文件/行数/三态计数/网站商品数/status pending→reading_excel→fetching_website→matching→completed/failed） |
| `caja_check_items` | 检查明细（CAJA 编号/条码/名称/价格 + result_status existing|new|review + match_method + 匹配到的网站商品 + `upload_status` created|exists + `upload_error`） |

### ensureColumn 迁移（版本演进追加列）
- `products`：`selling_points`、`product_intro`、`prestashop_sync_status`、`prestashop_last_sync_at`、`prestashop_last_error`、`prestashop_category_id`、`prestashop_manufacturer_id`、`prestashop_shop_id`、`video_url`、`ean13`、`upc`、`mpn`、`price`、`quantity`、`wholesale_price`、`serial_number`、`model`、`aliases`、`image_count`、`sold_out`、`sold_out_at`
- `product_images`：`image_slot`、`prestashop_image_id`、`prestashop_sync_status`、`prestashop_last_sync_at`、`prestashop_last_error`
- `category_image_upload_jobs`：`image_type`、`operation`、`request_method`
- `mobile_captures`：`phone_models`、`colors`
- `caja_check_items`：`upload_error`、`upload_status`

---

## API 路由文档

路由挂载（`server/src/index.ts`）：

| 前缀 | 路由文件 |
|---|---|
| `/api/products` | products.ts |
| `/api/settings` | settings.ts |
| `/api/sheet` | sheet.ts |
| `/api/drive` | drive.ts |
| `/api/copy` | copy.ts |
| `/api/images` | images.ts |
| `/api/ai-images` | aiImages.ts |
| `/api/import` | import.ts |
| `/api/export` | export.ts |
| `/api/upload` | upload.ts |
| `/api/prestashop` | prestashop.ts |
| `/api/website-import` + `/api/product-lookup` | websiteImport.ts（同一 router 双前缀） |
| `/api/product-list-import` | productListImport.ts |
| `/api/categories` | categories.ts |
| `/api/product-images` | productImages.ts |
| `/api/mobile-capture` | mobileCapture.ts |
| `/api/inventory` | inventory.ts |
| `/api/caja-check` | cajaCheck.ts |

### 商品管理 `/api/products`
| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/` | 商品列表（search/status/category/brand/upload_status/dateFilter/refs + 分页 + 动态状态） |
| GET | `/:reference` | 商品详情（含双语内容、图片、视频、sheet 原始数据） |
| POST | `/` | 创建商品 |
| PATCH | `/:reference` | 更新商品字段与双语内容 |
| POST | `/batch-status` | 批量更新状态 |
| DELETE | `/:reference` | 删除商品（级联） |
| POST | `/batch-delete` | 批量删除 |
| GET | `/meta/categories` `/meta/brands` `/meta/statistics` | 分类/品牌列表、状态统计（含动态"已上传图片"） |

### 设置 `/api/settings`
| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/` | 全部设置（敏感 Key 脱敏） |
| POST | `/test/:section` | 测试 copy/image/article 三种 API 配置 |
| PATCH | `/:key` | 更新单个设置（白名单 + 脱敏值跳过） |
| PUT | `/batch` | 批量更新 |
| GET | `/batch-limits` | batch_settings 批量限制 |

### 数据导入 `/api/sheet` / `/api/import`
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/sheet/sync` | Google Sheet 公开 CSV 导入（自动列名映射） |
| POST | `/api/sheet/test` | 测试 Sheet 连接 |
| POST | `/api/sheet/sync-csv` | 粘贴 CSV 导入 |
| POST | `/api/import/import-file` | 本地文件路径导入 PrestaShop CSV（分号分隔） |

### 素材匹配 `/api/drive`
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/scan` | 扫描素材（imageFolderMap），写 drive_assets + 更新状态 |
| POST | `/match/:reference` | 单商品手动匹配图片/视频 |
| GET | `/status/:reference` | 商品素材匹配状态 |
| GET | `/summary` | 扫描摘要统计（匹配/缺失/孤儿/异常） |

### 文案生成 `/api/copy`
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/generate/:reference` | 单商品双语文案 |
| POST | `/generate-batch` | 批量生成（batch_copy_limit 限制） |
| POST | `/preview/:reference` | 预览（不写库） |
| POST | `/test-api` | 测试文案 API 连接 |
| GET | `/config` | 文案生成配置状态 |
| POST | `/generate-alt/:reference` | 图片双语 ALT（AI 优先，模板兜底，写库） |

### 图片处理 `/api/images` / AI 图片 `/api/ai-images`
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/images/process/:reference` | 处理商品图片（SEO 文件名 + ALT + sharp） |
| POST | `/api/images/process-batch` | 批量处理 |
| GET | `/api/images/processed/:reference` | 处理后图片信息 |
| GET | `/api/images/preview/:reference` | 预览文件名与 ALT（不处理） |
| GET | `/api/images/file/:filename` | 访问 data/processed 处理图 |
| GET | `/api/ai-images/config` `/types` | 图片生成配置 / 图片类型 |
| PATCH | `/api/ai-images/prompts` | 更新各类型提示词 |
| POST | `/api/ai-images/prompts/reset` | 重置默认提示词 |
| GET | `/api/ai-images/preview-prompts/:reference` | 预览商品渲染后提示词 |
| POST | `/api/ai-images/generate/:reference` | 生成 AI 图片（KIE 真实生成→下载→写库；未配置仅返回提示词） |

### 导出 `/api/export`
| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/prestashop-csv` | 导出 PrestaShop CSV（保留原始表头、更新品牌列，写 export_logs） |
| GET | `/download/:filename` | 下载 data/exports 下的导出文件 |

> 说明：当前导出基于**本地数据库** `products.sheet_raw_data`（原始表头 + 品牌覆盖），不包含网站变体。若需「网站全部产品+变体」导出，需基于 PrestaShop API（products + combinations）新增端点。

### 图片上传/文件 `/api/upload`
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/upload/:reference` | 上传单张图片（multer 落盘 + 写 product_images） |
| POST | `/upload-batch/:reference` | 批量上传（≤10 张，支持槽位替换） |
| POST | `/white-bg/:reference/:imageId` | sharp 生成白底图 |
| POST | `/scene/:reference/:imageId` | 生成场景图（KIE 生成→下载；无配置时 sharp 占位） |
| PATCH | `/image/:imageId` | 更新图片信息 |
| DELETE | `/image/:imageId` | 删除图片（连本地文件，自动补主图） |
| GET | `/product/:reference` | 商品全部图片 |
| GET | `/files/list` `/files/browse` `/files/product/:reference` | 文件浏览（JSON/HTML） |
| GET | `/file/:filename` `/file/product/:reference/:filename` | 文件访问 |
| ALL | `/open-folder/:reference` | Windows 资源管理器打开产品文件夹 |
| POST | `/verify-images/:reference` | 验证文件存在性，清理失效记录 |
| POST | `/organize-images` | 未匹配图片归入 `_unmatched/` |
| POST | `/batch-rename` | 批量重命名（`.jpg_2K_数字.jpeg` → `.jpeg`） |
| POST | `/export-data/:reference` | 导出产品数据（JSON+CSV）到产品文件夹 |
| POST | `/migrate-images/:reference` | 迁移旧图到产品文件夹 |
| POST | `/scan-folder` | 扫描 scan-input 目录，按文件名提取编号匹配产品入库（支持 dryRun） |

### PrestaShop 同步 `/api/prestashop`
| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/config` | 配置（API Key 脱敏） |
| PATCH | `/config` | 保存配置 |
| GET | `/test-connection` | 测试连接 |
| GET | `/languages` `/categories` `/manufacturers` `/shops` | 读取网站基础数据 |
| GET | `/validate-product/:ref` | 同步前本地校验 |
| POST | `/sync-product/:ref` | 同步商品（可选内容/SEO/分类/品牌/图片/视频/价格/库存） |
| POST | `/sync-all-prices` | 批量同步价格 |
| POST | `/toggle-active/:ref` | 激活/停用 |
| POST | `/sync-image/:imgId` | 同步单张图片 |
| POST | `/sync-images/:ref` | 同步商品全部图片 |
| GET | `/check-alt/:ref` | 检查网站图片 ALT（legend） |
| GET | `/combinations/:productId` | 读取网站现有变体（组合 + 真实库存） |
| GET | `/option-values` | 属性值（`?scope=color` 仅颜色组） |
| GET | `/permission-check` | 变体资源权限检测 |
| POST | `/combinations/:productId` | 创建变体 |
| PUT | `/combinations/:id` | 更新变体 |
| DELETE | `/combinations/:id` | 删除变体 |

### 网站商品导入 `/api/website-import`（含 `/api/product-lookup`）
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/preview` | 上传 CSV 预览（解析/归一化/匹配估算） |
| POST | `/commit` | 正式导入（批次+快照+匹配，更新网站状态） |
| GET | `/current` | 当前导入批次及匹配统计 |
| GET | `/batches/:batchId` | 批次详情 |
| POST | `/rematch/:batchId` | 重新匹配 |
| POST | `/api/product-lookup/query` | 批量编号查询本地商品（reference/ean13/upc） |

### 产品清单导入 `/api/product-list-import`
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/preview` | 预览 Excel 并估算检查结果 |
| POST | `/commit-file` | 上传 Excel 执行检查落库 |
| POST | `/commit` | 直接提交行数据检查 |
| GET | `/batches/:batchId/items` | 批次检查结果（筛选/分页/排序） |
| GET | `/history` | 导入历史（最近 20 批次） |
| GET | `/batches/:batchId/export` | 导出检查结果 CSV |
| POST | `/batches/:batchId/recheck` | 基于旧批次重新检查 |
| POST | `/find-images` | 按型号递归查找文件夹图片 |
| POST | `/copy-images` | 复制查找到的图片到目标文件夹 |
| GET/POST | `/folder-settings` | 读写源/目标文件夹路径 |

### 分类图片 `/api/categories`
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/import-csv` | 导入分类 CSV |
| POST | `/sync-prestashop` | 从 PrestaShop 同步分类 |
| GET | `/` `/stats` `/parents` | 分类列表/统计/父级筛选 |
| POST | `/scan-images` | 扫描分类图片目录 |
| GET | `/images` | 图片列表 |
| POST | `/images/clear` | 清空图片库 |
| POST | `/images/:id/ignore` | 忽略/恢复图片 |
| GET | `/images/:id/preview` | 图片预览 |
| POST | `/matching/run` | 自动匹配（精确/别名/模糊） |
| GET | `/matching/results` | 匹配结果 |
| POST | `/matching/confirm` `/reject` `/manual-map` | 确认/拒绝/人工映射 |
| POST | `/uploads/preview` | Dry Run 预检 |
| POST | `/uploads/create` | 创建上传批次 |
| POST | `/uploads/:batchId/start` `/cancel` `/retry-failed` | 上传控制 |
| GET | `/uploads/:batchId` `/uploads` `/uploads/:batchId/logs` | 批次状态/列表/日志 CSV |

### 产品图片 `/api/product-images`
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/scan` | 扫描产品图片目录 |
| GET | `/` `/stats` | 图片列表/统计 |
| POST | `/clear` | 清空扫描图库 |
| POST | `/matching/run` | 自动匹配产品 |
| GET | `/matching/results` | 匹配结果 |
| POST | `/matching/confirm` `/reject` `/manual-map` | 确认/拒绝/人工映射 |
| POST | `/uploads/preview` `/create` | 预检/创建批次 |
| POST | `/uploads/:batchId/start` `/retry-failed` | 上传控制 |
| GET | `/uploads/:batchId` | 批次状态 |

### 手机采集 `/api/mobile-capture`（v1.4，约 70 端点）
- **认证**：`POST /auth/pin`（PIN 登录发 token）、`GET /access-info`（局域网 IP + PIN 是否配置，不返回明文）
- **手机端**（全部 `requireMobileAuth` Bearer token）：
  - 会话：`POST/GET /sessions`、`GET /sessions/:id`、`POST /sessions/:id/complete`、`POST /sessions/:id/cancel`
  - 产品：`POST /products`（新增）、`GET /products/search`（本地匹配+实时网站同步）、`GET /products/fuzzy`、`GET /products/by-ean/:ean`、`/by-serial/:serial`、`/by-reference/:reference`、`/by-model/:model`、`GET /products/:id/capture-status`、`POST /products/:id/sold-out`、`GET /phone-models`、`POST /phone-models/sync`、`PUT /captures/:id/phone-models`
  - 采集任务：`POST /captures`、`GET /captures`、`GET/PATCH /captures/:id`、`POST /captures/:id/submit|cancel|reopen`
  - 图片：`POST/GET /captures/:id/images`、`PATCH/DELETE /images/:imageId`、`POST /images/:imageId/colors`、`GET /images/:imageId/file`
  - 库存：`PUT/GET /captures/:id/inventory`
  - 语音：`POST/GET /captures/:id/audio-note(s)`、`DELETE /audio-notes/:id`
- **电脑审核端**（局域网可信，无 token）：
  - `GET /stats`、`GET /review/captures`、`PATCH/GET /review/captures/:id`、`POST /review/captures/batch-delete`
  - 图片：`POST /review/captures/:id/images/reupload`、`GET /review/images/:imageId/file`、`POST /review/captures/:id/processed-images`、`GET/PATCH/DELETE /review/processed-images/...`
  - 审核动作：`POST /review/captures/:id/start-review|approve|reject|mark-ready`、`POST /review/images/:imageId/approve|reject`、`PATCH /review/images/:imageId`、`POST /review/images/:imageId/colors`、`POST /review/captures/:id/inventory/approve`
  - 网站同步：`POST /review/captures/:id/sync-variants-to-website`（颜色+库存→变体）、`POST /review/captures/:id/push-to-product-images`、`POST /review/captures/:id/promote-images`、`POST /review/captures/:id/sync-images-to-website`、`POST /review/captures/:id/create-variant-drafts`
  - 颜色/草稿/清理：`GET /review/colors`、`POST /review/colors/:colorId/map`、`GET /variant-drafts`、`PATCH /variant-drafts/:id`、`POST /cleanup`

### 仓库盘点 `/api/inventory`（v1.5）
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/sessions` | 创建盘点批次 |
| GET | `/sessions` | 批次列表（按状态） |
| GET | `/sessions/:id` | 批次详情 |
| POST | `/sessions/:id/complete` `/cancel` | 完成/取消 |
| POST | `/sessions/:id/products` | 加入盘点产品 |
| GET | `/sessions/:id/products` | 批次产品列表 |
| GET | `/products/:id` | 盘点产品详情（含品牌分组） |
| POST | `/products/:id/refresh-snapshot` | 刷新网站库存快照（PrestaShop 实时） |
| PUT | `/products/:id/models/:model` | 保存单型号×颜色×数量 |
| POST | `/products/:id/batch` | 批量保存型号清单 |
| GET | `/products/:id/summary` | 盘点汇总（型号×颜色矩阵） |
| GET | `/products/:id/differences` | 与网站库存差异 |
| POST/GET | `/stock-flags` | 缺货记录 |

### CAJA 新品检查 `/api/caja-check`（v1.6）
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/preview` | 上传 Excel 预览（multer 内存 20MB，仅 xlsx/xls；缺表头 → `INVALID_CAJA_FILE`+missingColumns） |
| POST | `/run` | 正式检查：解析→读网站商品（display=[id,reference,ean13,upc,name,active]）→建索引→匹配→落库。**网站读取失败→整批 failed，绝不输出“全部新品”** |
| GET | `/batches` | 最近 20 个检查批次 |
| GET | `/batches/:id` | 批次详情 |
| GET | `/batches/:id/items` | 明细（默认 `status=new`；search 编号/条码/名称；分页默认 50） |
| POST | `/batches/:id/upload-to-website` | 勾选新品批量创建到网站（基础信息：reference/名称/售价/有效EAN/库存0/默认分类品牌；已上传跳过、网站已有同 reference 记 `exists`、失败记 `upload_error`） |
| GET | `/batches/:id/export` | 导出 CSV（默认新品，UTF-8 BOM） |
| DELETE | `/batches/:id` | 删除批次（级联明细） |

---

## 服务层（server/src/services）

| 模块 | 文件 | 职责 |
|---|---|---|
| 顶层 | `driveScanner.ts` | Drive 素材扫描（按 reference 匹配图片/视频） |
| 顶层 | `imageProcessor.ts` | sharp 图片处理、SEO 文件名与 ALT 生成 |
| 顶层 | `inventoryService.ts` / `inventoryWebsiteService.ts` | v1.5 盘点核心 + 网站快照辅助 |
| cajaCheck/ | `excelParser.ts`、`normalizer.ts`、`websiteIndex.ts`、`matcher.ts`、`cajaCheckService.ts`、`exportService.ts` | v1.6 CAJA 新品检查：解析/标准化/网站索引（Map）/匹配/服务/CSV |
| categoryImage/ | `categoryImageService.ts`、`categoryImageUploadService.ts`、`categoryThumbnailUploadService.ts`、`curlRunner.ts` | 分类 CSV/同步/扫描/匹配/上传/缩略图 FTP |
| copyGenerator/ | `index.ts`、`openaiGenerator.ts`、`templateGenerator.ts` | AI 文案（工厂按配置选 provider，模板兜底） |
| imageGenerator/ | `kieGenerator.ts` | KIE AI 图片（createTask→轮询） |
| mobileCapture/ | `mobileCaptureService.ts`、`matchingService`、`imageService`、`reviewService`、`pushService`、`cleanupService`、`phoneModelService.ts`、`variantDraftService.ts`、`websiteProductSyncService.ts` | v1.4 手机采集全链路 |
| prestashop/ | `prestashopClient.ts`（XML API 客户端）、`prestashopMapper.ts`（XML 构建）、`prestashopValidator.ts`、`productSyncService.ts`、`imageSyncService.ts`、`combinationService.ts`（变体 CRUD + 权限） | PrestaShop 同步引擎 |
| productImage/ | `productImageScanner.ts`、`productImageNameParser.ts`、`productImageMatchingService.ts`、`productImageUploadService.ts` | v1.3 产品图片批量上传 |
| productListCheck/ | `checkService.ts` | 产品清单行检查（on/not_on_website/missing/conflict） |
| websiteCatalog/ | `csvParser.ts`、`importService.ts`、`lookupService.ts`、`matcher.ts`、`normalizer.ts` | 网站 CSV 导入/匹配/查询 |

---

## 核心功能详解

### 动态状态计算
状态在服务端 `products.ts` 列表查询中实时计算（不依赖静态 `status` 字段，仅「已下架」读库）：

```
已下架         ← 手动设置（优先级最高）
已上传         ← 有 PS ID + 已同步 + 有西语文案
已上传图片     ← 有图片 + 无西语文案（含已同步无文案）
SEO通过       ← 有 SEO 标题 + SEO 描述
双语文案已生成 ← 有西语文案（es.name 非空）
已匹配图片     ← 有 main 槽位图片
待处理         ← 默认
```
- 「已上传图片」是动态 SQL 条件：`id IN (product_images) AND id NOT IN (product_contents es 非空)`。
- 完整状态清单（15 种，含「待处理/缺图片文件夹/已上传图片/已匹配图片/已匹配视频/双语文案待生成/双语文案已生成/西语文案待审核/图片ALT待生成/SEO待检查/SEO通过/已导出/上传失败/已上传/已下架」）。

### PrestaShop 同步
- **同步内容开关**：内容/SEO/分类/品牌/图片/视频/价格/库存可按需组合（`syncProductByRef`）。
- **图片同步**：按角色排序逐个上传；`skipExists`（跳过已存在）/ `append`（追加）两种模式；返回 total/success/skipped/failed 计数。
- **变体（组合）**：`combinationService` 读取 `combinations`（display=full）+ `stock_availables` 合并真实库存；创建时补齐 PS 必填字段；更新采用「回读现有 XML → 修改 → PUT」；删除直接 DELETE。权限需在 PrestaShop 后台勾选 combinations / product_option_values / stock_availables。
- **激活/停用**：读取完整商品 XML → 取反 active → 移除只读字段（manufacturer_name、quantity 等）→ PUT。

### 手机采集闭环（v1.4）
```
手机端（/mobile-capture，Bearer token）
  登录/会话 → 扫码或搜索（实时读网站：价格/图片数/库存/变体/启用状态）
  → 拍照（sha256 去重、角色、颜色）→ 颜色/库存/点货型号/备注语音 → 提交
电脑端（/mobile-capture-review）
  审核统计 + 任务列表 → 原图审核 → AI 精修处理图（只上网站）
  → 颜色/库存审核 → 同步：图片（处理后照片）→ 网站；颜色+库存 → 网站变体
```
- 图片只把「处理后照片」推送到网站，原图只留本地。
- `variant_drafts` 是变体正式同步的中间产物（第一阶段生成草稿，人工审核 action_type 后同步）。
- `phone_model_catalog` 预置常用 + 网站自动同步（Modelo 属性组 + 网站分类树），仅做统计、不同步网站。

### 仓库快速盘点（v1.5）
```
手机端（/mobile-inventory）：登录→选产品→选品牌→连续型号×颜色×数量盘点→汇总矩阵→完成
电脑端（/inventory）：当前盘点批次卡 + 历史记录 + 库存差异（实盘 vs 网站快照，|差|>3 红色标出）
```
- 盘点数据**只对比不同步网站**（防止误覆盖）；进度记忆在手机 localStorage。

### 网站商品导入 / 产品清单核对
- **网站导入**：上传 PrestaShop 导出的 CSV → `preview` 归一化（reference/ean/upc、价格含税不含税、数量、激活假设）→ `commit` 写批次 + 快照 + 与本地匹配（matched/conflict/unmatched），更新商品「网站状态」。
- **产品清单**：上传 xlsx/csv → 每行与本地库 + 网站快照比对，标记 6 种状态（已在网站/未在网站/本地库不存在/本地冲突/网站冲突/网站状态未知），默认筛出未上架商品回传主表；配套按型号找图/复制图工具。

### CAJA 新品检查与批量上传（v1.6）
只读比对工具：上传 CAJA 导出的 `Products.xlsx`（约 9,330 行/39 字段），只读取 `编号/条码/名称/名称2/进价/售价/编辑日期/状态`，**忽略库存/折扣/销量等字段**，与 PrestaShop 网站商品比对，默认只显示网站还没有的「🆕 新品」。
- **匹配优先级**：有效 EAN（纯数字 8–14 位）→ UPC → Reference（trim+大写）→ 标准化名称精确（NFD 去重音+大写+非字母数字归一）；**模糊名称相似绝不判 existing**（第一版不做模糊）；重复匹配（同 EAN/同 Reference 命中多个网站商品）→ `review` 防误判。
- **性能**：网站商品（1 万+）建 4 个 Map 索引（reference/ean/upc/标准化名称），9,000+ CAJA 行匹配接近 O(N)，禁止 O(N²) 双循环；前端分页 50 条。
- **安全**：网站 API 失败 → 整批 `failed`（禁止把全部商品误判为新品）；`websiteProducts.length === 0` → 中止。
- **批量上传到网站**：勾选行 → `uploadItemsToWebsite` 逐条：已上传跳过（`skipped`）→ 网站已有同 reference 记录现有 ID 且标记 `upload_status='exists'`（不重复创建）→ 否则 `buildProductXml`+`postXml` 创建基础商品（reference/名称/售价/有效 EAN/库存 0/默认分类品牌，**active=1 激活**）标记 `upload_status='created'`；失败记录 `upload_error` 不中断。前端区分显示 ✅ 已上传 / ⚠️ 网站已有 / ❌ 失败。

### AI 文案提示词要点
- 文案：标题 ≤65 字符、Meta 标题 ≤60、Meta 描述 ≤155、短描述 120-170、长描述 160-240 词（4 段）；双语（西+中）；禁止写航空/价格/认证/保修/快充/防水/材质等未确认内容。
- ALT：每图 35-75 字符、必须唯一、不重复完整产品名、只描述可见内容、GOOD/BAD 示例对比。

---

## 前端架构

### 路由（无 react-router）
`client/src/main.tsx` 用 `window.location.pathname.startsWith()` 手写分支（判断顺序）：
1. `/mobile-inventory` → MobileInventoryPage
2. `/inventory` → InventoryDashboardPage
3. `/mobile-capture-review` → MobileCaptureReviewPage（先于 mobile-capture，避免前缀误匹配）
4. `/mobile-capture` → MobileCapturePage
5. 默认 → App（主工作台）

`App.tsx` 内部：采集审核以覆盖层渲染 + `pushState` 到 `/mobile-capture-review`（popstate 关闭）；仓库盘点整页跳转 `/inventory`；分类管理/产品图片为 state 控制的模态覆盖层。

### 主工作台布局
```
TopBar（顶栏：数据导入组 | 内容处理组 | 图片处理组 | 管理/移动端组）
├── LeftPanel（状态/分类/网站状态筛选 + 统计计数）
├── content-area（搜索 + 筛选 + 列表 ProductTable + 分页）
├── splitter（可拖拽）
└── ProductDetail（右侧详情：双语内容/图片/SEO/同步/变体）
```
- 弹窗：SheetSyncModal、SettingsModal、DriveScanModal、CopyGenerationModal、ImageProcessModal、AiImageModal、ExportModal、ImageWorkshopModal、WebsiteImportModal、ProductListImportModal、CajaNewProductCheckModal、ImageFinderModal、ImageViewerModal。
- 遗留未引用组件：`ProductLookupModal.tsx` / `MissingProductsModal.tsx`（当前无调用方，属备用）。

### 移动端页面组件（components/mobileCapture/）
SessionStart、ProductScanner（BarcodeDetector→ZXing fallback）、ProductSearch、ProductSummary、CameraCapture、CaptureImageCard、ImageRoleSelector、ColorSelector、InventoryInput、InventoryReviewPanel、UploadQueue、ProductQuickEdit、CaptureTaskCard、CaptureReviewPanel、PhoneModelSelector、AudioNoteRecorder、MobileCaptureAccessModal 等。

### i18n
`client/src/i18n/index.tsx`：`LanguageProvider` + `useI18n` + `LangSwitch`，中文/西班牙语字典式翻译，全站可用。

### CSS 变量体系
`:root` 定义颜色（--bg-primary/--accent 等）、布局（--sidebar-width: 260px、--detail-width: min(45vw, 960px)、--topbar-height: 52px）、间距（8pt 基线 --space-1..6）、圆角、阴影。组件样式使用 `.modal-overlay/.modal-content/.btn/.btn-primary` 等通用类。

---

## 开发工作流

### 本地开发
```bash
# 一键启动（后端 tsx + 前端 vite）
npm run dev
# 或分开
cd server && npm run dev        # tsx watch src/index.ts，端口 3001
cd client && npm run dev        # vite --host，端口 5173

# 类型检查
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit

# 构建前端（生产：NODE_ENV=production 时后端托管 client/dist + SPA fallback）
cd client && npx vite build
```

### 添加新 API 路由
1. `server/src/routes/` 新建 `.ts`，用 `Router()` 定义端点
2. `server/src/index.ts` 注册：`app.use('/api/xxx', router)`
3. `client/src/services/api.ts` 添加封装方法

### 添加新前端页面
1. `client/src/pages/` 新建 `.tsx`
2. `client/src/main.tsx` 的 pathname 分支中注册（注意判断顺序）
3. 或作为 App 内的模态覆盖层（state 开关 + 条件渲染）

### 数据库迁移
SQLite 无内置迁移工具，惯例：
1. 新表：在 `initializeDatabase()` 中 `CREATE TABLE IF NOT EXISTS`
2. 加列：`ensureColumn(table, column, definition)`（自动 `PRAGMA table_info` 检查 + `ALTER TABLE`）
3. 默认设置：`insertDefaultSetting(key, value)`（INSERT OR IGNORE）

---

## 常见开发问题

### 代理不生效
`client/vite.config.ts`：`'/api' → target 'http://localhost:3001'`，`changeOrigin: true`。

### 图片路径
- `getImageUrl()` 解析 `local_path` → 访问 URL `data/uploads/{reference}/{filename}`
- 访问路由：`/api/upload/file/product/:reference/:filename`；处理图在 `data/processed/`（`/api/images/file/:filename`）

### 状态不同步
- 列表状态是动态计算的，不依赖数据库 `status` 字段（仅「已下架」读库）
- 筛选「已上传图片」使用特殊 SQL 条件，勿改回静态字段匹配

### PrestaShop API 错误
- 403/400 通常带错误 XML，看 `prestashopClient.ts` 的错误解析
- 常见错误：只读字段（manufacturer_name/quantity）、缺少必填字段（name/link_rewrite）、权限不足（Web Service Key 未勾选对应资源）

### 手机端访问失败
- 确认手机与电脑同一 Wi-Fi；用「手机采集」弹窗显示的真实局域网 IP（`/api/mobile-capture/access-info`）
- 后端重启后 token 仍有效（`mobile_auth_tokens` 持久化）
- 变体同步报权限：PrestaShop 后台 API Key 勾选 combinations / product_option_values / stock_availables

### 手机型号目录不全
`phone_model_catalog` 预置 + 网站同步（Modelo 属性组 + 分类树），启动时 `maybeSyncPhoneModelCatalog()` 自动同步（失败不阻塞服务）；也可在手机端「强制同步」。
