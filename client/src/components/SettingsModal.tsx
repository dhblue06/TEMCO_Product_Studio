import React, { useState, useEffect } from 'react';
import { settingsApi, prestashopApi } from '../services/api';
import './Modal.css';

interface SettingsModalProps {
  onClose: () => void;
}

type SettingsTab = 'copy' | 'article' | 'image' | 'google' | 'prestashop' | 'scan';
type TestSection = 'copy' | 'article' | 'image' | 'ps' | 'lang' | 'cat' | 'mfg' | 'shop';

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<TestSection | ''>('');
  const [message, setMessage] = useState('');
  const [psResult, setPsResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('copy');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await settingsApi.getAll();
        if (res.success) {
          setSettings(res.data);
        }
      } catch (err: any) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await settingsApi.batchUpdate(settings);
      if (res.success) {
        setMessage('✅ 设置已保存');
      }
    } catch (err: any) {
      setMessage(`❌ 保存失败: ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleTest = async (section: 'copy' | 'image' | 'article') => {
    setTesting(section);
    setMessage('');
    try {
      const res = await settingsApi.test(section);
      if (res.success) {
        setMessage(`✅ ${res.message}`);
      } else {
        setMessage(`❌ ${res.error || '测试失败'}`);
      }
    } catch (err: any) {
      setMessage(`❌ 测试失败: ${err.message}`);
    } finally {
      setTesting('');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  // PrestaShop API handlers
  const handlePrestaShop = async (action: string, apiCall: () => Promise<any>) => {
    setTesting(action as any);
    setPsResult(null);
    try {
      const res = await apiCall();
      if (res.success) {
        setPsResult(JSON.stringify(res.data || res, null, 2));
        setMessage(`✅ ${res.message || '成功'}`);
      } else {
        setPsResult(JSON.stringify(res, null, 2));
        setMessage(`❌ ${res.message || res.error || '失败'}`);
      }
    } catch (err: any) {
      setPsResult(String(err.message));
      setMessage(`❌ ${err.message}`);
    } finally {
      setTesting('');
    }
  };

  const handleTestPrestaShop = () => handlePrestaShop('ps', () => prestashopApi.testConnection());
  const handleReadLanguages = () => handlePrestaShop('lang', () => prestashopApi.getLanguages());
  const handleReadCategories = () => handlePrestaShop('cat', () => prestashopApi.getCategories());
  const handleReadManufacturers = () => handlePrestaShop('mfg', () => prestashopApi.getManufacturers());
  const handleReadShops = () => handlePrestaShop('shop', () => prestashopApi.getShops());

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-body"><div className="loading">加载中...</div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⚙️ API 设置</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
            {([
              { key: 'copy', label: '📝 文案 API' },
              { key: 'article', label: '📰 文章 API' },
              { key: 'image', label: '🖼 图片 API' },
              { key: 'google', label: '🔗 Google 设置' },
              { key: 'prestashop', label: '🛒 PrestaShop' },
              { key: 'scan', label: '📂 扫描设置' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : ''}`}
                style={{ border: 'none', borderRadius: 0, borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent' }}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'copy' && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                用于生成 PrestaShop 商品标题、短描述、长描述、SEO meta 和图片 alt 文案。
              </div>
              <div className="detail-field">
                <label>Provider</label>
                <select value={settings.copy_provider || 'deepseek'} onChange={(e) => handleChange('copy_provider', e.target.value)}>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openai">OpenAI</option>
                  <option value="custom">自定义 OpenAI-compatible API</option>
                  <option value="template">本地模板生成</option>
                </select>
              </div>
              <div className="detail-field">
                <label>API Base URL</label>
                <input value={settings.copy_api_base_url || ''} onChange={(e) => handleChange('copy_api_base_url', e.target.value)} placeholder="https://api.deepseek.com" />
              </div>
              <div className="detail-field">
                <label>API Key</label>
                <input type="password" value={settings.copy_api_key || ''} onChange={(e) => handleChange('copy_api_key', e.target.value)} placeholder="留空则使用模板生成" />
              </div>
              <div className="detail-field">
                <label>Model</label>
                <input value={settings.copy_model || ''} onChange={(e) => handleChange('copy_model', e.target.value)} placeholder="deepseek-chat" />
              </div>
              <div className="detail-field">
                <label>Temperature</label>
                <input type="number" step="0.1" min="0" max="2" value={settings.copy_temperature || '0.3'} onChange={(e) => handleChange('copy_temperature', e.target.value)} />
              </div>
              <div className="detail-field">
                <label>Max Tokens</label>
                <input type="number" value={settings.copy_max_tokens || '4000'} onChange={(e) => handleChange('copy_max_tokens', e.target.value)} />
              </div>
              <button className="btn" onClick={() => handleTest('copy')} disabled={testing === 'copy'}>
                {testing === 'copy' ? '测试中...' : '测试文案 API'}
              </button>
            </div>
          )}

          {activeTab === 'article' && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                用于生成西班牙语 SEO 文章、分类页内容、博客内容和中文本地审核稿。
              </div>
              <div className="detail-field">
                <label>Provider</label>
                <select value={settings.article_provider || 'deepseek'} onChange={(e) => handleChange('article_provider', e.target.value)}>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openai">OpenAI</option>
                  <option value="custom">自定义 OpenAI-compatible API</option>
                  <option value="template">本地模板生成</option>
                </select>
              </div>
              <div className="detail-field">
                <label>API Base URL</label>
                <input value={settings.article_api_base_url || ''} onChange={(e) => handleChange('article_api_base_url', e.target.value)} placeholder="https://api.deepseek.com" />
              </div>
              <div className="detail-field">
                <label>API Key</label>
                <input type="password" value={settings.article_api_key || ''} onChange={(e) => handleChange('article_api_key', e.target.value)} placeholder="留空则使用模板生成" />
              </div>
              <div className="detail-field">
                <label>Model</label>
                <input value={settings.article_model || ''} onChange={(e) => handleChange('article_model', e.target.value)} placeholder="deepseek-chat" />
              </div>
              <div className="detail-field">
                <label>Temperature</label>
                <input type="number" step="0.1" min="0" max="2" value={settings.article_temperature || '0.5'} onChange={(e) => handleChange('article_temperature', e.target.value)} />
              </div>
              <div className="detail-field">
                <label>Max Tokens</label>
                <input type="number" value={settings.article_max_tokens || '6000'} onChange={(e) => handleChange('article_max_tokens', e.target.value)} />
              </div>
              <button className="btn" onClick={() => handleTest('article')} disabled={testing === 'article'}>
                {testing === 'article' ? '测试中...' : '测试文章 API'}
              </button>
            </div>
          )}

          {activeTab === 'image' && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                用于后续商品主图/场景图生成。测试连接只检查接口权限，不会实际生成图片或消耗图片额度。
              </div>
              <div className="detail-field">
                <label>图片生成 (默认关闭)</label>
                <select value={settings.image_provider || 'disabled'} onChange={(e) => handleChange('image_provider', e.target.value)}>
                  <option value="disabled">关闭</option>
                  <option value="kie">KIE API</option>
                  <option value="openai">OpenAI Images</option>
                  <option value="custom">自定义 API</option>
                </select>
              </div>
              <div className="detail-field">
                <label>API Base URL</label>
                <input value={settings.image_api_base_url || ''} onChange={(e) => handleChange('image_api_base_url', e.target.value)} placeholder="https://api.kie.ai（KIE 不用填，留空即可）" />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -8, marginBottom: 12 }}>
                KIE 使用默认地址 https://api.kie.ai，选择 KIE 时此处可留空
              </div>
              <div className="detail-field">
                <label>API Key</label>
                <input type="password" value={settings.image_api_key || ''} onChange={(e) => handleChange('image_api_key', e.target.value)} />
              </div>
              <div className="detail-field">
                <label>Model</label>
                {settings.image_provider === 'kie' ? (
                  <select value={settings.image_model || 'nano-banana-2'} onChange={(e) => handleChange('image_model', e.target.value)}>
                    <option value="nano-banana-2">🌰 nano-banana-2（文生图 / 多参考图）</option>
                    <option value="gpt-image-2-text-to-image">🤖 GPT Image 2 文生图（海报/Banner）</option>
                    <option value="gpt-image-2-image-to-image">🎨 GPT Image 2 图生图（精修/背景替换）</option>
                  </select>
                ) : (
                  <input value={settings.image_model || ''} onChange={(e) => handleChange('image_model', e.target.value)} placeholder="输入模型名称" />
                )}
              </div>
              <div className="detail-field">
                <label>图片尺寸 / 分辨率</label>
                <select value={settings.image_size || '1024x1024'} onChange={(e) => handleChange('image_size', e.target.value)}>
                  <option value="512x512">512x512（0.5K）</option>
                  <option value="1024x1024">1024x1024（1K）</option>
                  <option value="1280x1280">1280x1280（1.3K）</option>
                  <option value="2048x2048">2048x2048（2K）</option>
                  <option value="1024x1792">1024x1792（竖版）</option>
                </select>
              </div>
              <button className="btn" onClick={() => handleTest('image')} disabled={testing === 'image'}>
                {testing === 'image' ? '测试中...' : '测试图片 API'}
              </button>
            </div>
          )}

          {activeTab === 'google' && (
            <div>
              <div className="detail-field">
                <label>Sheet URL</label>
                <textarea
                  value={settings.google_sheet_url || ''}
                  onChange={(e) => handleChange('google_sheet_url', e.target.value)}
                  rows={2}
                />
              </div>
              <div className="detail-field">
                <label>Sheet 模式</label>
                <select value={settings.google_sheet_mode || 'public_csv'} onChange={(e) => handleChange('google_sheet_mode', e.target.value)}>
                  <option value="public_csv">公开 CSV 读取</option>
                  <option value="api">API</option>
                </select>
              </div>
              <div className="detail-field">
                <label>Drive 模式</label>
                <select value={settings.google_drive_mode || 'api'} onChange={(e) => handleChange('google_drive_mode', e.target.value)}>
                  <option value="api">API</option>
                  <option value="disabled">关闭</option>
                </select>
              </div>
              <div className="detail-field">
                <label>Google API Key</label>
                <input type="password" value={settings.google_api_key || ''} onChange={(e) => handleChange('google_api_key', e.target.value)} />
              </div>
              <div className="detail-field">
                <label>Access Token</label>
                <input type="password" value={settings.google_access_token || ''} onChange={(e) => handleChange('google_access_token', e.target.value)} />
              </div>
            </div>
          )}

          {activeTab === 'prestashop' && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                配置 PrestaShop API 连接。填入信息后先测试连接，再读取资源列表。
              </div>
              <div className="detail-field">
                <label>PrestaShop Base URL</label>
                <input value={settings.prestashop_base_url || 'https://temcostar.com'} onChange={(e) => handleChange('prestashop_base_url', e.target.value)} placeholder="https://temcostar.com（无需加 /api）" />
              </div>
              <div className="detail-field">
                <label>API Key</label>
                <input type="password" value={settings.prestashop_api_key || ''} onChange={(e) => handleChange('prestashop_api_key', e.target.value)} placeholder="在 PrestaShop 后台生成" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="detail-field"><label>西语语言 ID</label><input value={settings.prestashop_spanish_lang_id || '1'} onChange={e => handleChange('prestashop_spanish_lang_id', e.target.value)} /></div>
                <div className="detail-field"><label>中文语言 ID</label><input value={settings.prestashop_chinese_lang_id || ''} onChange={e => handleChange('prestashop_chinese_lang_id', e.target.value)} /></div>
                <div className="detail-field"><label>默认分类 ID</label><input value={settings.prestashop_default_category_id || '3'} onChange={e => handleChange('prestashop_default_category_id', e.target.value)} /></div>
                <div className="detail-field"><label>默认品牌 ID</label><input value={settings.prestashop_default_manufacturer_id || '1'} onChange={e => handleChange('prestashop_default_manufacturer_id', e.target.value)} /></div>
                <div className="detail-field"><label>默认店铺 ID</label><input value={settings.prestashop_default_shop_id || '1'} onChange={e => handleChange('prestashop_default_shop_id', e.target.value)} /></div>
                <div className="detail-field"><label>批量同步数量</label><input type="number" value={settings.prestashop_batch_limit || '50'} onChange={e => handleChange('prestashop_batch_limit', e.target.value)} /></div>
              </div>
              <div className="detail-field" style={{ marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={settings.category_image_upload_enabled === 'true'} onChange={e => handleChange('category_image_upload_enabled', e.target.checked ? 'true' : 'false')} />
                  启用分类图片上传
                </label>
              </div>

              <div style={{ marginTop: 16, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--accent)' }}>🔐 FTP 缩略图上传</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="detail-field"><label>FTP 主机</label><input value={settings.ftp_host || ''} onChange={e => handleChange('ftp_host', e.target.value)} placeholder="服务器 IP 或域名" /></div>
                  <div className="detail-field"><label>端口</label><input type="number" value={settings.ftp_port || '21'} onChange={e => handleChange('ftp_port', e.target.value)} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <div className="detail-field"><label>用户名</label><input value={settings.ftp_username || ''} onChange={e => handleChange('ftp_username', e.target.value)} /></div>
                  <div className="detail-field"><label>密码</label><input type="password" value={settings.ftp_password || ''} onChange={e => handleChange('ftp_password', e.target.value)} /></div>
                </div>
                <div className="detail-field" style={{ marginTop: 8 }}>
                  <label>服务器分类图片路径</label>
                  <input value={settings.ftp_category_image_dir || ''} onChange={e => handleChange('ftp_category_image_dir', e.target.value)}
                    placeholder="/www/wwwroot/temcostar.com/img/c" />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    填写服务器上 /img/c/ 目录的绝对路径（非 URL）
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, marginBottom: 12 }}>
                <button className="btn btn-sm" onClick={handleTestPrestaShop} disabled={testing === 'ps'}>
                  {testing === 'ps' ? '测试中...' : '🔌 测试连接'}
                </button>
                <button className="btn btn-sm" onClick={handleReadLanguages} disabled={testing === 'lang'}>
                  {testing === 'lang' ? '读取中...' : '🌐 读取语言'}
                </button>
                <button className="btn btn-sm" onClick={handleReadCategories} disabled={testing === 'cat'}>
                  {testing === 'cat' ? '读取中...' : '📂 读取分类'}
                </button>
                <button className="btn btn-sm" onClick={handleReadManufacturers} disabled={testing === 'mfg'}>
                  {testing === 'mfg' ? '读取中...' : '🏷 读取品牌'}
                </button>
                <button className="btn btn-sm" onClick={handleReadShops} disabled={testing === 'shop'}>
                  {testing === 'shop' ? '读取中...' : '🏪 读取店铺'}
                </button>
              </div>

              {psResult && (
                <div style={{ marginTop: 8, padding: 8, borderRadius: 4, fontSize: 12, maxHeight: 200, overflowY: 'auto',
                  background: '#fafafa', border: '1px solid var(--border-color)' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{psResult}</pre>
                </div>
              )}
            </div>
          )}

          {activeTab === 'scan' && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                设置扫描文件夹路径。扫描时系统会读取此文件夹中的图片文件，按文件名匹配产品后自动分配到对应产品的图片槽位。
              </div>
              <div className="detail-field">
                <label>扫描文件夹路径（产品图片）</label>
                <input
                  value={settings.scan_input_path || ''}
                  onChange={(e) => handleChange('scan_input_path', e.target.value)}
                  placeholder="留空则默认使用 server/data/scan-input/"
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  可填写绝对路径（如 D:\images\scan）或相对路径（相对于项目根目录）
                </div>
              </div>
              <div className="detail-field" style={{ marginTop: 16 }}>
                <label>分类图片目录</label>
                <input
                  value={settings.category_image_dir || ''}
                  onChange={(e) => handleChange('category_image_dir', e.target.value)}
                  placeholder="留空则默认使用 server/data/category-images/"
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  存放分类图片的本地目录。支持子文件夹，扫描 .jpg / .png / .webp 文件
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {message && (
              <div style={{
                padding: '6px 12px', borderRadius: 4,
                background: message.includes('❌') ? '#fff2f0' : '#f6ffed',
                fontSize: 13, marginRight: 'auto'
              }}>
                {message}
              </div>
            )}
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;