// 全局确认对话框（替代 window.confirm）
// 用法：
//   const { confirm } = useConfirm();
//   const ok = await confirm('确定删除该商品？', { title: '删除确认', danger: true });
//   if (ok) { ... }
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export interface ConfirmOptions {
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;  // 红色危险按钮
}

interface ConfirmContextValue {
  confirm: (message: React.ReactNode, opts?: Omit<ConfirmOptions, 'message'>) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm 必须在 <ConfirmProvider> 内使用');
  return ctx;
}

interface PendingState extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingState | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((message: React.ReactNode, opts?: Omit<ConfirmOptions, 'message'>): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
      setPending({ message, resolve, ...opts });
    });
  }, []);

  const close = (ok: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setPending(null);
    if (resolve) resolve(ok);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
            animation: 'dsh-fade-in .15s ease-out',
          }}
          onClick={() => close(false)}
        >
          <div
            style={{
              width: '100%', maxWidth: 420,
              background: '#fff', borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,.25)',
              overflow: 'hidden',
              animation: 'dsh-pop-in .16s ease-out',
            }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', fontSize: 15, fontWeight: 600, color: '#111827' }}>
              {pending.title || '确认操作'}
            </div>
            <div style={{ padding: '16px 20px', fontSize: 14, lineHeight: 1.6, color: '#374151', whiteSpace: 'pre-wrap', maxHeight: '50vh', overflowY: 'auto' }}>
              {pending.message}
            </div>
            <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
              <button
                type="button"
                className="btn"
                onClick={() => close(false)}
                style={{ fontSize: 13, padding: '6px 16px' }}
              >
                {pending.cancelText || '取消'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => close(true)}
                style={{
                  fontSize: 13, padding: '6px 16px',
                  background: pending.danger ? '#ef4444' : 'var(--accent, #1677ff)',
                  borderColor: pending.danger ? '#ef4444' : 'var(--accent, #1677ff)',
                  color: '#fff',
                }}
              >
                {pending.confirmText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes dsh-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dsh-pop-in { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </ConfirmContext.Provider>
  );
};

export default ConfirmProvider;
