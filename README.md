# TEMCO Product Studio

本地运行的 TEMCO 商品素材与内容管理平台，用于批量管理 PrestaShop 商品的图片、视频、双语文案、SEO 字段和导出数据。

---

## 快速开始

### 1. 启动项目

**方式一：双击批处理文件**
```
项目文件夹 → 双击 start.bat
自动启动后端 → 前端 → 打开浏览器
```

**方式二：命令行启动**
```bash
cd TEMCO_Product_Studio
npm run dev
```

### 2. 访问地址

| 用途 | 地址 |
|------|------|
| 前端界面 | http://localhost:5173 |
| 后端 API | http://localhost:3001 |
| 图片文件夹 | http://localhost:3001/api/upload/files/browse |

### 3. 停止服务

- 关闭两个终端窗口
- 或双击 `stop.bat`

---

## 功能概览

### 📦 商品管理
- 商品列表（搜索、筛选、分页、排序）
- 商品详情编辑（基本信息、双语内容、SEO）
- 批量状态更新
- 全选 / 批量删除
- **5 槽位图片管理**：产品主图、包装图、场景图 1/2/3

### 📥 数据导入
- Google Sheet 同步（公开 CSV）
- CSV 文本粘贴导入
- 本地 PrestaShop CSV 文件导入（支持分号分隔）
- 智能字段映射（支持中西文列名）

### 📁 素材匹配
- 按商品 reference 自动匹配图片
- 识别主图（_1）和附图（_2+）
- 异常命名检测
- 视频匹配

### 📝 双语文案生成
- 西班牙语 + 中文双语生成
- DeepSeek / OpenAI API
- 无 API Key 时自动使用模板生成
- 单个 / 批量生成（最多 50 个）

### 🖼 图片处理
- sharp 处理：白底、裁切、压缩、1000x1000
- SEO 文件名生成
- 图片 ALT 文本生成

### 🎨 AI 图片生成（KIE API）
- 产品白底精修图
- 产品包装图
- 使用场景图 1/2/3
- 提示词自定义
- 图生图模式（保持产品一致性）

### 📸 图片工坊
三步工作流：上传手机照片 → 生成白底图 → 生成场景图

### 🏷 品牌管理
- 自动从商品名匹配品牌（TEMCO / HOPECOM）
- 批量更新品牌

### 📤 CSV 导出
- PrestaShop 格式导出（含更新后的品牌）
- 内部审核 CSV

---

## 配置说明

### 文案 API 设置

| 字段 | 说明 |
|------|------|
| Provider | DeepSeek / OpenAI / 模板 |
| API Base URL | DeepSeek: `https://api.deepseek.com` |
| Model | `deepseek-chat` / `gpt-4` 等 |
| API Key | 在设置页面配置，**留空则使用模板生成** |

### 图片 API 设置（KIE）

| 字段 | 说明 |
|------|------|
| Provider | 选择 **KIE API** |
| Model | nano-banana-2 / GPT Image 2 |
| API Key | 在 https://kie.ai/api-key 获取 |

**推荐模型：**
- 产品精修 → `gpt-image-2-image-to-image`
- 场景生成 → `nano-banana-2`
- 海报/Banner → `gpt-image-2-text-to-image`

### Google 设置

| 字段 | 说明 |
|------|------|
| Sheet URL | Google Sheet 链接 |
| Sheet 模式 | 公开 CSV 读取 |

---

## 项目依赖

### 后端 (server/package.json)
- express, cors, morgan — Web 框架
- better-sqlite3 — 数据库
- sharp — 图片处理
- multer — 文件上传
- node-fetch — HTTP 请求
- uuid — 唯一 ID

### 前端 (client/package.json)
- react, react-dom — UI 框架
- vite — 构建工具
- typescript — 类型系统

---

## 数据存储

- **数据库**: `server/data/temco.db`（SQLite）
- **上传图片**: `server/data/uploads/`
- **处理图片**: `server/data/processed/`
- **导出文件**: `server/data/exports/`

> 数据库在项目启动时自动创建，无需手动初始化。

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `start.bat` | 一键启动（双击运行） |
| `stop.bat` | 停止所有服务 |
| `open.bat` | 打开浏览器（服务已启动时） |
| `DEVELOPMENT.md` | 开发文档 |
| `TEMCO_Product_Studio_开发文档.md` | 原始需求文档 |
