# TEMCO Product Studio

本地运行的 TEMCO 商品管理平台，用于批量管理 PrestaShop 商品——从数据导入、图片处理、AI 双语文案生成到一键同步网店。

---

## 快速开始

### 首次安装
```bash
cd TEMCO_Product_Studio
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 启动项目
```bash
# 方式一：一键启动
npm run dev

# 方式二：分开启动
cd server && npx tsx src/index.ts      # 后端 http://localhost:3001
cd client && npx vite --host           # 前端 http://localhost:5173

# 方式三：Windows 双击
start.bat
```

### 访问地址
| 用途 | 地址 |
|------|------|
| 前端界面 | http://localhost:5173 |
| 后端 API | http://localhost:3001 |
| 图片浏览器 | http://localhost:3001/api/upload/files/browse |
| 产品文件夹 | 详情页点击 📂 按钮 → Windows 资源管理器 |

### 停止服务
- `Ctrl+C` 终止终端
- 双击 `stop.bat`

---

## 核心业务流程

```
1. 导入数据 ─→ 2. 上传图片 ─→ 3. 生成文案 ─→ 4. 同步到 PrestaShop
    Google Sheet      5 槽位        AI 文案         商品信息
    CSV 粘贴          AI 生成 ALT   双语自动生成     SEO/分类/品牌
    本地文件         本地编辑       人工修改        图片同步
                                                       价格同步
                                                       激活/停用
```

---

## 功能详解

### 📦 商品管理
| 功能 | 说明 |
|------|------|
| **列表搜索** | 支持 reference / 名称 / 分类 / 型号搜索 |
| **多维度筛选** | 分类、品牌、动态状态、更新日期 |
| **排序** | 点击表头排序（Reference / 名称 / 分类 / 更新时间等） |
| **分页** | 每页 50 条，前后翻页 |
| **动态状态** | 实时计算（待处理 → 已上传图片 → 已匹配图片 → 双语文案已生成 → SEO通过 → 已上传 → 已下架） |
| **批量操作** | 全选/反选、批量删除、批量同步价格 |
| **宽度调节** | 列表和编辑面板之间的分割线可拖拽 |
| **商品详情编辑** | 西语+中文双语内容、SEO、价格、分类、品牌、型号、YouTube 视频链接、产品卖点/介绍 |

### 📥 数据导入
| 方式 | 说明 |
|------|------|
| Google Sheet 同步 | 输入公开 CSV 链接，自动拉取并匹配字段 |
| CSV 粘贴 | 在弹窗中直接粘贴 CSV 文本，支持分号/逗号分隔 |
| 本地 CSV 文件 | 通过 PrestaShop 导出 CSV，直接导入 |
| 智能字段映射 | 自动识别中西文列名（reference / name_es / 商品名称 等）|
| 价格导入 | 从 CSV 按 reference 匹配，更新 price + wholesale_price |

### 📝 AI 文案生成
| 特性 | 说明 |
|------|------|
| 双语输出 | 西班牙语（上传网站）+ 中文（内部对照） |
| 支持 API | DeepSeek / OpenAI / 模板（无 Key 时可用） |
| 生成字段 | 标题(≤65)、短描述(120-170)、长描述(160-240词/4段)、SEO标题(≤60)、SEO描述(≤155)、友好URL、ALT(≤75) |
| ALT 独立 | 专用 ALT 提示词（v10），35-75字符，每图唯一 |
| 禁止规则 | 不写航空/价格/认证/保修/快充/防水/材质 等未确认内容 |
| 自检机制 | 输出前逐项检查字符长度、禁止词、数据准确性 |
| 批量生成 | 一次性最多 50 个商品 |

### 🖼 图片处理
| 功能 | 说明 |
|------|------|
| 5 槽位系统 | 产品主图、包装图、场景图 1/2/3 |
| 上传 | 上传到 `data/uploads/{reference}/` 独立文件夹 |
| 替换 | 重新上传自动替换旧图 |
| 删除 | 🗑 删除按钮（含本地文件和数据库记录） |
| AI 生成 | KIE API 生成白底图、场景图 |
| 一键 ALT | AI 批量生成所有图片 ALT 文本 |
| 全部图片管理 | 展开查看所有图片，逐张编辑 ALT 和删除 |

### 📤 PrestaShop 同步
| 同步类型 | 内容 |
|---------|------|
| 全量同步 | 标题、描述、SEO、分类、品牌、价格 |
| 图片同步 | 5 个槽位图片逐个上传 |
| 价格同步 | 批量更新所有已同步商品价格 |
| 激活/停用 | 一键切换 `active: 1/0` |
| 自动分类匹配 | 按中文名查找 PrestaShop 分类 ID |

### 📊 界面特性
| 特性 | 说明 |
|------|------|
| 左侧面板 | 状态统计、分类筛选、品牌筛选 |
| 顶部操作栏 | 按组分隔：数据导入、内容处理、导出、设置 |
| 产品列表 | 自定义列宽、横向滚动、斑马纹、行悬停高亮 |
| 编辑面板 | 可拖拽宽度、双语切换、实时预览 |
| 模态框 | 毛玻璃遮罩、入场动画、键盘关闭 |

---

## 状态体系

系统使用**动态状态计算**，根据商品的实际数据实时判断：

```
已下架         ← 用户手动设置（优先级最高）
已上传         ← 有 PS ID + 已同步 + 有西语文案
已上传图片     ← 有图片 + 无西语文案（含已同步无文案）
SEO通过       ← 有 SEO 标题 + SEO 描述
双语文案已生成 ← 有西语文案（name 字段）
已匹配图片     ← 有 main_product 槽位图片
待处理         ← 默认
```

每个状态在左侧面板有对应的统计计数，点击可筛选列表。

---

## 配置说明

### PrestaShop API
在系统设置中填写：
| 字段 | 示例 |
|------|------|
| Base URL | `https://temcostar.com` |
| API Key | PrestaShop 后台生成 Web Service Key |
| 语言 ID | 默认 `1`（西班牙语）|
| 默认分类 ID | 新商品上传时的默认 PrestaShop 分类 |

