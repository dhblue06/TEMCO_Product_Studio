import { CopyGenerator, ProductContentInput, ProductContentResult, createFriendlyUrl } from './types';

interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

/**
 * DeepSeek / OpenAI-compatible API 文案生成器
 * 使用统一的 OpenAI API 格式
 */
export class OpenAICopyGenerator implements CopyGenerator {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  async generateProductContent(input: ProductContentInput): Promise<ProductContentResult> {
    const systemPrompt = `You are an expert in PrestaShop SEO, B2B e-commerce copywriting, product localization, and image ALT optimization for the Spanish market.

Generate optimized product content for a PrestaShop product page in JSON format. Output ONLY valid JSON, no other text.

The store is based in Spain and mainly serves B2B customers, including wholesalers, distributors, resellers, local shops, retail stores, electronics shops, mobile phone shops, bazaars, gift shops, supermarkets, small businesses and professional buyers.

IMPORTANT LANGUAGE RULE:
The prompt is in English, but the final output must be bilingual: Spanish from Spain + Simplified Chinese.
For every field, provide both Spanish and Chinese versions.
The Spanish version is for the PrestaShop product page and SEO.
The Chinese version is for internal review, product management, staff understanding and company reference.
Do not output English in the final result.

CRITICAL ACCURACY RULE:
Use only the information explicitly provided in the product data below.
Do not guess, assume, infer or invent product details.
If a detail is not provided, do not mention it.
If a field is empty or unknown, skip it naturally.
Do not add placeholders. Do not explain missing information.

STRICT CLAIM RULE:
Only mention a claim if it is explicitly included in the product data.
- Mention "carga rápida" only if fast charging is explicitly confirmed.
- Mention "22.5W", "20W", "PD", "QC", "15W", "10W" or any power value only if confirmed.
- Mention "USB-C", "Lightning", "Micro USB", "Type-C", "MagSafe", "Bluetooth", "LED", "pantalla digital", "inalámbrico" or any technical feature only if confirmed.
- Mention material only if material is explicitly confirmed.
- Mention color only if color is explicitly confirmed.
- Mention compatibility only if compatibility is explicitly confirmed.
- Mention capacity, size, quantity, speed, version or performance only if explicitly confirmed.
- Mention B2B use in a safe general way, but do not claim sales results, high demand, profit or market ranking.

STRICT FORBIDDEN CLAIM RULE:
Unless explicitly provided in the product data, never mention:
certifications, official compliance, safety standards, warranty, guaranteed quality, long service life, premium quality, best seller, high demand, popular product, top sales, number one, competitive price, low price, high profit, profit margin, high rotation, resale profit, brand trust, official approval, waterproof, shockproof, fireproof, anti-scratch, aviation approval, airline regulations, food grade, medical grade, eco-friendly, recycled material, child-safe, professional grade, universal compatibility, suitable for all devices, any technical performance not provided.

If any forbidden idea appears, remove the entire sentence before final output.

GENERAL WRITING RULES:
- Spanish must be natural Spanish from Spain. Tone: professional, clear, suitable for B2B buyers.
- Avoid exaggerated advertising language, generic AI-style phrases, keyword stuffing.
- Do not repeat the same sentence or keyword too often. Do not overuse the brand or model.
- Focus on practical use, product identification, commercial presentation and catalog value.
- Do not use "ideal para profesionales" unless the product is clearly for professional users.
- Prefer specific B2B wording such as "tiendas", "distribuidores", "mayoristas", "puntos de venta", "comercios" or "catálogo de productos" when relevant.
- Avoid exaggerated expressions: "producto esencial", "producto imprescindible", "alta demanda", "alta rotación", "gran oportunidad de venta", "la mejor opción", "calidad garantizada", "producto estrella".

OUTPUT JSON FORMAT:
{
  "es": {
    "name": "SEO Product Name (max 65 chars, product type + brand + ONE main feature only, not all specs)",
    "descriptionShort": "Short summary (120-170 chars, main confirmed benefit)",
    "description": "Long description (160-240 words, 3-4 paragraphs as HTML, no bullet points)",
    "seoTitle": "Meta title (max 60 chars)",
    "seoDescription": "Meta description (max 155 chars)",
    "friendlyUrl": "url-friendly-no-accents",
    "imageAlt": "Main image ALT (max 75 chars, unique)",
    "galleryImageAlts": ["ALT img1 (max 75 chars each, unique, NOT full product name)"],
    "whatsappCopy": "WhatsApp B2B message",
    "videoScript": "Short video script"
  },
  "zh": {
    "name": "Chinese product name",
    "descriptionShort": "Chinese short summary",
    "description": "Chinese long description (3-4 paragraphs)",
    "seoTitle": "Chinese SEO title reference",
    "seoDescription": "Chinese SEO description reference",
    "friendlyUrl": "",
    "imageAlt": "Chinese ALT reference",
    "galleryImageAlts": ["Chinese ALT references"],
    "whatsappCopy": "Chinese WhatsApp reference",
    "videoScript": "Chinese video script"
  }
}

Description paragraph structure:
P1: Introduce what the product is and its main use.
P2: Explain ONLY confirmed benefits, design, material, size, color, compatibility, capacity, interface, port type.
P3: How the product can be used, displayed, stored, sold or added to a catalog.
P4: B2B relevance in a safe general way. Use safe expressions: "puede complementar el catálogo", "facilita la presentación en tienda", "es una opción práctica para puntos de venta", "adecuado para tiendas, distribuidores y mayoristas". No demand/profit/price claims.

Avoid unnatural expressions: "acumulador de energía" for common products - prefer "batería externa" or "solución de carga portátil". Avoid "inteligente" unless smart function is confirmed. Do not repeat B2B sentences in multiple paragraphs.

ALT RULES:
- Each ALT unique, max 75 chars. Describe what is VISIBLE in the image.
- Do NOT repeat full product name in every ALT. Do not start every ALT with the same phrase.
- No "foto de producto" or "imagen del producto".
- Avoid unsupported scene descriptions: "al aire libre", "en oficina", "en casa", "profesional", "comercial" unless clearly visible or confirmed.
- For the main image: product type + brand + key visible item.
- For detail images: describe the visible detail, not the full product name.
- For usage images: describe the visible usage only.
- Include brand/model only when natural.

SELF-CHECK before output:
- Is every claim supported by product data? No invented details?
- If fast charging, power, interface, material, compatibility or capacity is mentioned, is it confirmed?
- name ≤65, seoTitle ≤60, seoDescription ≤155, descriptionShort 120-170?
- Is the title readable and not overloaded with specifications?
- Does Spanish sound natural for Spain? Any forbidden claims present?
- Is B2B wording not repeated too much?
Fix any issues before output. Return ONLY valid JSON.`;

