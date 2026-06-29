import { CopyGenerator, ProductContentInput, ProductContentResult, createFriendlyUrl } from './types';

/**
 * 模板生成器（兜底方案）
 * 当没有配置 API Key 时使用，生成标准化的安全内容
 */
export class TemplateCopyGenerator implements CopyGenerator {
  async generateProductContent(input: ProductContentInput): Promise<ProductContentResult> {
    const { reference, name, category } = input;
    const sellingPoints = (input.sellingPoints || '').trim();
    const productIntro = (input.productIntro || input.descriptionRaw || '').trim();

    const categoryEs = this.toSpanishCategory(category);
    const friendlyUrl = createFriendlyUrl(`${reference} ${categoryEs} temco`);

    const esName = name || `${reference} ${categoryEs} TEMCO`;
    const esDescriptionShort = sellingPoints
      ? `${esName}. ${this.toSpanishText(sellingPoints)}`
      : `${esName}. Producto diseñado para tiendas, distribuidores y venta profesional.`;
    const esDescription = this.generateSafeHtml(reference, categoryEs, sellingPoints, productIntro);
    const esSeoTitle = `${esName} | TEMCO`;
    const esSeoDescription = this.trimText(
      sellingPoints
        ? `${esName}: ${this.toSpanishText(sellingPoints)}. Consulta disponibilidad con TEMCO.`
        : `Compra ${esName}. Producto para tiendas y distribuidores. Consulta disponibilidad con el equipo TEMCO.`,
      155
    );

    const zhName = name || `${reference} ${category} TEMCO`;
    const zhDescriptionShort = sellingPoints
      ? `${zhName}。${sellingPoints}`
      : `${zhName}。专为商店、经销商和专业销售设计的产品。`;
    const zhDescription = productIntro || `${zhName}。TEMCO 产品，适用于商店销售和专业补货。请与 TEMCO 团队确认库存和颜色。`;

    const mainImageAlt = sellingPoints
      ? `${reference} ${categoryEs} TEMCO - ${this.trimText(this.toSpanishText(sellingPoints), 80)}`
      : `${reference} ${categoryEs} TEMCO`;
    const galleryAlts = this.generateGalleryAlts(reference, categoryEs, input.imageCount, sellingPoints);

    return {
      es: {
        name: esName,
        descriptionShort: this.trimText(esDescriptionShort, 300),
        description: esDescription,
        seoTitle: this.trimText(esSeoTitle, 60),
        seoDescription: esSeoDescription,
        friendlyUrl,
        imageAlt: mainImageAlt,
        galleryImageAlts: galleryAlts,
        whatsappCopy: this.generateWhatsappCopy(reference, categoryEs, sellingPoints),
        videoScript: this.generateVideoScript(reference, categoryEs, sellingPoints),
      },
      zh: {
        name: zhName,
        descriptionShort: zhDescriptionShort,
        description: zhDescription,
        seoTitle: `${esSeoTitle}`,
        seoDescription: sellingPoints || `${reference} TEMCO 产品，适用于商店销售和专业补货。`,
        friendlyUrl,
        imageAlt: mainImageAlt,
        galleryImageAlts: galleryAlts,
        whatsappCopy: this.generateWhatsappCopyZh(reference, category, sellingPoints),
        videoScript: this.generateVideoScriptZh(reference, category, sellingPoints),
      },
    };
  }

  private generateSafeHtml(reference: string, categoryEs: string, sellingPoints: string, productIntro: string): string {
    const intro = productIntro
      ? `<p>${this.escapeHtml(this.toSpanishText(productIntro))}</p>`
      : `<p><strong>${reference}</strong> es un ${categoryEs} pensado para tiendas, distribuidores y venta profesional.</p>`;
    const points = sellingPoints
      ? sellingPoints.split(/\r?\n|；|;|、/).map((p) => p.trim()).filter(Boolean)
      : [];
    const pointsHtml = points.length > 0
      ? points.map((point) => `  <li>${this.escapeHtml(this.toSpanishText(point))}</li>`).join('\n')
      : `  <li>Referencia: ${this.escapeHtml(reference)}</li>\n  <li>Categoría: ${this.escapeHtml(categoryEs)}</li>\n  <li>Uso recomendado: venta en tienda y reposición profesional</li>`;

    return `${intro}\n<ul>\n${pointsHtml}\n  <li>Consulta disponibilidad, colores y cantidades con el equipo TEMCO.</li>\n</ul>`;
  }

  private generateGalleryAlts(reference: string, categoryEs: string, count: number, sellingPoints: string): string[] {
    const point = sellingPoints ? ` ${this.trimText(this.toSpanishText(sellingPoints), 60)}` : '';
    const alts: string[] = [];
    const templates = [
      `${reference} detalle del producto ${categoryEs} TEMCO${point}`,
      `${reference} vista adicional del ${categoryEs} TEMCO${point}`,
      `${reference} presentación del producto ${categoryEs} TEMCO`,
      `${reference} imagen complementaria ${categoryEs} TEMCO`,
      `${reference} ángulo adicional ${categoryEs} TEMCO`,
      `${reference} detalle técnico ${categoryEs} TEMCO`,
      `${reference} vista completa ${categoryEs} TEMCO`,
    ];
    for (let i = 0; i < Math.min(count - 1, templates.length); i++) {
      alts.push(templates[i]);
    }
    return alts;
  }

  private generateWhatsappCopy(reference: string, categoryEs: string, sellingPoints: string): string {
    return `¡Hola! Te informamos que el producto ${reference} (${categoryEs}) ya está disponible.
Referencia: ${reference}
Categoría: ${categoryEs}
${sellingPoints ? `Puntos destacados: ${this.toSpanishText(sellingPoints)}\n` : ''}
Para más información, consulta disponibilidad, precios y condiciones con el equipo TEMCO.`;
  }

  private generateWhatsappCopyZh(reference: string, category: string, sellingPoints: string): string {
    return `您好！${reference}（${category}）现已到货。
编号：${reference}
分类：${category}
${sellingPoints ? `卖点：${sellingPoints}\n` : ''}更多信息请联系 TEMCO 团队查询库存和价格。`;
  }

  private generateVideoScript(reference: string, categoryEs: string, sellingPoints: string): string {
    return `[VIDEO SCRIPT - ${reference}]

1. Toma general del producto ${reference}
2. Acercamiento a detalles y acabados
3. ${sellingPoints ? `Destacar: ${this.toSpanishText(sellingPoints)}` : 'Uso recomendado: venta en tienda y reposición profesional'}
4. Consulta disponibilidad con TEMCO`;
  }

  private generateVideoScriptZh(reference: string, category: string, sellingPoints: string): string {
    return `[视频脚本 - ${reference}]

1. 产品全景展示 ${reference}
2. 细节和工艺特写
3. ${sellingPoints || '推荐用途：商店销售和专业补货'}
4. 请联系 TEMCO 确认库存`;
  }

  private toSpanishCategory(zhCategory: string): string {
    const map: Record<string, string> = {
      '手机配件': 'accesorio móvil',
      '手机壳': 'funda móvil',
      '屏幕保护膜': 'protector de pantalla',
      '充电器': 'cargador',
      '数据线': 'cable de datos',
      '耳机': 'auriculares',
      '手机支架': 'soporte móvil',
      '智能手表': 'reloj inteligente',
      '蓝牙音箱': 'altavoz bluetooth',
      '车载配件': 'accesorio coche',
    };
    return map[zhCategory] || `producto ${zhCategory || 'TEMCO'}`;
  }

  private toSpanishText(text: string): string {
    return text;
  }

  private trimText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}