### 文案 AI
| 字段 | 说明 |
|------|------|
| Provider | `deepseek` / `openai` / `template` |
| API Key | 留空则使用模板生成（无需 API） |
| Model | `deepseek-chat`、`gpt-4o-mini` 等 |
| Temperature | 0.3（数值越低越稳定） |

### 图片 AI（KIE）
| 字段 | 说明 |
|------|------|
| API Key | 在 https://kie.ai 注册获取 |
| Model | `nano-banana-2`、`gpt-image-2` |
| Size | `1024x1024`|

### Google
| 字段 | 说明 |
|------|------|
| Sheet URL | Google Sheet → 文件 → 发布到网络 → CSV 链接 |

---

## 数据存储

| 类型 | 路径 | 说明 |
|------|------|------|
| 数据库 | `server/data/temco.db` | SQLite，自动创建 |
| 上传图片 | `server/data/uploads/{reference}/` | 每个产品独立文件夹 |
| 文案生成日志 | `server/data/logs/` | API 调用记录 |
| 导出文件 | `client/dist/` | Vite 构建输出 |

---

## 项目结构

```
TEMCO_Product_Studio/
├── package.json              # 根 monorepo 配置
├── start.bat / stop.bat      # Windows 启动/停止
├── .gitignore
│
├── server/                   # ── 后端 ──
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts          # Express 入口 + 路由注册
│       ├── database/
│       │   └── database.ts   # SQLite 初始化 + 8 张表
│       ├── routes/
│       │   ├── products.ts   # 商品 CRUD + 统计 + 动态状态
│       │   ├── sheet.ts      # Google Sheet / CSV 导入
│       │   ├── upload.ts     # 图片上传/删除/白底/场景/文件夹
│       │   ├── copy.ts       # AI 文案/ALT 生成
│       │   ├── prestashop.ts # PrestaShop 同步/激活
│       │   ├── settings.ts   # API 设置
│       │   ├── drive.ts      # Google Drive 扫描
│       │   └── aiImages.ts   # AI 图片生成
│       └── services/
│           ├── copyGenerator/    # 文案生成引擎
│           │   ├── index.ts          # 入口 + 配置加载
│           │   ├── openaiGenerator.ts # OpenAI/DeepSeek 实现
│           │   ├── templateGenerator.ts # 模板备选
│           │   └── types.ts          # 类型 + 接口
│           ├── imageGenerator/  # 图片生成引擎
│           │   ├── types.ts     # 配置 + 提示词
│           │   └── kieGenerator.ts   # KIE API 实现
│           ├── prestashop/      # PrestaShop 同步引擎
│           │   ├── prestashopClient.ts  # XML API 客户端
│           │   ├── prestashopMapper.ts  # XML 构建器
│           │   ├── productSyncService.ts # 商品同步
│           │   └── imageSyncService.ts  # 图片同步
│           ├── imageProcessor.ts # sharp 图片处理
│           └── driveScanner.ts   # Drive 扫描
│
├── client/                   # ── 前端 ──
│   ├── package.json
│   ├── vite.config.ts        # 开发代理 :5173 → :3001
│   ├── index.html
│   └── src/
│       ├── App.tsx           # 主页面布局
│       ├── main.tsx          # React 入口
│       ├── index.css         # 全局样式（CSS 变量体系）
│       ├── types/
│       │   └── index.ts      # TypeScript 类型定义
│       ├── services/
│       │   └── api.ts        # API 封装（全部端点）
│       └── components/
│           ├── TopBar.tsx          # 顶部操作栏
│           ├── LeftPanel.tsx       # 左侧筛选面板
│           ├── ProductTable.tsx    # 商品列表表格
│           ├── ProductDetail.tsx   # 商品详情编辑
│           ├── SheetSyncModal.tsx  # Sheet 同步弹窗
│           ├── SettingsModal.tsx   # 设置弹窗
│           ├── DriveScanModal.tsx  # Drive 扫描弹窗
│           ├── EditPlugin.tsx      # 文案编辑插件
│           └── ...                 # 其他辅助组件
```

