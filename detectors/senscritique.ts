import type { MediaType } from '../utils/types';
import type { SiteDetector } from './types';

const SC_PATH_REGEX = /^\/(film|serie)\/([^/]+)/;

export const senscritiqueDetector: SiteDetector = {
  hosts: ['www.senscritique.com'],

  matches(url: URL): boolean {
    return SC_PATH_REGEX.test(url.pathname);
  },

  extract(doc: Document, url: URL) {
    const pathMatch = url.pathname.match(SC_PATH_REGEX);
    const mediaType: MediaType = pathMatch?.[1] === 'serie' ? 'tv' : 'movie';

    const ogTitle = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
    if (ogTitle) {
      const match = ogTitle.match(/^(.+?)\s*\((\d{4})\)/);
      return {
        title: match ? match[1]!.trim() : ogTitle.replace(/\s*[-|].*$/, '').trim(),
        year: match ? parseInt(match[2]!, 10) : undefined,
        mediaType,
        ids: {},
        sourceSite: url.hostname,
      };
    }

    const title = doc.title?.replace(/\s*[-|].*SensCritique.*$/i, '').trim();
    if (title) {
      return {
        title,
        mediaType,
        ids: {},
        sourceSite: url.hostname,
      };
    }

    return null;
  },
};