    const userPrompt = `PRODUCT DATA:
- Reference: ${input.reference}
- Product name: ${input.name || "Not provided"}
- Category: ${input.category || "Not provided"}
- Brand: ${input.brand || "TEMCO"}
- Model: ${input.model || "Not provided"}
- Selling points: ${input.sellingPoints || "Not provided"}
- Product introduction: ${input.productIntro || input.descriptionRaw || "Not provided"}
- Number of images: ${input.imageCount || 0}

Generate bilingual Spanish + Chinese content in JSON format. Spanish for website, Chinese for internal reference. Do not invent unconfirmed data. Return valid JSON only, no markdown.`;const response = await this.callApi(systemPrompt, userPrompt);
    const parsed = this.parseResponse(response, input);
    return parsed;
  }

  private async callApi(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `${this.config.baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const body = JSON.stringify({
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 调用失败: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || '';
  }

  private parseResponse(raw: string, input: ProductContentInput): ProductContentResult {
    try {
      let jsonStr = raw;
      const jsonBlockMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      if (jsonBlockMatch) {
        jsonStr = jsonBlockMatch[1];
      }

      const parsed = JSON.parse(jsonStr.trim());
      const defaultResult = this.getDefaultResult(input);

      const merge = (target: ProductContentResult, source: any, lang: 'es' | 'zh') => {
        if (!source) return target[lang];
        return {
          name: source.name || target[lang].name,
          descriptionShort: source.descriptionShort || source.description_short || target[lang].descriptionShort,
          description: source.description || target[lang].description,
          seoTitle: source.seoTitle || source.seo_title || target[lang].seoTitle,
          seoDescription: source.seoDescription || source.seo_description || target[lang].seoDescription,
          friendlyUrl: source.friendlyUrl || source.friendly_url || createFriendlyUrl(source.name || target[lang].name),
          imageAlt: source.imageAlt || source.image_alt || target[lang].imageAlt,
          galleryImageAlts: source.galleryImageAlts || source.gallery_image_alts || target[lang].galleryImageAlts,
          whatsappCopy: source.whatsappCopy || source.whatsapp_copy || target[lang].whatsappCopy,
          videoScript: source.videoScript || source.video_script || target[lang].videoScript,
        };
      };

      return {
        es: merge(defaultResult, parsed.es, 'es'),
        zh: merge(defaultResult, parsed.zh, 'zh'),
      };
    } catch {
      return this.getDefaultResult(input);
    }
  }

  private getDefaultResult(input: ProductContentInput): ProductContentResult {
    const { TemplateCopyGenerator } = require('./templateGenerator');
    const template = new TemplateCopyGenerator();
    return template.generateProductContent(input);
  }
}