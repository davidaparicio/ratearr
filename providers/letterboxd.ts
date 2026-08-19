import { normalizeTitle } from '../utils/normalize';
import type { RatingResult, ResolvedTitle } from '../utils/types';
import type { RatingProvider } from './types';

const LB_BASE = 'https://letterboxd.com';

function titleToSlug(title: string): string {
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

function parseJsonLdRating(html: string, pageUrl: string): LbRating | null {
  const match = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]);
    const agg = data.aggregateRating;
    if (!agg || typeof agg.ratingValue !== 'number') return null;

    return {
      value: Math.round(agg.ratingValue * 10) / 10,
      count: typeof agg.ratingCount === 'number' ? agg.ratingCount : undefined!,
      url: pageUrl,
    };
  } catch {
    return null;
  }
}

async function fetchLetterboxdRating(title: string, year?: number): Promise<LbRating | null> {
  const slug = titleToSlug(title);
  if (!slug) return null;

  const pageUrl = `${LB_BASE}/film/${slug}/`;
  const resp = await fetch(pageUrl);
  if (!resp.ok) return null;

  const html = await resp.text();
  const rating = parseJsonLdRating(html, pageUrl);

  if (rating && year) {
    const yearMatch = html.match(/<meta\s+name="twitter:data2"\s+content="([^"]+)"/);
    if (yearMatch) return rating;
    const releaseDateMatch = html.match(/"dateCreated"\s*:\s*"(\d{4})/);
    if (releaseDateMatch && Math.abs(parseInt(releaseDateMatch[1], 10) - year) > 1) {
      return null;
    }
  }

  return rating;
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

    const rating = await fetchLetterboxdRating(
      resolved.title,
      resolved.year,
    );

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
