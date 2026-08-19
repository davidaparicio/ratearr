import type { MediaType } from '../utils/types';
import type { SiteDetector } from './types';

const DISNEY_TITLE_REGEX = /^\/(movies|series)\/([^/]+)\/([^/]+)/;

export const disneyPlusDetector: SiteDetector = {
  hosts: ['www.disneyplus.com'],

  matches(url: URL): boolean {
    return DISNEY_TITLE_REGEX.test(url.pathname);
  },

  extract(doc: Document, url: URL) {
    const pathMatch = url.pathname.match(DISNEY_TITLE_REGEX);
    const mediaType: MediaType = pathMatch?.[1] === 'series' ? 'tv' : 'movie';

    const rawTitle =
      doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || doc.title;
    if (!rawTitle) return null;

    const title = rawTitle.replace(/\s*[|–]\s*Disney\+.*$/i, '').trim();
    if (!title) return null;

    return {
      title,
      mediaType,
      ids: {},
      sourceSite: 'www.disneyplus.com',
    };
  },
};
