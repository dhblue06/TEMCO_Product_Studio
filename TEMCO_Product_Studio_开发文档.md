# TEMCO Product Studio 开发文档

## 1. 项目定位

开发一个本地运行的 TEMCO 商品素材与内容管理平台，用于批量管理 PrestaShop 商品的图片、视频、双语文案、SEO 字段、图片 ALT、审核状态和导出数据。

当前 TEMCO 已有 9000 多个商品导入 PrestaShop，但大量商品缺图片和说明。平台目标不是替代 PrestaShop，而是作为 PrestaShop 前置的本地 PIM + DAM + AI 内容生成工具。

核心链路：

```text
Google Sheet 商品库
-> Google Drive 图片/视频素材
-> 本地匹配与管理
-> AI 生成中西双语内容
-> 图片处理与 ALT
-> 人工审核
-> 导出 PrestaShop CSV
-> 后期 PrestaShop API 上传
```

## 2. 参考开源项目的借鉴点

不要直接使用 Akeneo、Pimcore 这类完整企业系统，它们太重。应借鉴它们的设计思想，开发 TEMCO 专用轻量工具。

| 项目 | 借鉴点 | 在本项目中的实现 |
|---|---|---|
| Akeneo PIM | 商品属性、多语言、渠道导出、完整度检查 | 商品字段结构、中文/西语双语内容、PrestaShop 导出检查 |
| Pimcore | PIM + DAM，商品与素材统一关联 | 商品对象关联 Drive 图片、视频、处理后图片 |
| AtroPIM / AtroCore | 导入导出、集成、状态流 | Sheet 导入、Drive 同步、PrestaShop CSV/API 预留 |
| NocoDB | 表格化管理体验 | 商品列表、筛选、批量操作、人工审核 |
| Baserow | 低代码表格和工作流体验 | 状态列、审核视图、批量生成任务 |

## 3. 推荐技术栈

```text
前端：React + Vite
后端：Node.js + Express
数据库：SQLite
图片处理：sharp
表格导出：CSV / Excel
Google：Google Sheet CSV + Google Drive API
文案 AI：DeepSeek API 优先，OpenAI-compatible Provider 预留
图片 AI：默认关闭，真实图优先；可预留 OpenAI Images / 即梦 / 通义万相等
PrestaShop：第一版 CSV，后期 Webservice API
```

## 4. 当前素材结构

Google Drive：

```text
TEMCO/
  Images/
    BPT1753-N/
      BPT1753-N_1.jpg
      BPT1753-N_2.jpg
      BPT1753-N_3.jpg
      BPT1753-N_4.jpg
      BPT1753-N_5.jpg
      BPT1753-N_6.jpg
      BPT1753-N_7.jpg
  Videos/
    BPT1751-N.mp4
    LS23-M.mp4
    LY01.mp4
    PMH120-A.mp4
```

Google Sheet：

```text
https://docs.google.com/spreadsheets/d/10C954V-_NJU7dCO9M7Ts1pLudCk8F8BrhCXcsRqT12M/edit?gid=0#gid=0
```

## 5. 核心模块

### 5.1 商品管理模块

功能：

```text
同步 Google Sheet 商品数据
显示商品列表
搜索 reference / SKU / 名称 / 分类 / 型号
查看商品详情
编辑商品内容
保存本地修改
批量修改状态
批量生成文案
批量导出
```

表格体验参考 NocoDB/Baserow：

```text
左侧筛选
中间商品表格
右侧详情面板
支持状态列、分类列、素材状态列、SEO 状态列
```

商品状态：

```text
待处理
缺图片文件夹
已匹配图片
已匹配视频
双语文案待生成
双语文案已生成
西语文案待审核
图片ALT待生成
SEO待检查
SEO通过
可导出PrestaShop
已导出
上传失败
已上传
```

### 5.2 Google Sheet 同步模块

第一版支持公开 CSV 读取：

```text
https://docs.google.com/spreadsheets/d/{spreadsheetId}/export?format=csv&gid={gid}
```

推荐 Sheet 字段：

```text
reference
prestashop_id
name_es
category
brand
model
image_folder
main_image
video_file
description_short_es
description_es
seo_title_es
seo_description_es
status
upload_status
notes
```

同步逻辑：

```text
解析 Sheet URL
读取 CSV
映射字段
用 reference 建立商品索引
写入 SQLite
保留原始 row 数据，方便排错
```

### 5.3 Google Drive 图片同步模块

图片路径规则：

```text
TEMCO/Images/商品编号/商品编号_序号.jpg
```

示例：

```text
Images/BPT1753-N/BPT1753-N_1.jpg
Images/BPT1753-N/BPT1753-N_2.jpg
```

规则：

```text
Images 下一级文件夹名 = 商品 reference
_1 = 主图
_2、_3、_4 = 附图
```

