// 仓库盘点网站快照辅助：读取全部属性值（含型号组，用于快照颜色名映射）
import { PrestaShopClient } from './prestashop/prestashopClient';
import { getDatabase } from '../database/database';

function getSetting(key: string): string {
  const db = getDatabase();
  return String((db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key) as any)?.value || '').trim();
}

export async function fetchAllOptionValuesForSnapshot(): Promise<{ id: number; name: string }[]> {
  try {
    const client = new PrestaShopClient({
      baseUrl: getSetting('prestashop_base_url') || 'https://www.temco.es',
      apiKey: getSetting('prestashop_api_key'),
      defaultLangId: getSetting('prestashop_default_lang_id') || '1',
      spanishLangId: getSetting('prestashop_spanish_lang_id') || '1',
      chineseLangId: getSetting('prestashop_chinese_lang_id'),
      defaultCategoryId: '3',
      defaultManufacturerId: '1',
      defaultShopId: '1',
    });
    const data = await Promise.race([
      client.get('product_option_values', { display: '[id,id_attribute_group,name]' }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 8000)),
    ]);
    const blocks = (data as any)?.product_option_values?.product_option_value;
    const list = Array.isArray(blocks) ? blocks : blocks ? [blocks] : [];
    return list.map((v: any) => {
      const nameRaw = v?.name?.language;
      const langs = Array.isArray(nameRaw) ? nameRaw : nameRaw ? [nameRaw] : [];
      const target = langs[0];
      return { id: Number(v?.id ?? 0), name: String(target?.['#text'] ?? target ?? '').trim() };
    }).filter((v: any) => v.id && v.name);
  } catch { return []; }
}
