// 手机端图片上传 multer 中间件（文档 9 / 31.2 文件安全）
import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../database/database';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function getSetting(key: string): string {
  return (getDatabase().prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any)?.value || '';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (parseInt(getSetting('mobile_capture_max_file_mb') || '15', 10) || 15) * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has((file.mimetype || '').toLowerCase())) {
      cb(new Error('只允许 JPG/PNG/WebP/HEIC 图片'));
      return;
    }
    cb(null, true);
  },
});

/** multer.single('image') 封装，附带扩展名后缀校验 */
export function mobileUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('image')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: `图片超过大小限制（${getSetting('mobile_capture_max_file_mb') || '15'}MB）` });
      }
      return res.status(400).json({ success: false, error: err.message || '上传失败' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未收到图片文件（字段名应为 image）' });
    }
    next();
  });
}

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!(file.mimetype || '').toLowerCase().startsWith('audio/')) {
      cb(new Error('只允许音频文件'));
      return;
    }
    cb(null, true);
  },
});

/** multer.single('audio')：语音备注上传（12.2） */
export function mobileAudioUpload(req: Request, res: Response, next: NextFunction): void {
  audioUpload.single('audio')(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || '音频上传失败' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未收到音频文件（字段名应为 audio）' });
    }
    next();
  });
}

