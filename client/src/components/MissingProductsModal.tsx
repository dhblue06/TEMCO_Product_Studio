import React, { useState } from 'react';
import { useToast } from './ui/ToastProvider';

interface MissingProductsModalProps {
  missingInputs: string[];
  onClose: () => void;
}

const MissingProductsModal: React.FC<MissingProductsModalProps> = ({ missingInputs, onClose }) => {
  const { success } = useToast();
  const handleCopy = () => {
    navigator.clipboard.writeText(missingInputs.join('\n'));
    success('已复制到剪贴板');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3>⚠️ 缺失编号（{missingInputs.length} 个）</h3>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
            以下 {missingInputs.length} 个编号在本地产品库中未找到：
          </p>
          <div style={{ maxHeight: 300, overflowY: 'auto', background: 'var(--bg-primary)', borderRadius: 4, padding: 8, fontSize: 13, fontFamily: 'monospace', lineHeight: 1.8 }}>
            {missingInputs.map((input, i) => (
              <div key={i}>{input}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn" onClick={handleCopy} style={{ flex: 1, justifyContent: 'center' }}>📋 复制缺失编号</button>
            <button className="btn btn-primary" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>关闭</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissingProductsModal;
