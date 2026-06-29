# TEMCO Product Studio 开发文档

## 1. 项目概述

TEMCO Product Studio 是一个本地运行的 PIM（产品信息管理）+ DAM（数字资产管理）+ AI 内容生成平台，专为 TEMCO 公司的 PrestaShop 商品管理而设计。

### 核心流程

```
Google Sheet 商品库
→ 导入到本地 SQLite
→ Google Drive 图片/视频素材匹配
→ AI 生成中西双语内容
→ 图片处理（白底/压缩/ALT/SEO 文件名）
→ 人工审核编辑
→ 导出 PrestaShop CSV
→ 上传到 PrestaShop
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite 5 |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | SQLite (better-sqlite3) |
| 图片处理 | sharp |
| AI 文案 | DeepSeek / OpenAI / 模板生成 |
| AI 图片 | KIE API (nano-banana-2 / GPT Image 2) |
| 数据导入 | Google Sheet CSV / 本地 CSV 文件 |

---

## 2. 项目结构

```
TEMCO_Product_Studio/
├── start.bat                 # 一键启动脚本
├── stop.bat                  # 停止服务脚本
├── package.json              # 根配置
├── TEMCO_Product_Studio_开发文档.md
│
├── server/                   # 后端
│   ├── src/
│   │   ├── index.ts          # Express 入口
│   │   ├── database/
│   │   │   └── database.ts   # SQLite 初始化（9 张表）
│   │   ├── routes/
│   │   │   ├── products.ts   # 商品 CRUD API
│   │   │   ├── settings.ts   # 系统设置 API
│   │   │   ├── sheet.ts      # Google Sheet 同步 API
│   │   │   ├── drive.ts      # Drive 素材匹配 API
│   │   │   ├── copy.ts       # 文案生成 API
│   │   │   ├── images.ts     # 图片处理 API
│   │   │   ├── aiImages.ts   # AI 图片生成 API
│   │   │   ├── upload.ts     # 图片上传/白底/场景 API
│   │   │   ├── import.ts     # CSV 文件导入 API
│   │   │   └── export.ts     # PrestaShop CSV 导出 API
│   │   └── services/
│   │       ├── copyGenerator/      # 文案生成器
│   │       │   ├── types.ts         # 接口定义
│   │       │   ├── templateGenerator.ts  # 模板生成（兜底）
│   │       │   ├── openaiGenerator.ts   # OpenAI/DeepSeek
│   │       │   └── index.ts         # Provider 工厂
│   │       ├── imageGenerator/      # 图片生成器
│   │       │   ├── types.ts         # 提示词模板 + 配置
│   │       │   └── kieGenerator.ts  # KIE API 生成器
│   │       ├── driveScanner.ts      # Drive 扫描引擎
│   │       └── imageProcessor.ts    # sharp 图片处理
│   ├── data/
│   │   ├── temco.db           # SQLite 数据库
│   │   ├── uploads/           # 上传的图片
│   │   ├── cache/             # 图片缓存
│   │   ├── processed/         # 处理后的图片
│   │   └── exports/           # 导出的 CSV
│   ├── package.json
│   └── tsconfig.json
│
└── client/                   # 前端
    ├── src/
    │   ├── App.tsx           # 主应用（三栏布局）
    │   ├── main.tsx          # 入口
    │   ├── index.css         # 全局样式
    │   ├── services/api.ts   # API 服务层
    │   ├── types/index.ts    # TypeScript 类型
    │   └── components/
    │       ├── TopBar.tsx          # 顶部导航栏
    │       ├── LeftPanel.tsx       # 左侧筛选面板
    │       ├── ProductTable.tsx    # 商品列表表格
    │       ├── ProductDetail.tsx   # 商品详情/编辑面板
    │       ├── SheetSyncModal.tsx   # Sheet 同步弹窗
    │       ├── SettingsModal.tsx   # 系统设置弹窗
    │       ├── DriveScanModal.tsx  # Drive 扫描弹窗
    │       ├── CopyGenerationModal.tsx  # 文案生成弹窗
    │       ├── ImageProcessModal.tsx    # 图片处理弹窗
    │       ├── AiImageModal.tsx    # AI 生图弹窗
    │       ├── ImageWorkshopModal.tsx  # 图片工坊
    │       ├── ImageViewerModal.tsx    # 图片查看器
    │       └── ExportModal.tsx     # CSV 导出弹窗
    ├── package.json
    ├── tsconfig.json
    └── vite.config.ts