---

## 技术栈

| 层 | 技术 | 用途 |
|----|------|------|
| 前端框架 | React 18 + TypeScript | UI 界面 |
| 构建工具 | Vite 6 | 开发服务器 + HMR |
| 后端框架 | Express + TypeScript | API 服务 |
| 运行时 | tsx（Node.js）| TypeScript 直接执行 |
| 数据库 | SQLite (better-sqlite3) | 本地数据存储 |
| 图片处理 | sharp | 白底、裁切、压缩 |
| AI 文案 | DeepSeek / OpenAI API | 文案生成 |
| AI 图片 | KIE API | 图生图 |
| 网店同步 | PrestaShop Web Service API | XML over HTTP |

---

## 常见问题

**Q: 数据库在哪里？**
A: `server/data/temco.db`，首次启动自动创建。

**Q: 如何重置数据？**
A: 删除 `server/data/temco.db` 后重启项目即可。

**Q: 图片存在哪里？**
A: `server/data/uploads/{reference}/`，每个产品独立文件夹。

**Q: AI 文案必须配置 API Key 吗？**
A: 不必须。留空 API Key 会自动使用模板生成。

**Q: 如何修改 PrestaShop 域名？**
A: 系统设置 → PrestaShop → Base URL 修改。

**Q: 同步后网站不更新？**
A: 请先清空 PrestaShop 缓存（后台 → 高级参数 → 性能 → 清空缓存）。