排序函数：

```js
function getImageIndex(filename) {
  const match = filename.match(/_(\d+)\.(jpg|jpeg|png|webp)$/i);
  return match ? Number(match[1]) : 9999;
}
```

异常状态：

| 情况 | 状态 |
|---|---|
| 商品有编号但 Drive 无文件夹 | 缺图片文件夹 |
| Drive 有文件夹但商品表无商品 | 云盘孤立素材 |
| 有图片但没有 `_1` | 缺标准主图 |
| 文件名不符合 `商品编号_数字.jpg` | 命名不规范 |
| 两个 `_1` | 重复主图 |
| 非 jpg/png/webp | 格式需转换 |

### 5.4 Google Drive 视频同步模块

视频路径规则：

```text
TEMCO/Videos/商品编号.mp4
```

匹配规则：

```text
文件名去掉 .mp4 后 = reference
```

用途：

```text
本地预览
生成视频脚本
生成 WhatsApp 推广文案
后期可给商品页或社媒使用
```

## 6. 本地数据结构

```json
{
  "reference": "BPT1753-N",
  "prestashopId": "12345",
  "name": "商品原始名称",
  "category": "手机配件",
  "brand": "TEMCO",
  "model": "",
  "imageFolder": {
    "driveId": "folder_file_id",
    "name": "BPT1753-N",
    "webViewLink": "https://drive.google.com/..."
  },
  "images": [
    {
      "driveId": "image_file_id_1",
      "originalName": "BPT1753-N_1.jpg",
      "exportName": "bpt1753-n-accesorio-movil-temco-1.jpg",
      "index": 1,
      "role": "main",
      "mimeType": "image/jpeg",
      "webViewLink": "https://drive.google.com/...",
      "thumbnailLink": "https://drive.google.com/...",
      "alt": "BPT1753-N accesorio móvil TEMCO",
      "status": "ok"
    }
  ],
  "videoFile": {
    "driveId": "video_file_id",
    "name": "BPT1753-N.mp4",
    "webViewLink": "https://drive.google.com/..."
  },
  "content": {
    "es": {
      "name": "",
      "descriptionShort": "",
      "description": "",
      "seoTitle": "",
      "seoDescription": "",
      "friendlyUrl": "",
      "imageAlt": "",
      "galleryImageAlts": [],
      "whatsappCopy": "",
      "videoScript": ""
    },
    "zh": {
      "name": "",
      "descriptionShort": "",
      "description": "",
      "seoTitle": "",
      "seoDescription": "",
      "imageAlt": "",
      "galleryImageAlts": [],
      "whatsappCopy": "",
      "videoScript": ""
    }
  },
  "status": "待处理",
  "uploadStatus": "未上传",
  "updatedAt": "2026-06-26T00:00:00.000Z"
}
```

## 7. 双语文案规则

必须生成中文和西班牙语两套内容。

```text
西班牙语：正式上传 PrestaShop 使用
中文：本地审核、理解、对照，不上传网站
```

AI 输出：

```json
{
  "es": {
    "name": "",
    "descriptionShort": "",
    "description": "",
    "seoTitle": "",
    "seoDescription": "",
    "friendlyUrl": "",
    "imageAlt": "",
    "galleryImageAlts": [],
    "whatsappCopy": "",
    "videoScript": ""
  },
  "zh": {
    "name": "",
    "descriptionShort": "",
    "description": "",
    "seoTitle": "",
    "seoDescription": "",
    "imageAlt": "",
    "galleryImageAlts": [],
    "whatsappCopy": "",
    "videoScript": ""
  }
}
```

PrestaShop 导出只使用 `content.es.*`。中文只进入本地审核 CSV。

## 8. PrestaShop 字段适配

| 本地字段 | PrestaShop 字段 |
|---|---|
| `prestashopId` | `id_product` |
| `reference` | `reference` |
| `content.es.name` | `name` |
| `content.es.descriptionShort` | `description_short` |
| `content.es.description` | `description` |
| `content.es.seoTitle` | `meta_title` |
| `content.es.seoDescription` | `meta_description` |
| `content.es.friendlyUrl` | `link_rewrite` |
| `images[].alt` | image legend / alt |

第一版只导出 CSV，不直接写线上。

## 9. SEO 规则

短描述 `description_short`：

```text
西班牙语
1-2 句话
建议 300 字符以内
不写价格、库存、虚假认证
```

长描述 `description` 必须是安全 HTML：

```html
<p><strong>BPT1753-N</strong> es un accesorio móvil pensado para tiendas, distribuidores y venta profesional.</p>
<ul>
  <li>Referencia: BPT1753-N</li>
  <li>Categoría: accesorios móviles</li>
  <li>Uso recomendado: venta en tienda y reposición profesional</li>
  <li>Consulta disponibilidad, colores y cantidades con el equipo TEMCO.</li>
</ul>
```

