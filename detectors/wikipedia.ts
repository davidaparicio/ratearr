import type { MediaType } from '../utils/types';
import type { SiteDetector } from './types';

interface Classification {
  mediaType: MediaType;
  year?: number;
}

// Categories only film / series articles carry (person, novel or album pages
// have "film actresses", "adapted into films", etc., but not these). The
// capture group, when present, is the release / first-air year.
const CATEGORY_RULES: { mediaType: MediaType; pattern: RegExp }[] = [
  { mediaType: 'movie', pattern: /^(\d{4}) films$/ }, // en
  { mediaType: 'tv', pattern: /^(\d{4}) .*television series debuts$/ }, // en
  { mediaType: 'movie', pattern: /^Film .*sorti en (\d{4})$/ }, // fr
  { mediaType: 'tv', pattern: /^Série télévisée .*créée en (\d{4})$/ }, // fr
  { mediaType: 'movie', pattern: /^Filmtitel (\d{4})$/ }, // de
  { mediaType: 'tv', pattern: /^Fernsehserie der \d{4}er Jahre$/ }, // de (decade only)
  { mediaType: 'movie', pattern: /^Películas de (\d{4})$/ }, // es
  { mediaType: 'tv', pattern: /^Series de televisión iniciadas en (\d{4})$/ }, // es
  { mediaType: 'movie', pattern: /^Film .+ del (\d{4})$/ }, // it
  { mediaType: 'tv', pattern: /^Serie televisive iniziate nel (\d{4})$/ }, // it
];

// Title disambiguators: "Dune (2021 film)", "Fargo (série télévisée)", "Heat (Film, 1995)"...
const HEADING_RULES: { mediaType: MediaType; pattern: RegExp }[] = [
  { mediaType: 'movie', pattern: /\((?:(\d{4}) )?(?:film|película)(?:,? (\d{4}))?\)$/i },
  {
    mediaType: 'tv',
    pattern:
      /\((?:(\d{4}) )?(?:(?:\w+ )?TV series|série télévisée|Fernsehserie|serie de televisión|serie televisiva)(?:,? (\d{4}))?\)$/i,
  },
];

function classifyByCategories(doc: Document): Classification | null {
  const categories = [...doc.querySelectorAll('#mw-normal-catlinks a')].map(
    (a) => a.textContent?.trim() ?? '',
  );
  for (const { mediaType, pattern } of CATEGORY_RULES) {
    for (const category of categories) {
      const match = category.match(pattern);
      if (match) return { mediaType, year: match[1] ? parseInt(match[1], 10) : undefined };
    }
  }
  return null;
}

function classifyByHeading(heading: string): Classification | null {
  for (const { mediaType, pattern } of HEADING_RULES) {
    const match = heading.match(pattern);
    if (match) {
      const year = match[1] ?? match[2];
      return { mediaType, year: year ? parseInt(year, 10) : undefined };
    }
  }
  return null;
}

export const wikipediaDetector: SiteDetector = {
  hosts: [
    'en.wikipedia.org',
    'fr.wikipedia.org',
    'es.wikipedia.org',
    'de.wikipedia.org',
    'it.wikipedia.org',
  ],

  matches(url: URL): boolean {
    return url.pathname.startsWith('/wiki/');
  },

  extract(doc: Document, url: URL) {
    const heading = doc.getElementById('firstHeading')?.textContent?.trim();
    if (!heading) return null;

    const byHeading = classifyByHeading(heading);
    const byCategories = classifyByCategories(doc);
    const kind = byCategories ?? byHeading;
    if (!kind) return null;

    const title = heading.replace(/\s*\(.*\)\s*$/, '').trim();
    if (!title) return null;

    return {
      title,
      year: kind.year ?? byHeading?.year,
      mediaType: kind.mediaType,
      ids: {},
      sourceSite: url.hostname,
    };
  },
};
