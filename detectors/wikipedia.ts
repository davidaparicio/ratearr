import { extractJsonLd } from './jsonld';
import type { SiteDetector } from './types';

const WIKI_FILM_INDICATORS = ['film)', 'movie)', 'serie)', 'series)'];

function isFilmPage(doc: Document): boolean {
  const categories = doc.querySelectorAll('#mw-normal-catlinks a');
  for (const cat of categories) {
    const text = cat.textContent?.toLowerCase() || '';
    if (text.includes('film') || text.includes('movie') || text.includes('television series')) {
      return true;
    }
  }
  const infobox = doc.querySelector('.infobox');
  if (infobox?.textContent?.match(/directed by|réalisé par|starring|genre/i)) return true;
  const titleEl = doc.getElementById('firstHeading');
  if (titleEl && WIKI_FILM_INDICATORS.some((i) => titleEl.textContent?.toLowerCase().includes(i)))
    return true;
  return false;
}

export const wikipediaDetector: SiteDetector = {
  hosts: ['en.wikipedia.org', 'fr.wikipedia.org', 'es.wikipedia.org', 'de.wikipedia.org', 'it.wikipedia.org'],

  matches(url: URL): boolean {
    return url.pathname.startsWith('/wiki/');
  },

  extract(doc: Document, url: URL) {
    if (!isFilmPage(doc)) return null;

    const jsonld = extractJsonLd(doc);
    if (jsonld) {
      return {
        title: jsonld.title,
        year: jsonld.year,
        mediaType: jsonld.mediaType,
        ids: {},
        sourceSite: url.hostname,
      };
    }

    const heading = doc.getElementById('firstHeading')?.textContent?.trim();
    if (!heading) return null;

    const title = heading.replace(/\s*\(.*\)\s*$/, '').trim();
    if (!title) return null;

    return {
      title,
      ids: {},
      sourceSite: url.hostname,
    };
  },
};
