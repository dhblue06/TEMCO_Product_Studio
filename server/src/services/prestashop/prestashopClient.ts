import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import fs from 'fs';
import path from 'path';
const FormData = require('form-data');

export interface PrestaShopConfig {
  baseUrl: string;
  apiKey: string;
  defaultLangId: string;
  spanishLangId: string;
  chineseLangId: string;
  defaultCategoryId: string;
  defaultManufacturerId: string;
  defaultShopId: string;
}

/**
 * PrestaShop API 客户端
 * 使用 XML 格式 + Basic Auth
 */
export class PrestaShopClient {
  private config: PrestaShopConfig;
  private parser: XMLParser;

  constructor(config: PrestaShopConfig) {
    this.config = config;
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['language', 'category', 'manufacturer', 'shop', 'product'].includes(name),
    });
  }

  private getBaseUrl(): string {
    let base = this.config.baseUrl.replace(/\/+$/, '');
    // 兼容已包含 /api 的 URL
    if (!base.endsWith('/api')) {
      base = `${base}/api`;
    }
    return base;
  }

  private getAuthHeader(): string {
    const token = Buffer.from(`${this.config.apiKey}:`).toString('base64');
    return `Basic ${token}`;
  }

  /**
   * 通用 GET 请求
   */
  async get<T = any>(resource: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.getBaseUrl()}/${resource}`);
    
    // PrestaShop API Key 作为查询参数（能跟随重定向）
    url.searchParams.set('ws_key', this.config.apiKey);
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
    });

    // Debug: log response info
    console.log(`[KieDebug] GET ${url.pathname}?ws_key=*** status=${response.status}`);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let errMsg = `HTTP ${response.status}`;
      try {
        const parsed = this.parser.parse(text);
        const unwrapped = parsed?.prestashop || parsed;
        if (unwrapped?.errors?.error) {
          const err = Array.isArray(unwrapped.errors.error) ? unwrapped.errors.error[0] : unwrapped.errors.error;
          errMsg = err.message || err['@_message'] || err.msg || JSON.stringify(err);
        } else {
          errMsg = text.substring(0, 200).replace(/<[^>]*>/g, ' ').trim() || errMsg;
        }
      } catch {
        errMsg = text.substring(0, 200).replace(/<[^>]*>/g, ' ').trim() || errMsg;
      }
      throw new Error(`PrestaShop API ${errMsg}`);
    }

    const text = await response.text();
    try {
      // 先尝试 JSON 解析
      return JSON.parse(text) as T;
    } catch {
      // XML 解析 - 自动解包 prestashop 外层
      const parsed = this.parser.parse(text) as any;
      const unwrapped = parsed?.prestashop || parsed;
      console.log(`[KieParse] ${resource}: keys=${Object.keys(unwrapped).join(',')}`);
      return unwrapped as T;
    }
  }

  /**
   * 删除资源
   */
  async deleteResource(resource: string, id: number): Promise<boolean> {
    try {
      const url = new URL(`${this.getBaseUrl()}/${resource}/${id}`);
      url.searchParams.set('ws_key', this.config.apiKey);
      const response = await fetch(url.toString(), { method: 'DELETE', redirect: 'follow' });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text.substring(0, 200).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || `HTTP ${response.status}`);
      }
      return true;
    } catch (e: any) {
      if (e.message && e.message.startsWith('HTTP') === false) throw e;
      throw new Error(`PrestaShop API 删除失败: ${e.message}`);
    }
  }

  /**
   * GET 原始 XML 文本（不解析）
   */
  async getRawXml(resource: string): Promise<string | null> {
    try {
      const url = new URL(`${this.getBaseUrl()}/${resource}`);
      url.searchParams.set('ws_key', this.config.apiKey);
      const response = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  /**
   * POST XML (创建资源)
   */
  async postXml(resource: string, xml: string): Promise<any> {
    const url = new URL(`${this.getBaseUrl()}/${resource}`);
    url.searchParams.set('ws_key', this.config.apiKey);

    const response = await fetch(url.toString(), {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
      body: xml,
    });

    const text = await response.text().catch(() => '');
    const parseErrorMessage = (fallback: string) => {
      try {
        const parsed = this.parser.parse(text);
        const unwrapped = parsed?.prestashop || parsed;
        const errorNode = unwrapped?.errors?.error;
        if (errorNode) {
          const errors = Array.isArray(errorNode) ? errorNode : [errorNode];
          return errors.map((err: any) => err.message || err['#text'] || err['@_message'] || err.msg || JSON.stringify(err)).join('; ');
        }
      } catch {}
      return text.substring(0, 500).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
    };

    if (!response.ok) {
      throw new Error(`PrestaShop Sync HTTP ${response.status}: ${parseErrorMessage(response.statusText || '请求失败')}`);
    }

    if (!text.trim()) {
      throw new Error('PrestaShop Sync 创建成功响应为空，无法取得商品 ID');
    }

    const parsed = this.parser.parse(text) as any;
    const unwrapped = (parsed?.prestashop || parsed) as any;
    if (unwrapped?.errors?.error) {
      throw new Error(`PrestaShop Sync: ${parseErrorMessage('返回错误')}`);
    }
    return unwrapped;
  }

  /**
   * PUT XML (更新资源)
   */
  async putXml(resource: string, id: number, xml: string): Promise<any> {
    const url = new URL(`${this.getBaseUrl()}/${resource}/${id}`);
    url.searchParams.set('ws_key', this.config.apiKey);

    const response = await fetch(url.toString(), {
      method: 'PUT',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
      body: xml,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let errMsg = `HTTP ${response.status}`;
      try {
        const parsed = this.parser.parse(text);
        const unwrapped = parsed?.prestashop || parsed;
        if (unwrapped?.errors?.error) {
          const err = Array.isArray(unwrapped.errors.error) ? unwrapped.errors.error[0] : unwrapped.errors.error;
          errMsg = err.message || err["@_message"] || err.msg || JSON.stringify(err);
        } else {
          errMsg = text.substring(0, 200).replace(/<[^>]*>/g, " ").trim() || errMsg;
        }} catch {
        errMsg = text.substring(0, 200).replace(/<[^>]*>/g, ' ').trim() || errMsg;
      }
      throw new Error(`PrestaShop Sync ${errMsg}`);
    }

    const text = await response.text();
    const parsed = this.parser.parse(text) as any;
    return (parsed?.prestashop || parsed) as any;
  }

  /**
   * 上传商品图片到 PrestaShop
   * POST /api/images/products/{productId}
   */
  async uploadProductImage(productId: number, imagePath: string): Promise<{ imageId: number | null; success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(imagePath)) {
        return { imageId: null, success: false, error: "图片文件不存在" };
      }

      const url = `${this.getBaseUrl()}/images/products/${parseInt(String(productId), 10) || 0}?ws_key=${this.config.apiKey}`;

      // 检查图片大小，超过 1900KB 时压缩
      let uploadPath = imagePath;
      const stat = fs.statSync(imagePath);
      if (stat.size > 1900 * 1024) {
        try {
          const sharp = require('sharp');
          const compressedPath = imagePath + '.compressed.jpg';
          await sharp(imagePath)
            .jpeg({ quality: 80, mozjpeg: true })
            .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
            .toFile(compressedPath);
          uploadPath = compressedPath;
        } catch {
          // 压缩失败就用原图
        }
      }

      const { exec } = require('child_process');
      const result = await new Promise<any>((resolve) => {
        exec(`curl -s -X POST "${url}" -F "image=@${uploadPath}"`, {
          maxBuffer: 100 * 1024 * 1024,
          timeout: 120000,
        }, (err: any, stdout: string) => {
          if (!stdout) {
            resolve({ imageId: null, success: false, error: err?.message || '无响应' });
            return;
          }
          try {
            const { XMLParser } = require('fast-xml-parser');
            const parser = new XMLParser({ ignoreAttributes: false });
            const parsed = parser.parse(stdout);
            const unwrapped = parsed?.prestashop || parsed;
            if (unwrapped?.errors?.error) {
              const e = Array.isArray(unwrapped.errors.error) ? unwrapped.errors.error[0] : unwrapped.errors.error;
              resolve({ imageId: null, success: false, error: e.message || JSON.stringify(e) });
              return;
            }
            const imageId = unwrapped?.image?.id;
            resolve({ imageId: imageId ? Number(imageId) : null, success: true });
          } catch (e: any) {
            resolve({ imageId: null, success: false, error: e.message });
          }
        });
      });

      // 清理临时压缩文件
      if (uploadPath !== imagePath) {
        try { fs.unlinkSync(uploadPath); } catch {}
      }

      return result;
    } catch (err: any) {
      return { imageId: null, success: false, error: err.message };
    }
  }

  async updateProductImageCover(productId: number, imageId: number, cover: 0 | 1): Promise<void> {
    const url = `${this.getBaseUrl()}/images/products/${productId}/${imageId}?ws_key=${this.config.apiKey}`;

    await new Promise<void>((resolve, reject) => {
      const form = new FormData();
      form.append('cover', String(cover));
      
      form.submit(url, (err: any, res: any) => {
        if (err) { reject(err); return; }
        let data = '';
        res.on('data', (c: Buffer) => data += c.toString());
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`HTTP ${res.statusCode}`));
        });
        res.on('error', reject);
      });
    });
  }

  // 辅助：确保返回数组（PrestaShop 单条时返回对象，多条时返回数组）

  async updateProductStock(productId: number, quantity: number, shopId?: string | number): Promise<{ success: boolean; stockAvailableId?: number; error?: string }> {
    try {
      const safeProductId = parseInt(String(productId), 10) || 0;
      const safeQuantity = Math.max(0, parseInt(String(quantity || 0), 10) || 0);
      const data = await this.get<any>('stock_availables', {
        'filter[id_product]': `[${safeProductId}]`,
        display: 'full',
      });
      const stockList = this.asArray(data?.stock_availables?.stock_available);
      const stock = stockList.find((s: any) => String(s.id_product_attribute || '0') === '0') || stockList[0];
      if (!stock?.id) {
        return { success: false, error: `未找到商品 ${safeProductId} 的 stock_available 记录` };
      }

      const stockAvailableId = Number(stock.id);
      const idShop = stock.id_shop || shopId || this.config.defaultShopId || '1';
      const idShopGroup = stock.id_shop_group || '0';
      const dependsOnStock = stock.depends_on_stock ?? '0';
      const outOfStock = stock.out_of_stock ?? '2';
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <stock_available>
    <id>${stockAvailableId}</id>
    <id_product>${safeProductId}</id_product>
    <id_product_attribute>${stock.id_product_attribute || 0}</id_product_attribute>
    <id_shop>${idShop}</id_shop>
    <id_shop_group>${idShopGroup}</id_shop_group>
    <quantity>${safeQuantity}</quantity>
    <depends_on_stock>${dependsOnStock}</depends_on_stock>
    <out_of_stock>${outOfStock}</out_of_stock>
  </stock_available>
</prestashop>`;
      await this.putXml('stock_availables', stockAvailableId, xml);
      return { success: true, stockAvailableId };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }
  private asArray(val: any): any[] {
    if (val === null || val === undefined) return [];
    const arr = Array.isArray(val) ? val : [val];
    console.log(`[KieAsArray] val=${JSON.stringify(val).substring(0, 100)} => arrLen=${arr.length}`);
    return arr;
  }

  /**
   * 测试连接 - 读取语言列表
   */
  async testConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const data = await this.get<any>('languages', { display: 'full' });
      const languages = this.asArray(data?.languages?.language);
      const langList = languages.map((l: any) => ({
        id: l.id || '',
        name: l.name || '',
        isoCode: l.iso_code || '',
      }));

      return {
        success: true,
        message: 'PrestaShop connection successful',
        data: { languages: langList },
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /**
   * 读取语言列表
   */
  async getLanguages(): Promise<any[]> {
    const data = await this.get<any>('languages', { display: 'full' });
    return this.asArray(data?.languages?.language).map((l: any) => ({
      id: l.id || '',
      name: l.name || '',
      isoCode: l.iso_code || '',
      active: l.active || '',
    }));
  }

  /**
   * 读取分类列表
   */
  async getCategories(): Promise<any[]> {
    const data = await this.get<any>('categories', { display: 'full' });
    return this.asArray(data?.categories?.category).map((c: any) => {
      // PrestaShop id_parent 可能带有 xlink:href 属性，解析器将其包装为 {#text: 36, @_xlink:href: "..."}
      const extract = (v: any): string => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return String(v['#text'] ?? v.id ?? '');
        return String(v);
      };
      return {
        id: extract(c.id),
        idParent: extract(c.id_parent),
        active: extract(c.active),
        name: c.name || '',
        linkRewrite: c.link_rewrite || '',
      };
    });
  }

  /**
   * 读取制造商/品牌列表
   */
  async getManufacturers(): Promise<any[]> {
    const data = await this.get<any>('manufacturers', { display: 'full' });
    return this.asArray(data?.manufacturers?.manufacturer).map((m: any) => ({
      id: m.id || '',
      name: m.name || '',
      active: m.active || '',
    }));
  }

  /**
   * 读取店铺列表
   */
  async getShops(): Promise<any[]> {
    const data = await this.get<any>('shops', { display: 'full' });
    return this.asArray(data?.shops?.shop).map((s: any) => ({
      id: s.id || '',
      name: s.name || '',
      active: s.active || '',
    }));
  }
}