禁止：

```text
script
iframe
价格
库存数量
虚假认证
虚构兼容型号
夸张承诺
```

SEO 标题 `meta_title`：

```text
西语
建议 50-60 字符
包含 reference 或核心品类
可包含 TEMCO
不堆关键词
```

SEO 描述 `meta_description`：

```text
西语
建议 120-155 字符
说明商品用途和 TEMCO 咨询场景
不写价格和库存
```

友好 URL `link_rewrite`：

```js
function createFriendlyUrl(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
```

## 10. 图片 ALT 与 SEO 文件名

每张图片必须生成 ALT / legend。

主图：

```text
BPT1753-N accesorio móvil TEMCO
```

附图：

```text
BPT1753-N detalle del producto TEMCO
BPT1753-N vista adicional del accesorio TEMCO
BPT1753-N presentación del producto TEMCO
```

规则：

```text
包含商品编号
包含品类或商品名
不超过约 100 字符
每张图不要完全一样
不堆关键词
不写图片中看不到的属性
```

原始图片名：

```text
BPT1753-N_1.jpg
```

导出图片名：

```text
bpt1753-n-accesorio-movil-temco-1.jpg
```

数据库同时保留：

```json
{
  "originalName": "BPT1753-N_1.jpg",
  "exportName": "bpt1753-n-accesorio-movil-temco-1.jpg"
}
```

## 11. 图片处理与 AI 图片生成

真实图片优先。对已有 Google Drive 图片：

```text
下载到本地缓存
裁切
白底
居中
压缩
统一 1000x1000 或 1200x1200
生成 SEO 文件名
生成 ALT
```

AI 图片只用于完全无图商品：

```text
默认关闭
必须人工启用
生成后状态 = AI示意图待确认
不能默认作为真实商品主图上传
不能有文字、价格、促销标签、水印、虚假包装信息
```

## 12. API 设置后台

必须有后台 API 设置中心，不能把 Key 写死。

入口：

```text
设置 -> API 设置
```

文案 API：

```json
{
  "copyProvider": "deepseek",
  "copyApiBaseUrl": "https://api.deepseek.com",
  "copyApiKey": "",
  "copyModel": "deepseek-chat",
  "copyTemperature": 0.3,
  "copyMaxTokens": 4000
}
```

Provider：

```text
DeepSeek
OpenAI
自定义 OpenAI-compatible API
本地模板生成
```

没有 Key 时自动切换模板生成。

图片 API：

```json
{
  "imageProvider": "disabled",
  "imageApiBaseUrl": "",
  "imageApiKey": "",
  "imageModel": "",
  "imageSize": "1024x1024",
  "imageStyle": "ecommerce_white_background"
}
```

Google 设置：

```json
{
  "googleSheetUrl": "https://docs.google.com/spreadsheets/d/10C954V-_NJU7dCO9M7Ts1pLudCk8F8BrhCXcsRqT12M/edit?gid=0#gid=0",
  "googleSheetMode": "public_csv",
  "googleDriveMode": "api",
  "googleApiKey": "",
  "googleAccessToken": "",
  "googleImagesFolderId": "",
  "googleVideosFolderId": ""
}
```

PrestaShop 设置：

```json
{
  "prestashopEnabled": false,
  "prestashopBaseUrl": "https://www.temco.es",
  "prestashopApiKey": "",
  "prestashopLanguageId": "",
  "prestashopUploadMode": "csv_only"
}
```

默认：

```text
图片生成关闭
PrestaShop 只导出 CSV
必须人工审核后才能导出
```

API Key 需要脱敏显示：

```text
sk-****abcd
```

敏感字段不要返回前端明文。

## 13. AI Provider 抽象

不要把 DeepSeek 写死在业务逻辑中。

接口：

```ts
interface CopyGenerator {
  generateProductContent(input: ProductContentInput): Promise<ProductContentResult>
}

interface ImageGenerator {
  generateProductImage(input: ProductImageInput): Promise<ProductImageResult>
}
```

实现：

```text
DeepSeekCopyGenerator
OpenAICopyGenerator
TemplateCopyGenerator
OpenAIImageGenerator
CustomImageGenerator
DisabledImageGenerator
```

## 14. API 测试与日志

设置页提供测试按钮：

```text
测试 DeepSeek 文案 API
测试 Google Sheet 连接
测试 Google Drive 连接
测试图片生成 API
测试 PrestaShop API
```

日志结构：

```json
{
  "provider": "deepseek",
  "type": "copy_generation",
  "model": "deepseek-chat",
  "reference": "BPT1753-N",
  "status": "success",
  "tokensInput": 0,
  "tokensOutput": 0,
  "costEstimate": 0,
  "durationMs": 1234,
  "error": "",
  "createdAt": "2026-06-26T00:00:00.000Z"
}
```

