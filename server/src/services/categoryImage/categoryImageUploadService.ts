import path from 'path';
import fs from 'fs';
import { getDatabase } from '../../database/database';
import {
  CategoryImageUploadJob,
  UploadJobStatus,
  PrestashopUploadResult,
  CATEGORY_IMAGE_ERRORS,
} from './types';
import {
  loadCategoryImageSettings,
  prepareImageForUpload,
  runDryRun,
} from './categoryImageService';
import {
  uploadCategoryThumbnail,
  getCategoryImageTypes,
} from './categoryThumbnailUploadService';
import { v4 as uuidv4 } from 'uuid';

function getSetting(key: string): string {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any;
  return row?.value || '';
}

function getConfig() {
  return {
    baseUrl: getSetting('prestashop_base_url') || 'https://temcostar.com',
    apiKey: getSetting('prestashop_api_key') || '',
    defaultLangId: getSetting('prestashop_default_lang_id') || '1',
    spanishLangId: getSetting('prestashop_spanish_lang_id') || '1',
    chineseLangId: getSetting('prestashop_chinese_lang_id') || '',
    defaultCategoryId: getSetting('prestashop_default_category_id') || '3',
    defaultManufacturerId: getSetting('prestashop_default_manufacturer_id') || '1',
    defaultShopId: getSetting('prestashop_default_shop_id') || '1',
  };
}

// ============================================================
// 创建上传批次
// ============================================================

export function createUploadBatch(categoryIds?: number[]): { batchId: string; jobCount: number } {
  const db = getDatabase();
  const settings = loadCategoryImageSettings();

  if (!settings.categoryImageUploadEnabled) {
    throw new Error('分类图片上传功能未启用，请在设置中开启');
  }

  const batchId = `CATIMG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().slice(0, 8).toUpperCase()}`;

  let whereClause = `WHERE m.status = 'confirmed'`;
  const params: any[] = [];
  if (categoryIds && categoryIds.length > 0) {
    whereClause += ` AND m.category_id IN (${categoryIds.map(() => '?').join(',')})`;
    params.push(...categoryIds);
  }

  const mappings = db.prepare(`
    SELECT m.category_id, m.category_image_id
    FROM category_image_mappings m
    ${whereClause}
    LIMIT ?
  `).all(...params, settings.categoryUploadBatchLimit) as any[];

  const insertJob = db.prepare(`
    INSERT INTO category_image_upload_jobs (batch_id, category_id, category_image_id, image_type, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'queued', datetime('now'), datetime('now'))
  `);

  const batch = db.transaction(() => {
    for (const m of mappings) {
      insertJob.run(batchId, m.category_id, m.category_image_id, 'cover');
      insertJob.run(batchId, m.category_id, m.category_image_id, 'thumb');
    }
  });
  batch();

  return { batchId, jobCount: mappings.length * 2 };
}

// ============================================================
// 执行上传批次
// ============================================================

export async function startUploadBatch(batchId: string): Promise<{ started: boolean; message: string }> {
  const db = getDatabase();
  const settings = loadCategoryImageSettings();

  const jobs = db.prepare(`
    SELECT j.*, c.prestashop_category_id, c.name as category_name,
           ci.local_path as image_path, ci.filename as image_filename
    FROM category_image_upload_jobs j
    JOIN categories c ON j.category_id = c.id
    JOIN category_images ci ON j.category_image_id = ci.id
    WHERE j.batch_id = ? AND j.status = 'queued'
  `).all(batchId) as any[];

  if (jobs.length === 0) {
    return { started: false, message: '没有待上传的任务' };
  }

  const config = getConfig();
  const concurrency = settings.categoryImageConcurrency;
  const retryLimit = settings.categoryImageRetryLimit;

  // 使用简单的并发控制
  let index = 0;
  const workers: Promise<void>[] = [];

  for (let w = 0; w < concurrency; w++) {
    workers.push((async () => {
      while (index < jobs.length) {
        const job = jobs[index++];
        await uploadSingleImage(job, retryLimit, config);
      }
    })());
  }

  // 异步执行
  Promise.all(workers).then(() => {
    console.log(`[CategoryUpload] Batch ${batchId} completed`);
  }).catch(err => {
    console.error(`[CategoryUpload] Batch ${batchId} error:`, err);
  });

  return { started: true, message: `已开始上传 ${jobs.length} 个任务` };
}

