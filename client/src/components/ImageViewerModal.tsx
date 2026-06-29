import React, { useState, useEffect } from 'react';
import './Modal.css';

interface ImageViewerModalProps {
  reference: string;
  images: any[];
  onClose: () => void;
}

const ImageViewerModal: React.FC<ImageViewerModalProps> = ({ reference, images, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fileList, setFileList] = useState<any[]>([]);
  const [folderPath, setFolderPath] = useState('');

  useEffect(() => {
    // 加载文件夹文件列表
    fetch('/api/upload/files/list')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setFileList(d.data.files);
          setFolderPath(d.data.folderPath);
        }
      })
      .catch(() => {});
  }, []);

  const validImages = images.filter((img: any) => img.local_path);
  const current = validImages[currentIndex] as any;
  const imgUrl = current?.local_path
    ? `/api/upload/file/${encodeURIComponent(current.local_path.split(/[/\\]/).pop() || '')}`
    : '';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '90vh', background: '#1a1a2e', color: 'white' }}>
        <div className="modal-header" style={{ borderBottom: '1px solid #333' }}>
          <h3 style={{ color: 'white' }}>🖼 {reference} 的图片</h3>
          <button className="modal-close" onClick={onClose} style={{ color: 'white' }}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: 16 }}>
          {/* 主图显示 */}
          {imgUrl ? (
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <img src={imgUrl} alt=""
                style={{ maxWidth: '100%', maxHeight: '50vh', borderRadius: 8, objectFit: 'contain' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                {(current as any)?.original_name || ''} · 第 {currentIndex + 1}/{validImages.length} 张
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>暂无图片</div>
          )}

          {/* 缩略图导航 */}
          {validImages.length > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              {validImages.map((img: any, i) => {
                const url = img.local_path
                  ? `/api/upload/file/${encodeURIComponent(img.local_path.split(/[/\\]/).pop() || '')}`
                  : '';
                return (
                  <div key={i} onClick={() => setCurrentIndex(i)}
                    style={{
                      width: 56, height: 56, borderRadius: 4, overflow: 'hidden', cursor: 'pointer',
                      border: i === currentIndex ? '2px solid var(--accent)' : '2px solid transparent',
                      opacity: i === currentIndex ? 1 : 0.6,
                    }}>
                    {url ? (
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : <div style={{ fontSize: 20, textAlign: 'center', lineHeight: '56px' }}>🖼</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* 文件夹信息 */}
          <div style={{
            marginTop: 8, padding: '10px 14px', borderRadius: 6, background: '#2a2a3e', fontSize: 13,
          }}>
            <div style={{ marginBottom: 6 }}>
              <strong>📂 图片文件夹</strong>
            </div>
            <code style={{ fontSize: 12, color: '#8be9fd', wordBreak: 'break-all', display: 'block', marginBottom: 8 }}>
              {folderPath || 'server/data/uploads/'}
            </code>
            <div style={{ fontSize: 12, color: '#aaa' }}>
              共 {fileList.length} 个图片文件 · 最新的文件在列表顶部
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 150, overflowY: 'auto' }}>
              {fileList.slice(0, 30).map(f => (
                <a key={f.name} href={f.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: '#8be9fd', textDecoration: 'none', marginRight: 8 }}>
                  {f.name}
                </a>
              ))}
              {fileList.length > 30 && (
                <div style={{ fontSize: 11, color: '#666' }}>...还有 {fileList.length - 30} 个文件</div>
              )}
            </div>
          </div>

          {/* 浏览/下载按钮 */}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
            {currentIndex > 0 && (
              <button className="btn btn-sm" onClick={() => setCurrentIndex(i => i - 1)}
                style={{ background: '#333', color: 'white', border: '1px solid #555' }}>
                ◀ 上一张
              </button>
            )}
            {currentIndex < validImages.length - 1 && (
              <button className="btn btn-sm" onClick={() => setCurrentIndex(i => i + 1)}
                style={{ background: '#333', color: 'white', border: '1px solid #555' }}>
                下一张 ▶
              </button>
            )}
            {imgUrl && (
              <a href={imgUrl} target="_blank" rel="noreferrer" className="btn btn-sm"
                style={{ background: 'var(--accent)', color: 'white', textDecoration: 'none' }}>
                🔗 在新标签打开
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageViewerModal;