```

---

## 3. 数据库表结构

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `products` | 商品主表 | reference, name, category, brand, status, video_url |
| `product_contents` | 双语内容 | product_id, lang(es/zh), name, description, seo 等 |
| `product_images` | 图片 | product_id, role, local_path, alt, export_name |
| `product_videos` | 视频 | product_id, name, web_view_link |
| `drive_assets` | 素材匹配日志 | product_id, asset_type, match_status |
| `api_settings` | 系统设置 | key, value (20+ 项配置) |
| `api_logs` | API 调用日志 | provider, type, status, tokens |
| `export_logs` | 导出记录 | export_type, product_count, file_path |
| `batch_settings` | 批量限制 | key, value |

---

## 4. API 端点

### 商品管理
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/products` | 商品列表（搜索/筛选/分页） |
| GET | `/api/products/:ref` | 商品详情 |
| PATCH | `/api/products/:ref` | 更新商品 |
| DELETE | `/api/products/:ref` | 删除商品 |
| POST | `/api/products/batch-status` | 批量更新状态 |
| POST | `/api/products/batch-delete` | 批量删除 |
| GET | `/api/products/meta/categories` | 分类列表 |
| GET | `/api/products/meta/statistics` | 统计数据 |

### 图片上传与处理
| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/upload/upload-batch/:ref` | 批量上传图片 |
| POST | `/api/upload/white-bg/:ref/:imgId` | 生成白底图 (sharp) |
| POST | `/api/upload/scene/:ref/:imgId` | 生成场景图 (KIE) |
| DELETE | `/api/upload/image/:imgId` | 删除图片 |
| PATCH | `/api/upload/image/:imgId` | 更新图片信息 |
| GET | `/api/upload/file/:filename` | 获取图片文件 |
| GET | `/api/upload/files/browse` | 图片文件夹浏览 |
| GET | `/api/upload/files/list` | 文件列表 JSON |

### AI 内容生成
| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/copy/generate/:ref` | 生成双语文案 |
| POST | `/api/copy/generate-batch` | 批量生成文案 |
| POST | `/api/copy/preview/:ref` | 预览文案（不保存） |

### AI 图片生成
| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/ai-images/generate/:ref` | 生成 AI 图片 |
| GET | `/api/ai-images/preview-prompts/:ref` | 预览提示词 |
| GET | `/api/ai-images/config` | 获取 AI 配置 |
| PATCH | `/api/ai-images/prompts` | 更新提示词模板 |

### 数据导入导出
| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/sheet/sync` | Google Sheet 同步 |
| POST | `/api/sheet/sync-csv` | CSV 文本导入 |
| POST | `/api/import/import-file` | 本地 CSV 文件导入 |
| GET | `/api/export/prestashop-csv` | 导出 PrestaShop CSV |

---

## 5. AI 生成说明

### 文案生成 (CopyGenerator)
```
接口: CopyGenerator.generateProductContent(input)
实现:
  - TemplateCopyGenerator  (无 API Key 时兜底)
  - OpenAICopyGenerator    (DeepSeek / OpenAI)
输出: { es: {...}, zh: {...} }  中西双语 JSON
```

### 图片生成 (KIE API)
```
创建任务: POST https://api.kie.ai/api/v1/jobs/createTask
查询任务: GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=xxx
```

**支持模型：**
| 模型 | 用途 | API 方法 |
|------|------|---------|
| nano-banana-2 | 文生图/参考图 | `generator.nanoBanana2()` |
| gpt-image-2-text-to-image | 海报/Banner | `generator.gptImage2TextToImage()` |
| gpt-image-2-image-to-image | 图生图/精修 | `generator.gptImage2ImageToImage()` |

---

## 6. 状态说明

### 商品状态流转
```
待处理 → 缺图片文件夹 → 已匹配图片 → 已匹配视频
       → 双语文案待生成 → 双语文案已生成 → 西语文案待审核
       → 图片ALT待生成 → SEO待检查 → SEO通过
       → 可导出PrestaShop → 已导出 → 上传失败 / 已上传
```

### 5 槽位图片管理
| 槽位 | role 值 | 说明 |
|------|---------|------|
| 🖼 产品主图 | main_product | 白底精修图 |
| 📦 包装图 | packaging | 包装盒展示 |
| 🏠 场景图 1 | scene1 | 真实使用环境 |
| 🏢 场景图 2 | scene2 | 商用场景 |
| 🔍 场景图 3 | scene3 | 细节特写 |