批量限制：

```json
{
  "batchCopyLimit": 50,
  "batchImageLimit": 10,
  "requireReviewBeforeExport": true
}
```

## 15. CSV 导出

PrestaShop CSV：

```text
ID
Reference
Name
Description short
Description
Meta title
Meta description
Friendly URL
Image URLs
Image alt texts
```

规则：

```text
只导出西语正式字段
不导出中文
只导出 可导出PrestaShop 状态商品
图片顺序 = 主图、附图1、附图2
```

内部审核 CSV：

```text
Reference
Spanish Name
Spanish Short Description
Spanish Description
Spanish SEO Title
Spanish SEO Description
Chinese Short Description
Chinese Description
Chinese Notes
Status
```

## 16. 前端界面

打开就是管理台，不做营销首页。

布局：

```text
顶部：同步、生成、导出、设置
左侧：状态筛选、分类筛选、素材状态筛选
中间：商品表格
右侧：商品详情、图片预览、双语文案、SEO 检查
```

商品详情：

```text
图片预览
主图/附图排序
视频链接
西班牙语上传版
中文审核版
SEO 检查结果
状态修改
保存
```

## 17. AI Prompt 基础要求

```text
你正在为 TEMCO 商品生成 PrestaShop 商品页内容。
输出中西双语 JSON。

西班牙语版本用于正式上传 PrestaShop。
中文版本只用于本地审核和理解，不上传网站。

TEMCO 是西班牙手机配件批发/展示业务，客户通常通过 WhatsApp 咨询。

不要虚构价格、库存、认证、兼容型号、材质、功率、防水等级。
如果商品资料不足，使用安全、通用、可人工确认的表达。

输出字段必须包含：
es.name
es.descriptionShort
es.description
es.seoTitle
es.seoDescription
es.friendlyUrl
es.imageAlt
es.galleryImageAlts
es.whatsappCopy
es.videoScript
zh 对应字段
```

## 18. SEO 检查

进入 `可导出PrestaShop` 前必须通过：

| 检查项 | 规则 |
|---|---|
| 商品名 | 不能为空 |
| 短描述 | 不能为空，建议小于 300 字符 |
| 长描述 | 不能为空，安全 HTML |
| SEO 标题 | 不能为空，建议 50-60 字符 |
| SEO 描述 | 不能为空，建议 120-155 字符 |
| Friendly URL | 只允许小写字母、数字、短横线 |
| 主图 | 至少一张 |
| 图片 ALT | 主图必须有 ALT |
| 禁用词 | 不允许价格、库存、虚假认证、夸张承诺 |
| HTML | 禁止 script、iframe |

## 19. 开发阶段

第一阶段：本地基础平台

```text
项目启动
SQLite 数据库
Google Sheet 同步
商品列表
商品详情编辑
本地保存
```

第二阶段：Drive 素材匹配

```text
扫描 Images
扫描 Videos
按 reference 匹配
识别主图/附图
识别异常命名
```

第三阶段：双语文案生成

```text
DeepSeek API 设置
模板兜底
单商品生成
批量 50 个生成
人工修改保存
```

第四阶段：图片处理和 ALT

```text
真实图下载
sharp 处理
SEO 文件名
ALT 生成
主图/附图排序
```

第五阶段：PrestaShop 导出

```text
PrestaShop CSV
内部审核 CSV
SEO 检查
导出状态记录
```

第六阶段：PrestaShop API 预留

```text
根据 reference 或 id_product 找商品
更新 description_short
更新 description
更新 meta_title
更新 meta_description
更新 link_rewrite
上传图片
设置 cover
写入 image legend / alt
保存 image id
失败重试
```

## 20. 最终验收标准

```text
1. 能同步 Google Sheet 商品库
2. 能同步 Google Drive 图片和视频
3. 能按商品编号自动匹配素材
4. 能识别图片命名异常
5. 能生成中西双语文案
6. 西语字段适配 PrestaShop
7. 中文字段只用于本地审核
8. 能生成 SEO 标题、描述、友好 URL
9. 能生成图片 ALT
10. 能处理真实商品图
11. AI 图片默认关闭
12. 能人工审核和修改
13. 能导出 PrestaShop CSV
14. 能导出内部审核 CSV
15. API Key 可在后台配置并脱敏
16. 没有 API Key 时可用模板生成
17. PrestaShop API 默认不自动上传
```

## 21. 一句话开发原则

```text
不要做一个复杂企业 PIM，也不要做普通表格工具。
要做一个 TEMCO 专用的轻量本地 PIM + DAM + AI 内容生成平台：
Google Sheet 管商品，Google Drive 管素材，本地平台管生成、审核、SEO、图片处理和 PrestaShop 导出。
```
