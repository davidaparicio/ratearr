import { dbg } from '../utils/debug';
import type { RatingResult, ResolvedTitle } from '../utils/types';
import type { RatingProvider } from './types';

const LB_BASE = 'https://letterboxd.com';

export function titleToSlug(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

interface LbRating {
  value: number;
  count: number;
  url: string;
}

export function parseJsonLdRating(html: string, pageUrl: string): LbRating | null {
  const match = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return null;

  try {
    const raw = match[1]!
      .replace(/\/\*\s*<!\[CDATA\[\s*\*\//g, '')
      .replace(/\/\*\s*\]\]>\s*\*\//g, '')
      .trim();
    const data = JSON.parse(raw);
    const agg = data.aggregateRating;
    if (!agg || typeof agg.ratingValue !== 'number') return null;

    return {
      value: Math.round(agg.ratingValue * 10) / 10,
      count: typeof agg.ratingCount === 'number' ? agg.ratingCount : undefined,
      url: pageUrl,
    };
  } catch {
    return null;
  }
}

export function extractYear(html: string): number | undefined {
  const twitterMatch = html.match(/<meta\s+name="twitter:data2"\s+content="(\d{4})/);
  if (twitterMatch) return parseInt(twitterMatch[1]!, 10);
  const jsonLdMatch = html.match(/"dateCreated"\s*:\s*"(\d{4})/);
  if (jsonLdMatch) return parseInt(jsonLdMatch[1]!, 10);
  return undefined;
}

export function isYearMatch(pageYear: number | undefined, targetYear: number | undefined): boolean {
  if (!targetYear || !pageYear) return true;
  return Math.abs(pageYear - targetYear) <= 1;
}

export function buildSlugCandidates(title: string, year?: number): string[] {
  const slug = titleToSlug(title);
  if (!slug) return [];
  if (year) return [slug, `${slug}-${year}`];
  return [slug];
}

async function trySlug(slug: string, year?: number): Promise<LbRating | null> {
  const pageUrl = `${LB_BASE}/film/${slug}/`;
  dbg('letterboxd', `trying ${pageUrl}`);
  const resp = await fetch(pageUrl);
  if (!resp.ok) {
    dbg('letterboxd', `${pageUrl} → HTTP ${resp.status}`);
    return null;
  }

  const html = await resp.text();
  const rating = parseJsonLdRating(html, pageUrl);
  if (!rating) {
    dbg('letterboxd', `${pageUrl} → no JSON-LD rating`);
    return null;
  }

  const pageYear = extractYear(html);
  dbg('letterboxd', `${pageUrl} → rating:${rating.value}/5 pageYear:${pageYear} targetYear:${year}`);
  if (!isYearMatch(pageYear, year)) {
    dbg('letterboxd', `year mismatch, skipping`);
    return null;
  }

  return rating;
}

async function fetchLetterboxdRating(title: string, year?: number): Promise<LbRating | null> {
  for (const slug of buildSlugCandidates(title, year)) {
    const rating = await trySlug(slug, year);
    if (rating) return rating;
  }
  return null;
}

export const letterboxdProvider: RatingProvider = {
  id: 'letterboxd',
  produces: ['letterboxd'],

  isConfigured(): boolean {
    return true;
  },

  async fetchRatings(resolved: ResolvedTitle): Promise<RatingResult[]> {
    if (resolved.mediaType === 'tv') {
      return [{ status: 'unavailable', source: 'letterboxd', reasonKey: 'err_not_found' }];
    }

    const rating = await fetchLetterboxdRating(resolved.title, resolved.year);

    if (!rating) {
      const localizedRating = resolved.localizedTitle
        ? await fetchLetterboxdRating(resolved.localizedTitle, resolved.year)
        : null;

      if (!localizedRating) {
        return [{ status: 'unavailable', source: 'letterboxd', reasonKey: 'err_not_found' }];
      }

      return [
        {
          status: 'ok',
          rating: {
            source: 'letterboxd',
            value: localizedRating.value,
            scale: 5,
            count: localizedRating.count,
            url: localizedRating.url,
          },
        },
      ];
    }

    return [
      {
        status: 'ok',
        rating: {
          source: 'letterboxd',
          value: rating.value,
          scale: 5,
          count: rating.count,
          url: rating.url,
        },
      },
    ];
  },
};
