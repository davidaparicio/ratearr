import { extractJsonLd } from './jsonld';
import type { SiteDetector } from './types';

const LB_FILM_REGEX = /^\/film\/[^/]+/;

export const letterboxdDetector: SiteDetector = {
  hosts: ['letterboxd.com'],

  matches(url: URL): boolean {
    return LB_FILM_REGEX.test(url.pathname);
  },

  extract(doc: Document, url: URL) {
    const jsonld = extractJsonLd(doc);
    if (jsonld) {
      return {
        title: jsonld.title,
        year: jsonld.year,
        mediaType: 'movie' as const,
        ids: {},
        sourceSite: url.hostname,
      };
    }

    const ogTitle = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
    if (ogTitle) {
      const match = ogTitle.match(/^(.+?)\s*\((\d{4})\)/);
      return {
        title: match ? match[1]!.trim() : ogTitle.trim(),
        year: match ? parseInt(match[2]!, 10) : undefined,
        mediaType: 'movie' as const,
        ids: {},
        sourceSite: url.hostname,
      };
    }

    return null;
  },
};
