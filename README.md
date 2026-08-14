# TEMCO Product Studio

本地运行的 TEMCO 商品管理平台，用于批量管理 PrestaShop 商品——从数据导入、图片处理、AI 双语文案生成、分类/产品图片批量上传，到一键同步网店、手机现场采集（v1.4）与仓库快速盘点（v1.5）。

> 版本：v1.6+（2026-08） · 对接网站：PrestaShop（www.temco.es）

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
cd server && npm run dev           # 后端 http://localhost:3001
cd client && npm run dev           # 前端 http://localhost:5173

# 方式三：Windows 双击
start.bat
```

### 访问地址
| 用途 | 地址 |
|------|------|
| 前端界面（主工作台） | http://localhost:5173 |
| 后端 API | http://localhost:3001 |
| 手机采集端 | http://{电脑局域网IP}:5173/mobile-capture |
| 采集审核端 | http://localhost:5173/mobile-capture-review |
| 手机快速盘点 | http://{电脑局域网IP}:5173/mobile-inventory |
| 仓库盘点仪表盘 | http://localhost:5173/inventory |
| 图片文件夹浏览 | http://localhost:3001/api/upload/files/browse |
| 产品文件夹 | 详情页点 📂 → Windows 资源管理器 |

> 手机端访问前，请先在顶栏「📱 手机采集」查看本机局域网 IP 与二维码；手机与电脑需在同一 Wi-Fi。

### 停止服务
- `Ctrl+C` 终止终端，或双击 `stop.bat`

---

## 核心业务流程

```
1. 导入数据 ─→ 2. 上传图片 ─→ 3. 生成文案 ─→ 4. 同步到 PrestaShop
   Google Sheet      5 槽位        AI 文案         商品信息
   CSV 粘贴/文件     AI 生成 ALT   双语自动生成     SEO/分类/品牌
   网站 CSV 导入     分类/产品图片   人工修改        图片/价格/库存/变体