async function uploadSingleImage(
  job: any,
  retryLimit: number,
  config: any
): Promise<void> {
  const db = getDatabase();
  const imageType = job.image_type || 'cover';

  db.prepare(`
    UPDATE category_image_upload_jobs
    SET status = 'processing', attempt_count = attempt_count + 1, started_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(job.id);

  try {
    if (!fs.existsSync(job.image_path)) {
      throw new Error(CATEGORY_IMAGE_ERRORS.IMAGE_NOT_FOUND);
    }

    if (imageType === 'thumb') {
      // ===== 缩略图：FTP 直传服务器 =====
      const ftpSettings = {
        host: getSetting('ftp_host'),
        port: parseInt(getSetting('ftp_port') || '21'),
        username: getSetting('ftp_username'),
        password: getSetting('ftp_password'),
        remoteCategoryImageDir: getSetting('ftp_category_image_dir'),
      };

      if (!ftpSettings.host || !ftpSettings.username || !ftpSettings.password || !ftpSettings.remoteCategoryImageDir) {
        const missing: string[] = [];
        if (!ftpSettings.host) missing.push('FTP 主机');
        if (!ftpSettings.username) missing.push('用户名');
        if (!ftpSettings.password) missing.push('密码');
        if (!ftpSettings.remoteCategoryImageDir) missing.push('服务器路径');
        throw new Error('FTP 未完整配置，缺少: ' + missing.join('、') + '。请在 设置→PrestaShop 中填写');
      }

      // 读取 PrestaShop 图片尺寸
      const imageTypes = await getCategoryImageTypes(config.baseUrl, config.apiKey);

      const result = await uploadCategoryThumbnail({
        categoryId: job.prestashop_category_id,
        sourcePath: job.image_path,
        ftp: ftpSettings,
        imageTypes,
      });

      db.prepare(`
        UPDATE category_image_upload_jobs
        SET status = 'success', operation = 'overwritten', request_method = 'FTP',
            http_status = null, response_body = ?,
            finished_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(result.uploadedFiles.map(f => f.fileName)), job.id);
    } else {
      // ===== 封面：PrestaShop Webservice =====
      const jpegBuffer = await prepareImageForUpload(job.image_path);
      const tmpPath = path.join(require('os').tmpdir(), `catimg_${job.prestashop_category_id}_${Date.now()}.jpg`);
      fs.writeFileSync(tmpPath, jpegBuffer);

      try {
        const result = await uploadCategoryImageToPrestaShop(config, job.prestashop_category_id, tmpPath);

        db.prepare(`
          UPDATE category_image_upload_jobs
          SET status = 'success', operation = ?, request_method = ?,
              http_status = ?, response_body = ?,
              finished_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(result.operation, result.requestMethod, result.httpStatus, result.responseBody || '', job.id);
      } finally {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
    }
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    const currentAttempts = (db.prepare('SELECT attempt_count FROM category_image_upload_jobs WHERE id = ?').get(job.id) as any)?.attempt_count || 1;

    if (currentAttempts <= retryLimit) {
      db.prepare(`
        UPDATE category_image_upload_jobs
        SET status = 'queued', error_message = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(errorMsg, job.id);
    } else {
      db.prepare(`
        UPDATE category_image_upload_jobs
        SET status = 'failed', operation = 'failed', error_message = ?, finished_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(errorMsg, job.id);
    }
  }
}

async function uploadCategoryImageToPrestaShop(
  config: any,
  categoryId: number,
  imagePath: string
): Promise<{ success: boolean; operation: string; requestMethod: string; httpStatus: number; responseBody?: string }> {
  const { runCurl, isImageAlreadyExists, isSuccessfulStatus } = require('./curlRunner');
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const apiPath = '/api/images/categories';
  const timeout = parseInt(getSetting('category_image_timeout_seconds') || '60');

  const endpoint = `${baseUrl}${apiPath}/${categoryId}`;
  console.log(`[CategoryUpload] cover -> ${endpoint}`);

  const curlArgs = (method: string, usePsMethod = false) => {
    const url = usePsMethod ? `${endpoint}?ps_method=PUT` : endpoint;
    return [
    '-sS', '-X', method,
    '--connect-timeout', '15',
    '--max-time', String(timeout),
    '-u', `${config.apiKey}:`,
    '-H', 'Expect:',
    '-F', `image=@${imagePath};type=image/jpeg`,
    '-w', '\n%{http_code}',
    url,
  ];
  };

  // 先尝试 POST
  const postResult = await runCurl(curlArgs('POST'));

  if (isSuccessfulStatus(postResult.statusCode)) {
    return {
      success: true,
      operation: 'created',
      requestMethod: 'POST',
      httpStatus: postResult.statusCode,
      responseBody: postResult.body,
    };
  }

  // 如果不是 "already exists"，直接失败
  if (!isImageAlreadyExists(postResult)) {
    throw new Error(
      `分类图片上传失败\n分类ID: ${categoryId}\nHTTP: ${postResult.statusCode}\n响应: ${postResult.body || '(空)'}`
    );
  }

  // 图片已存在 → POST + ps_method=PUT 覆盖
  const putResult = await runCurl(curlArgs('POST', true));

  if (!isSuccessfulStatus(putResult.statusCode)) {
    throw new Error(
      `分类图片覆盖失败\n分类ID: ${categoryId}\nHTTP: ${putResult.statusCode}\n响应: ${putResult.body || '(空)'}`
    );
  }

  return {
    success: true,
    operation: 'overwritten',
    requestMethod: 'PUT',
    httpStatus: putResult.statusCode,
    responseBody: putResult.body,
  };
}

async function uploadToCategoryImage(
  categoryId: number,
  jpegBuffer: Buffer,
  isThumb: boolean
): Promise<PrestashopUploadResult> {
  const config = getConfig();
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const apiPath = getSetting('category_image_api_path') || '/api/images/categories';
  const timeout = parseInt(getSetting('category_image_timeout_seconds') || '60') * 1000;

  const endpoint = isThumb ? `${apiPath}/${categoryId}/thumb` : `${apiPath}/${categoryId}`;
  const url = `${baseUrl}${endpoint}?ws_key=${config.apiKey}`;

  // 写临时文件（和产品图片上传一致的 curl 方式）
  const tmpPath = path.join(require('os').tmpdir(), `catimg_${categoryId}_${Date.now()}.jpg`);
  fs.writeFileSync(tmpPath, jpegBuffer);

  const doCurl = (method: string): Promise<any> => {
    const { exec } = require('child_process');
    return new Promise<any>((resolve) => {
      exec(`curl -s -X ${method} "${url}" -F "image=@${tmpPath}"`, {
        maxBuffer: 50 * 1024 * 1024,
        timeout,
      }, (err: any, stdout: string) => {
        if (!stdout) {
          resolve({ success: false, error: err?.message || '无响应', errorCode: 'UPLOAD_UNKNOWN_ERROR' });
          return;
        }
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({ ignoreAttributes: false });
          const parsed = parser.parse(stdout);
          const unwrapped = parsed?.prestashop || parsed;
          if (unwrapped?.errors?.error) {
            const e = Array.isArray(unwrapped.errors.error) ? unwrapped.errors.error[0] : unwrapped.errors.error;
            const msg = e.message || JSON.stringify(e);
            resolve({ success: false, error: msg, alreadyExists: /already exists/i.test(msg), errorCode: 'UPLOAD_HTTP_ERROR' });
            return;
          }
          resolve({ success: true, httpStatus: 200 });
        } catch (e: any) {
          const snippet = stdout.substring(0, 200).replace(/<[^>]*>/g, ' ').trim();
          resolve({ success: false, error: snippet || e.message, errorCode: 'UPLOAD_HTTP_ERROR' });
        }
      });
    });
  };

  try {
    // 先尝试 POST，如果提示已存在则用 PUT 覆盖
    let result = await doCurl('POST');
    if (!result.success && result.alreadyExists) {
      result = await doCurl('PUT');
    }
    return result;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

// ============================================================
// 取消批次
// ============================================================

export function cancelBatch(batchId: string): { cancelled: number } {
  const db = getDatabase();
  const result = db.prepare(`
    UPDATE category_image_upload_jobs
    SET status = 'cancelled', updated_at = datetime('now')
    WHERE batch_id = ? AND status = 'queued'
  `).run(batchId);
  return { cancelled: result.changes };
}

// ============================================================
// 重试失败项
// ============================================================

export async function retryFailedJobs(batchId: string): Promise<{ retried: number }> {
  const db = getDatabase();
  const result = db.prepare(`
    UPDATE category_image_upload_jobs
    SET status = 'queued', attempt_count = 0, operation = NULL, request_method = NULL,
        error_message = NULL, updated_at = datetime('now')
    WHERE batch_id = ? AND status = 'failed'
  `).run(batchId);

  if (result.changes > 0) {
    await startUploadBatch(batchId);
  }

  return { retried: result.changes };
}

// ============================================================
// 获取批次状态
// ============================================================

export function getBatchStatus(batchId: string): {
  batchId: string;
  total: number;
  queued: number;
  processing: number;
  success: number;
  failed: number;
  cancelled: number;
  coverSuccess: number; coverFailed: number;
  thumbSuccess: number; thumbFailed: number;
  jobs: CategoryImageUploadJob[];
} {
  const db = getDatabase();

  const jobs = db.prepare(`
    SELECT j.*, c.prestashop_category_id, c.name as category_name,
           ci.filename as image_filename
    FROM category_image_upload_jobs j
    JOIN categories c ON j.category_id = c.id
    JOIN category_images ci ON j.category_image_id = ci.id
    WHERE j.batch_id = ?
    ORDER BY j.id ASC
  `).all(batchId) as any[];

  let stats: any = { queued: 0, processing: 0, success: 0, failed: 0, cancelled: 0, coverSuccess: 0, coverFailed: 0, thumbSuccess: 0, thumbFailed: 0 };
  for (const j of jobs) {
    if (stats.hasOwnProperty(j.status)) stats[j.status]++;
    if (j.image_type === 'cover') {
      if (j.status === 'success') stats.coverSuccess++;
      else if (j.status === 'failed') stats.coverFailed++;
    } else {
      if (j.status === 'success') stats.thumbSuccess++;
      else if (j.status === 'failed') stats.thumbFailed++;
    }
  }

  return {
    batchId,
    total: jobs.length,
    ...stats,
    jobs: jobs.map(j => ({
      id: j.id,
      batchId: j.batch_id,
      categoryId: j.category_id,
      categoryImageId: j.category_image_id,
      imageType: j.image_type,
      status: j.status,
      operation: j.operation,
      requestMethod: j.request_method,
      attemptCount: j.attempt_count,
      httpStatus: j.http_status,
      responseBody: j.response_body,
      errorMessage: j.error_message,
      startedAt: j.started_at,
      finishedAt: j.finished_at,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
      categoryName: j.category_name,
      prestashopCategoryId: j.prestashop_category_id,
      imageFilename: j.image_filename,
    })),
  };
}

// ============================================================
// 获取所有批次
// ============================================================

export function getAllBatches(): any[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT batch_id,
           COUNT(*) as total,
           SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
           SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
           SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
           MIN(created_at) as created_at,
           MAX(updated_at) as updated_at
    FROM category_image_upload_jobs
    GROUP BY batch_id
    ORDER BY created_at DESC
  `).all() as any[];
}

// ============================================================
// 导出上传日志 CSV
// ============================================================

export function exportBatchLogsCsv(batchId: string): string {
  const db = getDatabase();
  const jobs = db.prepare(`
    SELECT j.*, c.prestashop_category_id, c.name as category_name, ci.filename as image_filename
    FROM category_image_upload_jobs j
    JOIN categories c ON j.category_id = c.id
    JOIN category_images ci ON j.category_image_id = ci.id
    WHERE j.batch_id = ?
    ORDER BY j.id ASC
  `).all(batchId) as any[];

  const header = '分类ID,PrestaShop分类ID,分类名称,图片文件,状态,尝试次数,HTTP状态,错误信息,开始时间,完成时间\n';
  const rows = jobs.map(j => {
    const escape = (s: string) => `"${String(s || '').replace(/"/g, '""')}"`;
    return [
      j.category_id,
      j.prestashop_category_id,
      escape(j.category_name),
      escape(j.image_filename),
      j.status,
      j.attempt_count,
      j.http_status || '',
      escape(j.error_message || ''),
      j.started_at || '',
      j.finished_at || '',
    ].join(',');
  }).join('\n');

  return header + rows;
}
