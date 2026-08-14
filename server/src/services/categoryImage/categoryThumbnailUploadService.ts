import path from 'path';
import os from 'os';
import fs from 'fs';
import sharp from 'sharp';
const ftp = require('basic-ftp');

export interface CategoryImageTypeSize {
  name: string;
  width: number;
  height: number;
}

export interface UploadCategoryThumbnailParams {
  categoryId: number;
  sourcePath: string;
  ftp: {
    host: string;
    port: number;
    username: string;
    password: string;
    remoteCategoryImageDir: string;
  };
  imageTypes: CategoryImageTypeSize[];
}

export interface UploadedThumbnailFile {
  localPath: string;
  remotePath: string;
  fileName: string;
}

export async function uploadCategoryThumbnail(
  params: UploadCategoryThumbnailParams,
): Promise<{ success: true; categoryId: number; uploadedFiles: UploadedThumbnailFile[] }> {
  if (!Number.isInteger(params.categoryId) || params.categoryId <= 0) {
    throw new Error(`无效的分类 ID：${params.categoryId}`);
  }

  const sourcePath = path.resolve(params.sourcePath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`缩略图源文件不存在：${sourcePath}`);
  }

  if (!params.imageTypes.length) {
    throw new Error('没有可用的分类图片尺寸配置');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `temco-thumb-${params.categoryId}-`));
  const generatedFiles: UploadedThumbnailFile[] = [];
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    // 1. 生成缩略图源文件：{id}_thumb.jpg
    const originalFileName = `${params.categoryId}_thumb.jpg`;
    const originalLocalPath = path.join(tempDir, originalFileName);

    await sharp(sourcePath)
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 92, mozjpeg: true })
      .toFile(originalLocalPath);

    generatedFiles.push({ localPath: originalLocalPath, remotePath: originalFileName, fileName: originalFileName });

    // 2. 生成各尺寸派生图：{id}-thumb-{type}.jpg
    for (const imageType of params.imageTypes) {
      if (!imageType.name || imageType.width <= 0 || imageType.height <= 0) continue;

      const outputFileName = `${params.categoryId}-thumb-${imageType.name}.jpg`;
      const outputLocalPath = path.join(tempDir, outputFileName);

      await sharp(sourcePath)
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize({ width: imageType.width, height: imageType.height, fit: 'cover', position: 'centre', withoutEnlargement: false })
        .jpeg({ quality: 90, mozjpeg: true })
        .toFile(outputLocalPath);

      generatedFiles.push({ localPath: outputLocalPath, remotePath: outputFileName, fileName: outputFileName });
    }

    // 3. FTP 连接
    await client.access({
      host: params.ftp.host,
      port: params.ftp.port || 21,
      user: params.ftp.username,
      password: params.ftp.password,
    });

    // 4. 切换到目标目录
    const remoteDir = params.ftp.remoteCategoryImageDir.replace(/\\/g, '/').replace(/\/+$/, '');
    await client.cd(remoteDir);

    // 5. 上传所有文件（覆盖已存在）
    for (const file of generatedFiles) {
      await client.uploadFrom(file.localPath, file.remotePath);
    }

    return { success: true, categoryId: params.categoryId, uploadedFiles: generatedFiles };
  } finally {
    client.close();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

// 缓存 image types
let cachedImageTypes: CategoryImageTypeSize[] | null = null;
let cacheTime = 0;

export async function getCategoryImageTypes(baseUrl: string, apiKey: string): Promise<CategoryImageTypeSize[]> {
  if (cachedImageTypes && Date.now() - cacheTime < 3600000) {
    return cachedImageTypes;
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/api/image_types?display=full&ws_key=${apiKey}`;
  try {
    const XMLParser = require('fast-xml-parser').XMLParser;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const parsed = parser.parse(xml);
    const items = parsed?.prestashop?.image_types?.image_type || [];
    const arr = Array.isArray(items) ? items : [items];

    const types: CategoryImageTypeSize[] = arr
      .filter((item: any) => String(item.categories || '') === '1')
      .map((item: any) => ({ name: String(item.name || ''), width: parseInt(item.width, 10) || 0, height: parseInt(item.height, 10) || 0 }))
      .filter((t: CategoryImageTypeSize) => t.name && t.width > 0 && t.height > 0);

    cachedImageTypes = types;
    cacheTime = Date.now();
    return types;
  } catch (err: any) {
    console.log('[FTP] 读取 image_types 失败，使用默认尺寸:', err.message);
    return [
      { name: 'category_default', width: 1003, height: 200 },
      { name: 'medium_default', width: 452, height: 452 },
      { name: 'small_default', width: 98, height: 98 },
    ];
  }
}