```

```
手机采集（v1.4）：手机扫码/搜索 → 拍照/颜色/库存/点货型号 → 电脑审核 → 精修图+变体同步网站
仓库盘点（v1.5）：手机选产品 → 型号×颜色×数量计数 → 汇总 → 与网站库存差异对比
```

---

## 功能详解

### 📦 商品管理
| 功能 | 说明 |
|------|------|
| 列表搜索 | reference / 名称 / 分类 / 型号 / 品牌搜索 |
| 多维度筛选 | 分类、品牌、动态状态（15 种）、网站状态、更新日期 |
| 排序 / 分页 | 表头排序；每页 50 条 |
| 动态状态 | 实时计算（待处理 → 已上传图片 → 已匹配图片 → 双语文案已生成 → SEO通过 → 已上传 → 已下架） |
| 批量操作 | 全选/反选、批量删除、批量同步价格、批量改状态 |
| 商品详情 | 中西双语内容、SEO、价格、分类、品牌、型号、视频链接、卖点/介绍 |
| 新增商品 | 顶栏/搜索无匹配时手动新增（reference 自动生成或指定） |

### 📥 数据导入
| 方式 | 说明 |
|------|------|
| Google Sheet 同步 | 输入公开 CSV 链接，自动拉取并匹配字段 |
| CSV 粘贴 | 在弹窗中直接粘贴，支持分号/逗号分隔 |
| 本地 CSV 文件 | 通过 PrestaShop 导出 CSV，直接导入 |
| 智能字段映射 | 自动识别中西文列名（reference / name_es / 商品名称 等）|
| 价格导入 | 从 CSV 按 reference 匹配，更新 price + wholesale_price |
| 网站商品导入 | 上传 PrestaShop 后台导出的 CSV，预览→提交，自动与本地商品匹配（matched/conflict/unmatched） |
| 产品清单核对 | 上传 xlsx/csv，逐行比对本地库 + 网站，标记已在网站/未在网站/本地缺失/冲突，筛出未上架商品 |

### 📝 AI 文案生成
| 特性 | 说明 |
|------|------|
| 双语输出 | 西班牙语（上传网站）+ 中文（内部对照） |
| 支持 API | DeepSeek / OpenAI / 模板（无 Key 时自动兜底） |
| 生成字段 | 标题(≤65)、短描述(120-170)、长描述(160-240词/4段)、SEO标题(≤60)、SEO描述(≤155)、友好URL、ALT(35-75) |
| 禁止规则 | 不写航空/价格/认证/保修/快充/防水/材质等未确认内容 |
| 批量生成 | 一次性最多 50 个商品（可设置） |

### 🖼 图片处理
| 功能 | 说明 |
|------|------|
| 5 槽位系统 | 产品主图、包装图、场景图 1/2/3 |
| 上传/替换/删除 | 上传到 `data/uploads/{reference}/`，重传自动替换，删除连本地文件 |
| AI 生成 | KIE API 生成白底图、场景图（可配提示词模板） |
| 一键 ALT | AI 批量生成所有图片 ALT 文本 |
| 图片工坊 | 手动选图上传到指定商品 |
| 整理工具 | 图片重命名、未匹配图归入 `_unmatched/`、验证文件存在性、迁移旧图 |

### 🗂 分类图片管理（v1.1）
- 分类 CSV 导入 / PrestaShop 分类同步（含完整层级路径）
- 本地分类图片扫描（自动去除 `imgi_数字_` 前缀）
- 三级自动匹配：精确 → 令牌子集 → 人工映射（含冲突检测）
- 封面 + 缩略图双路上传（Dry Run 预检、并发控制、失败重试、日志导出）

### 📷 产品图片批量上传（v1.3）
- 本地产品图片目录递归扫描（提取型号/序列号/序号）
- 多级匹配：序列号(=serial_number/reference) → 型号精确 → reference 精确 → 型号在名称中
- SHA-256 去重、串行上传、失败重试

### 📤 PrestaShop 同步
| 同步类型 | 内容 |
|---------|------|
| 全量同步 | 标题、描述、SEO、分类、品牌、价格、库存（可按需开关） |
| 图片同步 | 槽位图片逐个上传（skipExists / append 模式） |
| 价格同步 | 批量更新所有已同步商品价格 |
| 激活/停用 | 一键切换 `active: 1/0` |
| 变体（组合） | 读取网站现有变体（含真实库存）、创建/更新/删除、权限检测 |
| 自动分类匹配 | 按分类名查找 PrestaShop 分类 ID |

### 📤 导出
| 功能 | 说明 |
|------|------|
| 导出 PrestaShop CSV | 从本地商品库导出（保留原始表头、品牌列更新为 TEMCO/HOPECOM），可直接用于 PrestaShop 批量导入 |

### 📱 手机采集（v1.4）
仓库货架前用手机完成产品采集，回到电脑后审核：
- 手机访问 `http://{电脑局域网IP}:5173/mobile-capture`（顶栏「📱 手机采集」可看二维码和地址）
- PIN 登录（可选）、创建采集会话（CAP-日期-序号）
- 扫码（EAN/Code128/QR）或按序列号/Reference/型号/名称搜索；**实时读取网站数据**（价格/图片数/真实库存/变体/启用状态）
- 拍照（自动旋转压缩至 2400px、SHA-256 去重）并标注照片用途、绑定颜色
- 按颜色录入库存（精确/大约/充足/未盘点）、文字与语音备注
- 手机壳点货：品牌分组（iPhone/Samsung/Xiaomi…）勾选适用型号，每型号可选颜色（仅统计，不同步网站）
- 巡视发现断货可一键标记「🚫 已卖完」
- 电脑端「🧾 采集审核」：统计卡 + 任务列表（15 秒自动刷新）、原图审核、**AI 精修处理图**（只上网站，原图留本地）、颜色/库存审核、批量删除
- 一键同步：处理图 → 网站图片；采集颜色+库存 → **网站变体**（已有则更新库存，没有则新建）
- 图片存储于 `server/data/mobile-captures/`（⚠️ 勿手动删除目录）

