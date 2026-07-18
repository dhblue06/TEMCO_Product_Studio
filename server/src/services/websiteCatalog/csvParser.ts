export function parseCSV(text: string, delimiter: string = ';'): string[][] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

export function detectDelimiter(firstLine: string): string {
  const comma = (firstLine.match(/,/g) || []).length;
  const semicolon = (firstLine.match(/;/g) || []).length;
  return semicolon >= comma ? ';' : ',';
}

export function detectEncoding(buffer: Buffer): string {
  // 默认 UTF-8，可根据 BOM 判断
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf-8';
  }
  return 'utf-8';
}

const PRESTASHOP_EXPORT_MAPPING: Record<string, string> = {
  prestashop_id: 'Product ID',
  image_url: 'Imagen',
  website_name: 'Nombre',
  reference: 'Referencia',
  website_category: 'Categoría',
  price_tax_excl: 'Precio (imp. excl.)',
  price_tax_incl: 'Precio (imp. incl.)',
  quantity: 'Cantidad',
};

const FIELD_ALIASES: Record<string, string[]> = {
  prestashop_id: ['Product ID', 'ID', 'id_product'],
  image_url: ['Imagen', 'Image', 'image_url'],
  website_name: ['Nombre', 'Name'],
  reference: ['Referencia', 'Reference', 'SKU'],
  website_category: ['Categoría', 'Categoria', 'Category'],
  price_tax_excl: ['Precio (imp. excl.)', 'Price tax excluded'],
  price_tax_incl: ['Precio (imp. incl.)', 'Price tax included'],
  quantity: ['Cantidad', 'Quantity', 'Stock'],
};

export function buildFieldMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalizedHeaders = headers.map(h => h.trim());

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (aliases.some(alias => normalizedHeaders[i].toLowerCase() === alias.toLowerCase())) {
        map[field] = i;
        break;
      }
    }
  }
  return map;
}
