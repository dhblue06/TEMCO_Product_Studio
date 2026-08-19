import React, { useState } from 'react';
import MissingProductsModal from './MissingProductsModal';
import { useToast } from './ui/ToastProvider';

interface ProductLookupModalProps {
  onClose: () => void;
  onResults: (refs: string[]) => void;
}

const ProductLookupModal: React.FC<ProductLookupModalProps> = ({ onClose, onResults }) => {
  const { error: toastError } = useToast();
  const [input, setInput] = useState('');
  const [querying, setQuerying] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showMissing, setShowMissing] = useState(false);

  const handleQuery = async () => {
    if (!input.trim()) return;
    setQuerying(true);
    setResult(null);
    try {
      const res = await fetch('/api/product-lookup/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, matchFields: ['reference', 'ean13', 'upc'], deduplicateProducts: true }),
      });
      const d = await res.json();
      if (d.success) {
        setResult(d.data);
        if (d.data.missing > 0) setShowMissing(true);
        if (d.data.products.length > 0) {
          onResults(d.data.products.map((p: any) => p.reference));
        }
      } else {
        toastError(d.error || '查询失败');
      }
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setQuerying(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 550 }}>
        <div className="modal-header">
          <h3>🔍 批量编号查询</h3>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            输入 Reference、EAN13 或 UPC，每行一个，支持逗号/分号/tab分隔
          </div>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={'184436\nES20-R\n8431234567890'}
            rows={6}
            style={{ width: '100%', padding: 8, border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 13, fontFamily: 'monospace', resize: 'vertical' }}
          />
          <button className="btn btn-primary" onClick={handleQuery} disabled={querying || !input.trim()}
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            {querying ? '⏳ 查询中...' : '🔍 查询'}
          </button>

          {result && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-primary)', borderRadius: 6, fontSize: 13 }}>
              <div>输入编号：<strong>{result.total}</strong></div>
              <div>匹配产品：<strong>{result.matched}</strong></div>
              <div>重复输入：<strong>{result.duplicates}</strong></div>
              <div>缺失编号：<strong style={{ color: result.missing > 0 ? 'var(--error)' : 'var(--success)' }}>{result.missing}</strong></div>
              {result.missing > 0 && (
                <button className="btn btn-sm" onClick={() => setShowMissing(true)} style={{ marginTop: 8 }}>
                  📋 查看缺失编号
                </button>
              )}
              <div style={{ marginTop: 8 }}>
                <button className="btn btn-sm" onClick={onClose} style={{ marginRight: 8 }}>✅ 完成</button>
              </div>
            </div>
          )}
        </div>

        {showMissing && result?.missingInputs && (
          <MissingProductsModal missingInputs={result.missingInputs} onClose={() => setShowMissing(false)} />
        )}
      </div>
    </div>
  );
};

export default ProductLookupModal;
