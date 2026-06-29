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

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let errMsg = `HTTP ${response.status}`;
      try {
        const parsed = this.parser.parse(text);
        if (parsed?.errors?.error) {
          const err = Array.isArray(parsed.errors.error) ? parsed.errors.error[0] : parsed.errors.error;
          errMsg = err.message || err['@_message'] || err.msg || JSON.stringify(err);
        }
      } catch {
        errMsg = text.substring(0, 200).replace(/<[^>]*>/g, ' ').trim() || errMsg;
      }
      throw new Error(`PrestaShop Sync ${errMsg}`);
    }

    const text = await response.text();
    const parsed = this.parser.parse(text) as any;
    return (parsed?.prestashop || parsed) as any;
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
        return { imageId: null, success: false, error: '图片文件不存在' };
      }

      const urlObj = new URL(`${this.getBaseUrl()}/images/products/${productId}`);
      urlObj.searchParams.set('ws_key', this.config.apiKey);

      // 使用 exec 调用 curl 来上传（确保兼容性）
      const { execSync } = require('child_process');
      const curlCmd = `curl -s -X POST "${urlObj.toString()}" -F "image=@${imagePath}"`;
      
      try {
        const stdout = execSync(curlCmd, { encoding: 'utf-8', timeout: 30000 });
        const parsed = this.parser.parse(stdout) as any;
        const unwrapped = parsed?.prestashop || parsed;
        if (unwrapped?.errors?.error) {
          const e = Array.isArray(unwrapped.errors.error) ? unwrapped.errors.error[0] : unwrapped.errors.error;
          return { imageId: null, success: false, error: e.message || JSON.stringify(e) };
        }
        const imageId = unwrapped?.image?.id;
        return { imageId: imageId ? Number(imageId) : null, success: true };
      } catch (execErr: any) {
        return { imageId: null, success: false, error: execErr.message };
      }
    } catch (err: any) {
      return { imageId: null, success: false, error: err.message };
    }
  }

  /**
   * 设置图片为封面
   */
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
    return this.asArray(data?.categories?.category).map((c: any) => ({
      id: c.id || '',
      idParent: c.id_parent || '',
      active: c.active || '',
      name: c.name || '',
      linkRewrite: c.link_rewrite || '',
    }));
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
