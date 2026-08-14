// 手机采集访问入口弹窗（文档 29 / 30：地址 + 二维码 + PIN）
import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { mobileCaptureApi, settingsApi } from '../../services/api';
import '../Modal.css';

interface Props {
  onClose: () => void;
  onOpenReview: () => void;
}

export function MobileCaptureAccessModal({ onClose, onOpenReview }: Props) {
  const [ips, setIps] = useState<string[]>([]);
  const [pinConfigured, setPinConfigured] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    mobileCaptureApi.getAccessInfo().then(res => {
      if (res.success) {
        setIps(res.data.ips || []);
        setPinConfigured(res.data.pinConfigured);
      }
    }).catch(() => {});
  }, []);

  const mainIp = ips[0] || 'localhost';
  const url = `http://${mainIp}:5173/mobile-capture`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const savePin = async () => {
    try {
      await settingsApi.update('mobile_capture_pin', newPin.trim());
      setPinConfigured(!!newPin.trim());
      setNewPin('');
      alert(newPin.trim() ? 'PIN 已设置' : 'PIN 已清除');
    } catch (e: any) {
      alert('保存失败: ' + e.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>📱 手机采集</h3>
          <button className="btn btn-sm" onClick={onClose}>✕ 关闭</button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          确保手机和电脑连接同一 Wi-Fi，手机扫描二维码打开采集端。
        </p>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ background: '#fff', padding: 8, borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <QRCodeSVG value={url} size={140} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>手机访问地址</div>
            <code style={{ fontSize: 12, wordBreak: 'break-all', background: 'var(--bg-secondary)', padding: '6px 8px', borderRadius: 6 }}>{url}</code>
            <button type="button" className="btn btn-sm" onClick={copy}>{copied ? '✅ 已复制' : '复制地址'}</button>
            {ips.length > 1 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                其他 IP：{ips.slice(1).join(', ')}
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            访问 PIN：{pinConfigured ? <span style={{ color: 'var(--accent)' }}>已设置</span> : <span style={{ color: 'var(--text-muted)' }}>未设置（手机可直接进入）</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={newPin}
              onChange={e => setNewPin(e.target.value)}
              placeholder="输入新 PIN（留空并保存 = 清除）"
              style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />
            <button type="button" className="btn btn-sm" onClick={savePin}>保存 PIN</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => { onClose(); window.open(url, '_blank'); }}>
            打开手机采集端
          </button>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={onOpenReview}>
            🧾 采集审核
          </button>
        </div>
      </div>
    </div>
  );
}

export default MobileCaptureAccessModal;
