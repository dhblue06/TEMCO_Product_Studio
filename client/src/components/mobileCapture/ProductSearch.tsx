// 产品搜索组件（文档 8.2 方式三/四：型号、名称、Reference）
import React, { useEffect, useState } from 'react';
import { mobileCaptureApi } from '../../services/api';
import { MatchResult, ProductMatchCandidate } from '../../types/mobileCapture';
import { useI18n } from '../../i18n';
import { useToast } from '../ui/ToastProvider';

interface Props {
  onSelect: (candidate: ProductMatchCandidate, result?: MatchResult | null) => void;
  onManualCode: (code: string) => void;
  onAddNew?: () => void;
  prefill?: string; // 扫码自动带出的条形码
  initialResult?: MatchResult | null; // 从详情返回时恢复搜索结果
}

// 网站激活状态图标
function ActiveIcon({ active }: { active?: boolean | null }) {
  if (active === true) return <span title="网站已启用" style={{ color: '#10b981', fontSize: 15 }}>🟢</span>;
  if (active === false) return <span title="网站未启用/已下架" style={{ color: '#dc2626', fontSize: 15 }}>🔴</span>;
  return <span title="未同步到网站" style={{ color: '#9ca3af', fontSize: 15 }}>⚪</span>;
}

export function ProductSearch({ onSelect, onManualCode, onAddNew, initialResult }: Props) {
  const { t } = useI18n();
  const { error: toastError } = useToast();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<MatchResult | null>(null);
  const [candidates, setCandidates] = useState<ProductMatchCandidate[]>([]);
  const [searching, setSearching] = useState(false);

  // 从产品详情返回：恢复上次搜索结果
  useEffect(() => {
    if (initialResult) {
      setResult(initialResult);
      setCandidates(initialResult.candidates || []);
    }
  }, [initialResult]);

  const search = async (q: string) => {
    if (!q.trim()) { setResult(null); setCandidates([]); return; }
    setSearching(true);
    try {
      const res = await mobileCaptureApi.searchProduct(q.trim());
      if (res.success) {
        setResult(res.data);
        if (res.data.match) {
          onSelect(res.data.match, res.data);
          setResult(null);
          setQuery('');
        } else {
          setCandidates(res.data.candidates || []);
        }
      }
    } catch (e: any) {
      toastError('搜索失败: ' + e.message);
    } finally {
      setSearching(false);
    }
  };

  // 不自动搜索：仅输入时清空候选，点「搜索」按钮才执行
  const handleChange = (v: string) => {
    setQuery(v);
    setCandidates([]);
    setResult(null);
  };

  const submit = () => {
    if (/^\d{6,14}$/.test(query.trim())) {
      onManualCode(query.trim());
      setQuery('');
      setCandidates([]);
      setResult(null);
    } else {
      search(query);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={query}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder={t('search.ph')}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 15, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <button type="button" onClick={submit} className="btn btn-primary" disabled={searching}>
          {searching ? '...' : t('common.search')}
        </button>
      </div>

      {result && !result.match && result.candidates.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, color: '#dc2626' }}>{result.message}</div>
          {onAddNew && (
            <button type="button" onClick={onAddNew} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
              {t('search.addNew')}
            </button>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            找到 {candidates.length}{t('search.results')}<span style={{ color: 'var(--text-secondary)' }}>{t('search.active.hint')}</span>
          </div>
          {candidates.map(c => (
            <button
              key={c.productId}
              type="button"
              onClick={() => { onSelect(c, result); setCandidates([]); setQuery(''); setResult(null); }}
              style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center',
              }}
            >
              <ActiveIcon active={c.websiteActive} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{c.name || c.reference}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {c.reference} · {c.model} · {c.brand} · {t('search.confidence')} {(c.confidence * 100).toFixed(0)}%
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProductSearch;
