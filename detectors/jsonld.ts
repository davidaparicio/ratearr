import type { MediaType } from '../utils/types';

export interface JsonLdResult {
  title: string;
  originalTitle?: string;
  year?: number;
  mediaType?: MediaType;
}

export function extractJsonLd(doc: Document): JsonLdResult | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent || '');
      const items = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];
      for (const item of items) {
        const type = item['@type'];
        if (type !== 'Movie' && type !== 'TVSeries') continue;

        const title = item.name || item.alternateName || '';
        if (!title) continue;

        let year: number | undefined;
        const dateStr = item.datePublished || item.dateCreated || '';
        if (dateStr) {
          const match = dateStr.match(/(\d{4})/);
          if (match) year = parseInt(match[1], 10);
        }

        return {
          title,
          originalTitle: item.alternateName || undefined,
          year,
          mediaType: type === 'TVSeries' ? 'tv' : 'movie',
        };
      }
    } catch {
      // invalid JSON-LD, skip
    }
  }
  return null;
}
