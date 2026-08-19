import React, { useState, useRef } from 'react';
import { useToast } from './ui/ToastProvider';
import './Modal.css';

const ImageWorkshopModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { error: toastError } = useToast();
  const [reference, setReference] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setSelectedFiles(arr);
    // 生成预览 URL
    const urls = arr.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    setMessage(`已选择 ${arr.length} 张图片`);
  };

  const doUpload = async () => {
    if (!reference.trim()) { toastError('请输入商品 Reference'); return; }
    if (selectedFiles.length === 0) { toastError('请先选择图片'); return; }

    setUploading(true);
    setMessage('上传中...');

    try {
      const fd = new FormData();
      selectedFiles.forEach(f => fd.append('images', f));

      console.log('Uploading to:', `/api/upload/upload-batch/${reference.trim()}`);
      const res = await fetch(`/api/upload/upload-batch/${encodeURIComponent(reference.trim())}`, {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`服务器返回 ${res.status}: ${txt.substring(0, 100)}`);
      }

      const data = await res.json();
      console.log('Upload result:', data);

      if (data.success) {
        setResult(data.data);
        setDone(true);
        setMessage(`✅ 成功上传 ${data.data.length} 张图片`);
      } else {
        throw new Error(data.error || '上传失败');
      }
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
      toastError(`错误: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const doWhiteBg = async () => {
    if (!result || result.length === 0) return;
    setUploading(true);
    setMessage('生成白底图中...');
    try {
      for (const img of result) {
        const res = await fetch(`/api/upload/white-bg/${encodeURIComponent(reference.trim())}/${img.id}`, { method: 'POST' });
        const data = await res.json();
        console.log('White BG result:', data);
        if (!data.success) throw new Error(data.error);
      }
      setMessage('✅ 白底图生成完成！');
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const doScene = async (type: string) => {
    if (!result || result.length === 0) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/upload/scene/${encodeURIComponent(reference.trim())}/${result[0].id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneType: type }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ 场景提示词:\n${data.data.prompt.substring(0, 80)}...`);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📸 图片工坊</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Reference 输入 */}
          <div className="detail-field">
            <label>商品 Reference</label>
            <input value={reference} onChange={e => setReference(e.target.value)}
              placeholder="输入商品编号，如 0" disabled={uploading} />
          </div>

          {/* 文件选择区域 */}
          <input ref={fileRef} type="file" accept="image/*" multiple
            onChange={onFilePick} style={{ display: 'none' }} />

          <div onClick={() => !uploading && fileRef.current?.click()}
            style={{
              border: '2px dashed var(--border-color)', borderRadius: 8, padding: 24,
              textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
              background: previews.length > 0 ? '#fafafa' : 'white', marginBottom: 12,
            }}>
            {previews.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {previews.map((url, i) => (
                  <img key={i} src={url} alt=""
                    style={{ height: 80, borderRadius: 4, objectFit: 'cover' }} />
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 36, marginBottom: 4 }}>📱</div>
                <div>点击上传手机拍摄的产品照片</div>
              </div>
            )}
          </div>

          {/* 按钮组 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn" onClick={() => fileRef.current?.click()}
              disabled={uploading}>
              {previews.length > 0 ? '📤 更换图片' : '📱 选择图片'}
            </button>

            {!done ? (
              <button className="btn btn-primary" onClick={doUpload}
                disabled={uploading || !reference.trim() || selectedFiles.length === 0}
                style={{ flex: 1 }}>
                {uploading ? '⏳ 上传中...' : '📤 上传到商品'}
              </button>
            ) : (
              <>
                <button className="btn" onClick={doWhiteBg} disabled={uploading}>
                  {uploading ? '...' : '⬜ 生成白底图'}
                </button>
                <button className="btn" onClick={() => doScene('scene1')} disabled={uploading}>
                  🏠 场景 1
                </button>
                <button className="btn" onClick={() => doScene('scene2')} disabled={uploading}>
                  🏢 场景 2
                </button>
                <button className="btn" onClick={() => doScene('scene3')} disabled={uploading}>
                  🔍 场景 3
                </button>
              </>
            )}
          </div>

          {/* 消息 */}
          {message && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap',
              background: message.includes('❌') ? '#fff2f0' : message.includes('✅') ? '#f6ffed' : '#fffbe6',
              marginBottom: 12,
            }}>
              {message}
            </div>
          )}

          {/* 完成提示 */}
          {done && (
            <div style={{ padding: '10px 14px', borderRadius: 6, background: '#e6f4ff', fontSize: 13, lineHeight: 1.6 }}>
              ✅ 已上传到商品 <strong>{reference}</strong>，可在左侧商品列表点击该商品查看详情。
            </div>
          )}

          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>关闭</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageWorkshopModal;