### 📦 仓库快速盘点（v1.5）
面向仓库人员，产品款式 → 手机型号 → 颜色 → 数量 → 盘点批次，不依赖固定货位：
- **手机端 `/mobile-inventory`**：新建批次（INV-日期-序号）→ 选产品 → 选品牌 → 连续型号×颜色×数量计数（自动使用上一型号颜色、改数量自动保存、跳过≠无货）→ 汇总矩阵（型号×颜色 + 缺货/少量统计）→ 完成
- **电脑端 `/inventory`**：当前盘点批次卡 + 历史记录 + 库存差异（实盘 vs 网站快照，|差|>3 红色标出）
- 盘点数据**只对比不同步网站**，与 v1.4 商品采集数据完全分离

### 📥 CAJA 新品检查（v1.6）
把 CAJA 程序导出的 `Products.xlsx` 与 PrestaShop 网站比对，**只找出网站还没有的新品**（只读比对，不改网站、不计销量/库存）：
- 顶栏「📥 CAJA 新品检查」→ 上传 `Products.xlsx`（约 9,330 行）→ 点「🚀 开始检查」
- 读取字段：编号 / 条码 / 名称（名称2/进价/售价/编辑日期/状态仅参考）；**库存等字段一律忽略**
- 匹配：有效条码（EAN/UPC）→ CAJA 编号 ↔ 网站 Reference → 标准化名称精确；重复命中 → 🟡 需要确认
- 默认只显示「🆕 新品」，可切换 需要确认 / 全部，支持搜索（编号/条码/名称）、分页（50/页）、点击行展开详情、导出 CSV、查看/删除历史批次
- **批量上传到网站**：勾选新品 → 「⬆️ 上传到网站」→ 直接创建基础商品到 PrestaShop（编号/名称/售价/EAN，库存 0，**默认激活**，不含图片/分类/文案）；结果区分 ✅ 已上传（新建）/ ⚠️ 网站已有（未新建）/ ❌ 失败（悬停看原因，可重试）
- 安全：网站 API 连接失败时整个检查失败，不会把全部商品误报为新品

---

## 状态体系

系统使用**动态状态计算**，根据商品的实际数据实时判断：

```
已下架         ← 用户手动设置（优先级最高）
已上传         ← 有 PS ID + 已同步 + 有西语文案
已上传图片     ← 有图片 + 无西语文案（含已同步无文案）
SEO通过       ← 有 SEO 标题 + SEO 描述
双语文案已生成 ← 有西语文案（name 字段）
已匹配图片     ← 有 main 槽位图片
待处理         ← 默认
```

左侧面板按状态统计计数，点击即可筛选列表。

---

## 配置说明

### PrestaShop API（系统设置 → PrestaShop）
| 字段 | 示例 |
|------|------|
| Base URL | `https://www.temco.es` |
| API Key | PrestaShop 后台 → 高级参数 → Web Service 生成的 Key |
| 语言 ID | 默认 `1`（西班牙语） |
| 默认分类 ID | 新商品上传时的默认 PrestaShop 分类 |

> 需同步变体时，API Key 需勾选 `combinations`、`product_option_values`、`stock_availables` 权限。

### 文案 AI（设置 → 文案）
| 字段 | 说明 |
|------|------|
| Provider | `deepseek` / `openai` / `template` |
| API Key | 留空则使用模板生成（无需 API） |
| Model | `deepseek-chat`、`gpt-4o-mini` 等 |

### 图片 AI（设置 → 图片 / AI 图片弹窗）
| 字段 | 说明 |
|------|------|
| API Key | KIE API Key（https://kie.ai） |
| Model | `nano-banana-2`、`gpt-image-2` |
| Size | `1024x1024` |

### Google（设置 → Google）
| 字段 | 说明 |
|------|------|
| Sheet URL | Google Sheet → 文件 → 发布到网络 → CSV 链接 |
| Drive | Google Drive 素材扫描（图片/视频） |

### 手机采集 / 盘点
| 字段 | 说明 |
|------|------|
| 手机采集 PIN | 顶栏「📱 手机采集」→ 设置/清除（不显示明文） |
| 局域网 IP | 同一弹窗实时显示（后端 `/api/mobile-capture/access-info` 返回） |

---

## 数据存储

| 类型 | 路径 | 说明 |
|------|------|------|
| 数据库 | `server/data/temco.db` | SQLite，自动创建 |
| 上传图片 | `server/data/uploads/{reference}/` | 每个产品独立文件夹 |
| 手机采集照片 | `server/data/mobile-captures/` | 按任务分目录（勿手动删除） |
| 处理图 | `server/data/processed/` | sharp 处理产物 |
| 导出文件 | `server/data/exports/` | CSV 导出 |
| 日志 | `server/data/logs/` | API 调用记录 |

