import type { SiteDetector } from './types';

const NETFLIX_TITLE_REGEX = /\/title\/(\d+)/;

export const netflixDetector: SiteDetector = {
  hosts: ['www.netflix.com'],

  matches(url: URL): boolean {
    return NETFLIX_TITLE_REGEX.test(url.pathname);
  },

  extract(doc: Document, _url: URL) {
    const rawTitle = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content
      || doc.title;
    if (!rawTitle) return null;

    const title = rawTitle
      .replace(/^Watch\s+/i, '')
      .replace(/\s*[|–]\s*Netflix.*$/i, '')
      .trim();
    if (!title) return null;

    return {
      title,
      ids: {},
      sourceSite: 'www.netflix.com',
    };
  },
};
