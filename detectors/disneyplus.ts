import type { MediaType } from '../utils/types';
import type { SiteDetector } from './types';

const DISNEY_TITLE_REGEX = /^\/(movies|series)\/([^/]+)\/([^/]+)/;
// Current URL scheme; it doesn't say whether the title is a movie or a series.
const DISNEY_ENTITY_REGEX = /^\/(?:[a-z]{2}-[a-z]{2}\/)?browse\/entity-[0-9a-f-]+/i;

export const disneyPlusDetector: SiteDetector = {
  hosts: ['www.disneyplus.com'],

  matches(url: URL): boolean {
    return DISNEY_TITLE_REGEX.test(url.pathname) || DISNEY_ENTITY_REGEX.test(url.pathname);
  },

  extract(doc: Document, url: URL) {
    const pathMatch = url.pathname.match(DISNEY_TITLE_REGEX);
    let mediaType: MediaType | undefined;
    if (pathMatch) mediaType = pathMatch[1] === 'series' ? 'tv' : 'movie';

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
