import type { SiteDetector } from './types';

const PRIME_DETAIL_REGEX = /\/detail\//;

export const primeVideoDetector: SiteDetector = {
  hosts: ['www.primevideo.com'],

  matches(url: URL): boolean {
    return PRIME_DETAIL_REGEX.test(url.pathname);
  },

  extract(doc: Document, _url: URL) {
    const rawTitle = doc.title;
    if (!rawTitle) return null;

    const title = rawTitle
      .replace(/^Watch\s+/i, '')
      .replace(/\s*[|–]\s*Prime Video.*$/i, '')
      .trim();
    if (!title) return null;

    return {
      title,
      ids: {},
      sourceSite: 'www.primevideo.com',
    };
  },
};
