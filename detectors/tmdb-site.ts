import { extractJsonLd } from './jsonld';
import type { SiteDetector } from './types';

const TMDB_PATH_REGEX = /^\/(movie|tv)\/(\d+)/;

export const tmdbSiteDetector: SiteDetector = {
  hosts: ['www.themoviedb.org'],

  matches(url: URL): boolean {
    return TMDB_PATH_REGEX.test(url.pathname);
  },

  extract(doc: Document, url: URL) {
    const pathMatch = url.pathname.match(TMDB_PATH_REGEX);
    const tmdbId = pathMatch ? parseInt(pathMatch[2]!, 10) : undefined;
    const mediaType = pathMatch?.[1] === 'tv' ? ('tv' as const) : ('movie' as const);

    const jsonld = extractJsonLd(doc);
    if (jsonld) {
      return {
        title: jsonld.title,
        originalTitle: jsonld.originalTitle,
        year: jsonld.year,
        mediaType: jsonld.mediaType ?? mediaType,
        ids: { tmdb: tmdbId },
        sourceSite: url.hostname,
      };
    }

    const ogTitle = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle?.content && tmdbId) {
      const match = ogTitle.content.match(/^(.+?)\s*\((\d{4})\)/);
      return {
        title: match ? match[1]!.trim() : ogTitle.content.replace(/\s*—.*$/, '').trim(),
        year: match ? parseInt(match[2]!, 10) : undefined,
        mediaType,
        ids: { tmdb: tmdbId },
        sourceSite: url.hostname,
      };
    }

    return null;
  },
};
