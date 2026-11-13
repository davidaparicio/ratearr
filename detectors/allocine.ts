import { extractJsonLd } from './jsonld';
import type { SiteDetector } from './types';

const ALLOCINE_SLUG_REGEX = /^\/(film|series)\//;

export const allocineDetector: SiteDetector = {
  hosts: ['www.allocine.fr'],

  matches(url: URL): boolean {
    return ALLOCINE_SLUG_REGEX.test(url.pathname);
  },

  extract(doc: Document, url: URL) {
    const jsonld = extractJsonLd(doc);
    if (jsonld) {
      return {
        title: jsonld.title,
        originalTitle: jsonld.originalTitle,
        year: jsonld.year,
        mediaType: jsonld.mediaType,
        ids: {},
        sourceSite: url.hostname,
      };
    }

    const ogTitle = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle?.content) {
      const match = ogTitle.content.match(/^(.+?)\s*-\s*(?:Film|Série)/);
      return {
        title: match ? match[1]!.trim() : ogTitle.content.trim(),
        ids: {},
        sourceSite: url.hostname,
      };
    }

    return null;
  },
};