---

## 项目结构

```
TEMCO_Product_Studio/
├── package.json / start.bat / stop.bat   # 根配置 + Windows 启动/停止
├── server/                               # ── 后端（Express + TS + SQLite）──
│   └── src/
│       ├── index.ts                      # 入口 + 18 组路由挂载
│       ├── database/database.ts          # 建表 + 迁移 + 默认设置
│       ├── middleware/                   # 手机鉴权 / 手机上传
│       ├── routes/                       # products/sheet/upload/copy/images/
│       │                                 # aiImages/prestashop/website-import/
│       │                                 # product-list-import/categories/
│       │                                 # product-images/mobile-capture/inventory/…
│       └── services/                     # copyGenerator/ imageGenerator/
│                                         # prestashop/ mobileCapture/
│                                         # categoryImage/ productImage/
│                                         # websiteCatalog/ productListCheck/
└── client/                               # ── 前端（React 18 + Vite 5）──
    ├── vite.config.ts                    # host:true、5173、/api → 3001 代理
    └── src/
        ├── main.tsx                      # 手写路由分支（无 react-router）
        ├── App.tsx                       # 主工作台
        ├── pages/                        # 手机采集/审核/盘点/仪表盘/分类/产品图片
        ├── components/                   # 弹窗 + 主界面 + mobileCapture/ 子组件
        ├── services/api.ts               # 按模块封装的 API
        ├── hooks/ i18n/ types/           # 扫码/相机 hooks、中西 i18n、类型
```

---

## 技术栈

| 层 | 技术 | 用途 |
|----|------|------|
| 前端框架 | React 18 + TypeScript | UI 界面 |
| 构建工具 | Vite 5 | 开发服务器 + HMR（host: true） |
| 后端框架 | Express + TypeScript（tsx 运行） | API 服务 |
| 数据库 | SQLite (better-sqlite3, WAL) | 本地数据存储 |
| 图片处理 | sharp | 白底、裁切、压缩 |
| AI 文案 | DeepSeek / OpenAI API | 文案生成（无 Key 模板兜底） |
| AI 图片 | KIE API | 图生图 |
| 网店同步 | PrestaShop Web Service API | XML over HTTP |
| 手机扫码 | BarcodeDetector + ZXing fallback | 条码识别 |
| 二维码 | qrcode.react | 手机访问入口二维码 |

---

## 常见问题

**Q: 数据库在哪里？**
A: `server/data/temco.db`，首次启动自动创建。

**Q: 如何重置数据？**
A: 删除 `server/data/temco.db` 后重启项目即可（会丢失全部数据，谨慎操作）。

**Q: 图片存在哪里？**
A: `server/data/uploads/{reference}/`，每个产品独立文件夹；手机采集照片在 `server/data/mobile-captures/`。

**Q: AI 文案必须配置 API Key 吗？**
A: 不必须。留空 API Key 会自动使用模板生成。

**Q: 如何修改 PrestaShop 域名？**
A: 系统设置 → PrestaShop → Base URL 修改。

**Q: 同步后网站不更新？**
A: 请先清空 PrestaShop 缓存（后台 → 高级参数 → 性能 → 清空缓存）。

**Q: 手机访问白屏 / 打不开？**
A: 手机与电脑需同一 Wi-Fi；用顶栏「📱 手机采集」显示的真实 IP 访问 `/mobile-capture`；后端需已启动。

**Q: 手机端提示登录过期？**
A: 重新输入 PIN 登录；后端重启后 token 仍有效（数据库持久化）。

**Q: 变体同步报权限错误？**
A: 在 PrestaShop 后台给 Web Service Key 勾选 combinations / product_option_values / stock_availables。

**Q: 手机型号目录不全？**
A: 目录 = 预置 + 网站自动同步（启动时自动，也可手机端强制同步）；大品牌可点「展开全部 N 个」。

**Q: 仓库盘点会不会覆盖网站数据？**
A: 不会。盘点数据只用于统计和对比，不同步网站。
