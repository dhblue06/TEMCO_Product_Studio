// 手机访问认证中间件（文档 6.2 安全限制 / 31.1 权限）
// token 持久化到数据库：服务重启后已登录手机不掉线
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDatabase } from '../database/database';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 会话过期时间 12 小时

// ===== PIN 登录限速：防暴力破解 =====
// 按 "IP|操作员名" 记录失败次数；连错 MAX_FAILS 次后锁定 LOCK_MS
const PIN_MAX_FAILS = 5;            // 连续失败上限
const PIN_LOCK_MS = 10 * 60 * 1000; // 锁定 10 分钟
const pinFails = new Map<string, { count: number; lockedUntil: number }>();

function pinKey(req: Request): string {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
  const op = String((req.body as any)?.operatorName || '').trim() || 'unknown';
  return `${ip}|${op}`;
}

function isPinLocked(req: Request): { locked: boolean; retryAfterSec: number } {
  const entry = pinFails.get(pinKey(req));
  if (!entry || entry.lockedUntil <= Date.now()) return { locked: false, retryAfterSec: 0 };
  return { locked: true, retryAfterSec: Math.ceil((entry.lockedUntil - Date.now()) / 1000) };
}

function recordPinFail(req: Request): { locked: boolean; retryAfterSec: number; remaining: number } {
  const key = pinKey(req);
  const now = Date.now();
  const entry = pinFails.get(key);
  // 锁定已过期 → 重置计数
  if (entry && entry.lockedUntil <= now) pinFails.delete(key);
  const cur = pinFails.get(key) || { count: 0, lockedUntil: 0 };
  cur.count += 1;
  if (cur.count >= PIN_MAX_FAILS) {
    cur.lockedUntil = now + PIN_LOCK_MS;
    cur.count = 0;
    pinFails.set(key, cur);
    return { locked: true, retryAfterSec: PIN_LOCK_MS / 1000, remaining: 0 };
  }
  pinFails.set(key, cur);
  return { locked: false, retryAfterSec: 0, remaining: PIN_MAX_FAILS - cur.count };
}

function recordPinSuccess(req: Request): void {
  pinFails.delete(pinKey(req));
}

/** 周期清理过期的失败记录（防内存泄漏） */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pinFails) {
    if (v.lockedUntil <= now) pinFails.delete(k);
  }
}, 60 * 1000);

interface MobileToken {
  token: string;
  operatorName: string;
  deviceName: string;
  createdAt: number;
  expiresAt: number;
}

const tokens = new Map<string, MobileToken>();

function getSetting(key: string): string {
  return (getDatabase().prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any)?.value || '';
}

/** 从数据库加载有效 token 到内存缓存（服务启动时调用） */
function loadTokensFromDb(): void {
  try {
    const db = getDatabase();
    const now = Date.now();
    const rows = db.prepare('SELECT * FROM mobile_auth_tokens WHERE expires_at > ?').all(now) as any[];
    for (const r of rows) {
      tokens.set(r.token, {
        token: r.token,
        operatorName: r.operator_name,
        deviceName: r.device_name,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      });
    }
    // 顺带清理已过期 token
    db.prepare('DELETE FROM mobile_auth_tokens WHERE expires_at <= ?').run(now);
  } catch (e) {
    console.error('[MobileAuth] load tokens failed:', e);
  }
}

// 模块加载时从数据库恢复（服务重启后仍有效）
loadTokensFromDb();

function saveTokenToDb(t: MobileToken): void {
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO mobile_auth_tokens (token, operator_name, device_name, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET expires_at = excluded.expires_at
    `).run(t.token, t.operatorName, t.deviceName, t.createdAt, t.expiresAt);
  } catch (e) {
    console.error('[MobileAuth] save token failed:', e);
  }
}

const authRouter = Router();

/** 手机端 PIN 登录（6.2） */
authRouter.post('/pin', (req: Request, res: Response) => {
  try {
    if (getSetting('mobile_capture_enabled') === 'false') {
      return res.status(403).json({ success: false, error: '手机采集功能未启用' });
    }
    const { pin, operatorName, deviceName, areaCode } = req.body || {};
    const op = (operatorName || '').trim();
    const dev = (deviceName || '').trim();
    if (!op || !dev) {
      return res.status(400).json({ success: false, error: '操作员和设备名称不能为空' });
    }

    // 限速：锁定期间直接拒绝
    const lock = isPinLocked(req);
    if (lock.locked) {
      return res.status(429).json({
        success: false,
        error: `尝试次数过多，已锁定 ${Math.ceil(lock.retryAfterSec / 60)} 分钟，请稍后再试`,
        locked: true,
        retryAfterSec: lock.retryAfterSec,
      });
    }

    const configuredPin = getSetting('mobile_capture_pin');
    if (configuredPin) {
      if (!pin || String(pin) !== configuredPin) {
        const fail = recordPinFail(req);
        const msg = fail.locked
          ? `PIN 错误次数过多，已锁定 10 分钟，请稍后再试`
          : `PIN 不正确（还剩 ${fail.remaining} 次机会）`;
        return res.status(401).json({ success: false, error: msg, locked: fail.locked });
      }
    }
    // 登录成功 → 清零失败计数
    recordPinSuccess(req);

    const token = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    const entry: MobileToken = { token, operatorName: op, deviceName: dev, createdAt: now, expiresAt: now + TOKEN_TTL_MS };
    tokens.set(token, entry);
    saveTokenToDb(entry);

    res.json({
      success: true,
      data: {
        token,
        operatorName: op,
        deviceName: dev,
        areaCode: areaCode || '',
        expiresAt: new Date(now + TOKEN_TTL_MS).toISOString(),
        pinConfigured: !!configuredPin,
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** 验证请求携带的手机端 token（支持 Authorization header 或 ?token= query） */
export function requireMobileAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization || '';
  const headerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const token = headerToken || (typeof req.query.token === 'string' ? req.query.token : '');
  let entry = token ? tokens.get(token) : undefined;

  // 内存缓存未命中 → 查数据库（服务重启后的首次请求）
  if (!entry && token) {
    try {
      const db = getDatabase();
      const r = db.prepare('SELECT * FROM mobile_auth_tokens WHERE token = ?').get(token) as any;
      if (r && r.expires_at > Date.now()) {
        entry = {
          token: r.token,
          operatorName: r.operator_name,
          deviceName: r.device_name,
          createdAt: r.created_at,
          expiresAt: r.expires_at,
        };
        tokens.set(token, entry);
      }
    } catch { /* 数据库异常按未登录处理 */ }
  }

  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) tokens.delete(token);
    res.status(401).json({ success: false, error: '未登录或会话已过期，请重新输入 PIN' });
    return;
  }
  (req as any).mobileOperator = entry.operatorName;
  (req as any).mobileDevice = entry.deviceName;
  next();
}

export { authRouter };
