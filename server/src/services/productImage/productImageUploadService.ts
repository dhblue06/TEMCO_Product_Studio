import path from 'path';
import fs from 'fs';
import { getDatabase } from '../../database/database';
import { prepareImageForUpload, loadCategoryImageSettings } from '../categoryImage/categoryImageService';
import { runCurl, isSuccessfulStatus } from '../categoryImage/curlRunner';
import { v4 as uuidv4 } from 'uuid';

function getSetting(key: string): string {
  return (getDatabase().prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any)?.value || '';
}

function getConfig() {
  return {
    baseUrl: getSetting('prestashop_base_url') || 'https://temcostar.com',
    apiKey: getSetting('prestashop_api_key') || '',
  };
}

export function createProductUploadBatch(productIds?: number[]): { batchId: string; jobCount: number } {
  const db = getDatabase();
  const limit = parseInt(getSetting('product_image_batch_limit') || '200');
  const skipKey = getSetting('product_image_skip_uploaded') === 'true';

  let where = "WHERE m.status = 'confirmed'";
  const params: any[] = [];
  if (productIds?.length) {
    where += ` AND m.product_id IN (${productIds.map(() => '?').join(',')})`;
    params.push(...productIds);
  }

  const mappings = db.prepare(`
    SELECT m.product_id, m.scan_image_id, p.prestashop_id, si.sha256
    FROM product_scan_mappings m
    JOIN products p ON m.product_id = p.id
    JOIN product_scan_images si ON m.scan_image_id = si.id
    ${where}
    LIMIT ?
  `).all(...params, limit) as any[];

  const batchId = `PRODIMG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().slice(0, 8).toUpperCase()}`;

  const insertJob = db.prepare(`
    INSERT INTO product_image_upload_jobs (batch_id, product_id, prestashop_product_id, scan_image_id, local_source_path, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'queued', datetime('now'))
  `);

  const batch = db.transaction(() => {
    for (const m of mappings) {
      if (!m.prestashop_id) continue;
      // 跳过已上传的(SHA-256匹配)
      if (skipKey) {
        const existing = db.prepare(`
          SELECT 1 FROM product_image_upload_jobs
          WHERE product_id = ? AND scan_image_id = ? AND status = 'success'
        `).get(m.product_id, m.scan_image_id);
        if (existing) continue;
      }
      const img = db.prepare('SELECT local_path FROM product_scan_images WHERE id = ?').get(m.scan_image_id) as any;
      insertJob.run(batchId, m.product_id, parseInt(m.prestashop_id) || 0, m.scan_image_id, img?.local_path || '');
    }
  });
  batch();

  const count = (db.prepare('SELECT COUNT(*) as c FROM product_image_upload_jobs WHERE batch_id = ?').get(batchId) as any)?.c || 0;
  return { batchId, jobCount: count };
}

export async function startProductUploadBatch(batchId: string): Promise<{ started: boolean; message: string }> {
  const db = getDatabase();
  const jobs = db.prepare('SELECT * FROM product_image_upload_jobs WHERE batch_id = ? AND status = ?').all(batchId, 'queued') as any[];
  if (jobs.length === 0) return { started: false, message: '没有待上传的任务' };

  const config = getConfig();
  const concurrency = parseInt(getSetting('product_image_concurrency') || '2');
  const retryLimit = parseInt(getSetting('product_image_retry_limit') || '2');

  let index = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push((async () => {
      while (index < jobs.length) {
        await uploadSingleProductImage(jobs[index++], config, retryLimit);
      }
    })());
  }
  Promise.all(workers).then(() => console.log(`[ProductUpload] Batch ${batchId} completed`))
    .catch(e => console.error(`[ProductUpload] Batch ${batchId} error:`, e));

  return { started: true, message: `已开始上传 ${jobs.length} 张图片` };
}

async function uploadSingleProductImage(job: any, config: any, retryLimit: number): Promise<void> {
  const db = getDatabase();
  db.prepare(`UPDATE product_image_upload_jobs SET status = 'processing', attempt_count = attempt_count + 1, started_at = datetime('now') WHERE id = ?`).run(job.id);

  try {
    const imgPath = job.local_source_path;
    if (!fs.existsSync(imgPath)) throw new Error('图片文件不存在');

    const jpegBuffer = await prepareImageForUpload(imgPath);
    const tmpPath = path.join(require('os').tmpdir(), `prodimg_${job.prestashop_product_id}_${Date.now()}.jpg`);
    fs.writeFileSync(tmpPath, jpegBuffer);

    try {
      const baseUrl = config.baseUrl.replace(/\/+$/, '');
      const url = `${baseUrl}/api/images/products/${job.prestashop_product_id}?ws_key=${config.apiKey}`;
      const timeout = parseInt(getSetting('product_image_timeout_seconds') || '60');

      const result = await runCurl([
        '-sS', '-X', 'POST', '--connect-timeout', '15', '--max-time', String(timeout),
        '-u', `${config.apiKey}:`, '-H', 'Expect:',
        '-F', `image=@${tmpPath};type=image/jpeg`, '-w', '\n%{http_code}', url,
      ]);

      if (isSuccessfulStatus(result.statusCode)) {
        // 解析返回的 image ID
        const XMLParser = require('fast-xml-parser').XMLParser;
        const parser = new XMLParser({ ignoreAttributes: false });
        const parsed = parser.parse(result.body);
        const imageId = parsed?.prestashop?.image?.id;
        db.prepare(`UPDATE product_image_upload_jobs SET status = 'success', operation = 'created', request_method = 'POST', http_status = ?, remote_image_id = ?, completed_at = datetime('now') WHERE id = ?`)
          .run(result.statusCode, imageId ? parseInt(imageId) : null, job.id);
      } else {
        throw new Error(`HTTP ${result.statusCode}: ${result.body.substring(0, 200)}`);
      }
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    const attempts = (db.prepare('SELECT attempt_count FROM product_image_upload_jobs WHERE id = ?').get(job.id) as any)?.attempt_count || 1;
    if (attempts <= retryLimit) {
      db.prepare(`UPDATE product_image_upload_jobs SET status = 'queued', error_message = ? WHERE id = ?`).run(msg, job.id);
    } else {
      db.prepare(`UPDATE product_image_upload_jobs SET status = 'failed', operation = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?`).run(msg, job.id);
    }
  }
}

export function retryProductFailedJobs(batchId: string): { retried: number } {
  const db = getDatabase();
  const r = db.prepare(`UPDATE product_image_upload_jobs SET status = 'queued', attempt_count = 0, error_message = NULL WHERE batch_id = ? AND status = 'failed'`).run(batchId);
  if (r.changes > 0) startProductUploadBatch(batchId);
  return { retried: r.changes };
}

export function getProductBatchStatus(batchId: string) {
  const db = getDatabase();
  const jobs = db.prepare(`SELECT j.*, p.reference FROM product_image_upload_jobs j JOIN products p ON j.product_id = p.id WHERE j.batch_id = ? ORDER BY j.id`).all(batchId) as any[];
  const stats = { queued: 0, processing: 0, success: 0, failed: 0 };
  for (const j of jobs) if (stats.hasOwnProperty(j.status)) (stats as any)[j.status]++;
  return { batchId, total: jobs.length, ...stats, jobs };
}
