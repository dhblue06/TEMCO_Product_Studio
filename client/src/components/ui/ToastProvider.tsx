// 全局 Toast 通知系统（替代浏览器 alert / 无样式提示）
// 用法：
//   const { toast, success, error, info, warning } = useToast();
//   success('保存成功');
//   error('删除失败: ' + msg, { vibrate: true });  // 手机端可选震动
import React, { createContext, useContext, useCallback, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  duration?: number;  // 毫秒，默认 success/info 3000，error/warning 5000
  vibrate?: boolean;  // 手机端震动反馈（navigator.vibrate）
}

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, opts?: ToastOptions) => void;
  success: (message: string, opts?: ToastOptions) => void;
  error: (message: string, opts?: ToastOptions) => void;
  info: (message: string, opts?: ToastOptions) => void;
  warning: (message: string, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 <ToastProvider> 内使用');
  return ctx;
}

const TYPE_COLORS: Record<ToastType, string> = {
  success: '#10b981',
  error: '#ef4444',
  info: '#3b82f6',
  warning: '#f59e0b',
};

const TYPE_ICONS: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  warning: '⚠️',
};

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch { /* 不支持震动则忽略 */ }
}

let nextId = 1;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  const push = useCallback((message: string, type: ToastType, opts?: ToastOptions) => {
    const duration = opts?.duration ?? (type === 'error' || type === 'warning' ? 5000 : 3000);
    const id = nextId++;
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration }]); // 最多同时 5 条
    if (opts?.vibrate) {
      vibrate(type === 'error' ? [80, 40, 80] : 40);
    }
    const timer = setTimeout(() => dismiss(id), duration);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  const toast = useCallback((message: string, type: ToastType = 'info', opts?: ToastOptions) => push(message, type, opts), [push]);
  const success = useCallback((message: string, opts?: ToastOptions) => push(message, 'success', opts), [push]);
  const error = useCallback((message: string, opts?: ToastOptions) => push(message, 'error', opts), [push]);
  const info = useCallback((message: string, opts?: ToastOptions) => push(message, 'info', opts), [push]);
  const warning = useCallback((message: string, opts?: ToastOptions) => push(message, 'warning', opts), [push]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning }}>
      {children}
      {/* Toast 容器：手机端固定在顶部，桌面端固定在右上角 */}
      <div style={{
        position: 'fixed',
        top: 12,
        right: 12,
        left: 12,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              maxWidth: 'calc(100vw - 24px)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              background: '#fff',
              color: '#1f2937',
              fontSize: 13,
              lineHeight: 1.5,
              boxShadow: '0 4px 16px rgba(0,0,0,.18)',
              borderLeft: `4px solid ${TYPE_COLORS[t.type]}`,
              animation: 'dsh-toast-in .18s ease-out',
              wordBreak: 'break-word',
            }}
            role="status"
          >
            <span style={{ fontSize: 14 }}>{TYPE_ICONS[t.type]}</span>
            <span style={{ whiteSpace: 'pre-wrap' }}>{t.message}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes dsh-toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
