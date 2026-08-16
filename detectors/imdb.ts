import type { SiteDetector } from './types';
import { extractJsonLd } from './jsonld';

const IMDB_TITLE_REGEX = /\/title\/(tt\d+)/;

export const imdbDetector: SiteDetector = {
  hosts: ['www.imdb.com', 'imdb.com', 'm.imdb.com'],

  matches(url: URL): boolean {
    return IMDB_TITLE_REGEX.test(url.pathname);
  },

  extract(doc: Document, url: URL) {
    const imdbIdMatch = url.pathname.match(IMDB_TITLE_REGEX);
    const imdbId = imdbIdMatch?.[1];

    const jsonld = extractJsonLd(doc);
    if (jsonld) {
      return {
        title: jsonld.title,
        originalTitle: jsonld.originalTitle,
        year: jsonld.year,
        mediaType: jsonld.mediaType,
        ids: { imdb: imdbId },
        sourceSite: url.hostname,
      };
    }

    const ogTitle = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle?.content) {
      const match = ogTitle.content.match(/^(.+?)\s*\((\d{4})\)/);
      if (match) {
        return {
          title: match[1].replace(/\s*-\s*IMDb\s*$/i, '').trim(),
          year: parseInt(match[2], 10),
          ids: { imdb: imdbId },
          sourceSite: url.hostname,
        };
      }
      return {
        title: ogTitle.content.replace(/\s*-\s*IMDb\s*$/i, '').trim(),
        ids: { imdb: imdbId },
        sourceSite: url.hostname,
      };
    }

    return null;
  },
};
