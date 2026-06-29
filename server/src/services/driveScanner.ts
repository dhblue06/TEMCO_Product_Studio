import { getDatabase } from '../database/database';

export interface ScannedImage {
  fileName: string;
  filePath: string;
  index: number;
  isMain: boolean;
  extension: string;
  issues: string[];
}

export interface ScannedFolder {
  reference: string;
  folderPath: string;
  images: ScannedImage[];
  issues: string[];
}

export interface ScanResult {
  folders: ScannedFolder[];
  orphanImages: string[];
  totalImages: number;
  totalVideos: number;
}

/**
 * 解析图片序号
 * 从文件名中提取 _1, _2, _3 等序号
 */
export function getImageIndex(fileName: string): number {
  const match = fileName.match(/_(\d+)\.(jpg|jpeg|png|webp)$/i);
  return match ? Number(match[1]) : 9999;
}

/**
 * 检查图片格式是否合法
 */
export function isValidImageFormat(fileName: string): boolean {
  return /\.(jpg|jpeg|png|webp)$/i.test(fileName);
}

/**
 * 获取图片扩展名
 */
export function getImageExtension(fileName: string): string {
  const match = fileName.match(/\.([a-zA-Z]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * 检查文件名是否符合标准命名规范
 * 格式：{reference}_{数字}.{ext}
 */
export function isStandardNaming(fileName: string, reference: string): boolean {
  const escapedRef = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedRef}_(\\d+)\\.(jpg|jpeg|png|webp)$`, 'i');
  return pattern.test(fileName);
}

/**
 * 扫描单个商品文件夹中的图片，分析异常
 */
export function scanProductFolder(
  folderName: string,
  files: string[],
  folderPath: string
): ScannedFolder {
  const reference = folderName;
  const issues: string[] = [];
  const images: ScannedImage[] = [];

  if (!files || files.length === 0) {
    issues.push('空文件夹');
    return { reference, folderPath, images, issues };
  }

  // 筛选图片文件
  const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp|gif|bmp|tiff)$/i.test(f));

  if (imageFiles.length === 0) {
    issues.push('文件夹内无图片文件');
    return { reference, folderPath, images, issues };
  }

  const mainImages: ScannedImage[] = [];
  const nonStandardFiles: string[] = [];

  for (const file of imageFiles) {
    const ext = getImageExtension(file);
    const index = getImageIndex(file);
    const imgIssues: string[] = [];

    // 检查格式
    if (!isValidImageFormat(file)) {
      imgIssues.push(`格式需转换: .${ext}`);
    }

    // 检查命名规范
    if (!isStandardNaming(file, reference)) {
      imgIssues.push('命名不规范');
      nonStandardFiles.push(file);
    }

    const image: ScannedImage = {
      fileName: file,
      filePath: `${folderPath}/${file}`,
      index,
      isMain: index === 1,
      extension: ext,
      issues: imgIssues,
    };

    images.push(image);

    if (index === 1) {
      mainImages.push(image);
    }
  }

  // 按序号排序
  images.sort((a, b) => a.index - b.index);

  // 检查主图问题
  if (images.length > 0) {
    const hasMain = images.some(i => i.isMain);
    if (!hasMain) {
      issues.push('缺标准主图（无 _1 文件）');
    }
  }

  // 检查重复主图
  if (mainImages.length > 1) {
    issues.push(`重复主图：找到 ${mainImages.length} 个 _1 文件`);
  }

  // 检查非标准命名
  if (nonStandardFiles.length > 0) {
    issues.push(`命名不规范文件：${nonStandardFiles.length} 个`);
  }

  return { reference, folderPath, images, issues };
}

/**
 * 将扫描结果保存到数据库
 */
export function saveScanResultsToDb(results: ScanResult): void {
  const db = getDatabase();

  const insertImage = db.prepare(`
    INSERT INTO product_images 
      (product_id, drive_id, original_name, export_name, image_index, role, mime_type, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFolderAsset = db.prepare(`
    INSERT INTO drive_assets (product_id, asset_type, drive_id, name, match_status, issue)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateProductStatus = db.prepare(`
    UPDATE products SET status = ?, updated_at = datetime('now') WHERE reference = ?
  `);

  const getProductId = db.prepare('SELECT id, status FROM products WHERE reference = ?');

  const batch = db.transaction(() => {
    for (const folder of results.folders) {
      const product = getProductId.get(folder.reference) as any;
      const productId = product?.id;

      if (!productId) {
        // 商品不存在，记录孤立素材
        for (const img of folder.images) {
          insertFolderAsset.run(null, 'image', '', img.fileName, 'orphan', '云盘孤立素材');
        }
        continue;
      }

      // 商品存在，记录图片
      let hasMain = false;
      for (const img of folder.images) {
        const role = img.isMain ? 'main' : 'gallery';
        if (img.isMain) hasMain = true;

        insertImage.run(
          productId, '', img.fileName, '',
          img.index, role, `image/${img.extension}`,
          img.issues.length > 0 ? '异常' : 'ok'
        );

        insertFolderAsset.run(
          productId, 'image', '', img.fileName,
          img.issues.length > 0 ? '异常' : 'matched',
          img.issues.join('; ')
        );
      }

      // 更新商品状态
      if (folder.issues.length > 0) {
        const currentStatus = product.status;
        if (currentStatus === '待处理') {
          updateProductStatus.run('缺图片文件夹', folder.reference);
        }
      } else if (hasMain) {
        updateProductStatus.run('已匹配图片', folder.reference);
      }
    }

    // 记录孤立文件夹
    for (const folder of results.folders) {
      if (!getProductId.get(folder.reference)) {
        insertFolderAsset.run(null, 'folder', '', folder.folderPath, 'orphan', '云盘孤立素材');
      }
    }
  });

  batch();
  console.log(`[Drive Scan] Saved ${results.totalImages} images, ${results.folders.length} folders`);
}

/**
 * 扫描本地或虚拟图片目录
 */
export function scanDriveImages(
  imageFolders: Record<string, string[]>
): ScanResult {
  const folders: ScannedFolder[] = [];
  let totalImages = 0;

  for (const [folderName, files] of Object.entries(imageFolders)) {
    const result = scanProductFolder(folderName, files, `Images/${folderName}`);
    folders.push(result);
    totalImages += result.images.length;
  }

  return {
    folders,
    orphanImages: [],
    totalImages,
    totalVideos: 0,
  };
}

/**
 * 扫描视频匹配
 */
export function scanDriveVideos(videoFiles: string[]): Array<{
  reference: string;
  fileName: string;
  matched: boolean;
  issues: string[];
}> {
  const results: Array<{
    reference: string;
    fileName: string;
    matched: boolean;
    issues: string[];
  }> = [];

  for (const file of videoFiles) {
    // 文件名去掉 .mp4 后 = reference
    const match = file.match(/^(.+)\.(mp4|mov|avi|mkv|webm)$/i);
    if (!match) {
      results.push({
        reference: file,
        fileName: file,
        matched: false,
        issues: ['非标准视频格式'],
      });
      continue;
    }

    const reference = match[1];
    const db = getDatabase();
    const product = db.prepare('SELECT id FROM products WHERE reference = ?').get(reference);

    results.push({
      reference,
      fileName: file,
      matched: !!product,
      issues: product ? [] : ['视频已存在但商品表无此 reference'],
    });
  }

  return results;
}
