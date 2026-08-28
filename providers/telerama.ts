import type { RatingResult, ResolvedTitle } from '../utils/types';
import type { RatingProvider } from './types';

const TLR_BASE = 'https://www.telerama.fr';
const TLR_SEARCH = `${TLR_BASE}/recherche/critiques`;

interface TeleramaRatings {
  critic?: { value: number; url: string };
  subscribers?: { value: number; count?: number; url: string };
}

export function parseCriticRating(html: string): number | null {
  const match = html.match(
    /<script\s+type="application\/ld\+json"\s+data-tag="content">([\s\S]*?)<\/script>/,
  );
  if (!match) return null;

  try {
    const raw = match[1]!
      .replace(/\/\*\s*<!\[CDATA\[\s*\*\//g, '')
      .replace(/\/\*\s*\]\]>\s*\*\//g, '')
      .trim();
    const data = JSON.parse(raw);
    const rating = data.review?.reviewRating;
    if (!rating || typeof rating.ratingValue !== 'number') return null;
    return rating.ratingValue;
  } catch {
    return null;
  }
}

export function parseSubscriberRating(html: string): { value: number; count?: number } | null {
  const notationMatch = html.match(/notation--readers\s+notation--(\d)/);
  if (!notationMatch) return null;

  const value = parseInt(notationMatch[1]!, 10);
  if (Number.isNaN(value) || value < 1 || value > 5) return null;

  const statsMatch = html.match(/comments__globalRatingStats[^>]*>\((\d+)\s+notes?/);
  const count = statsMatch ? parseInt(statsMatch[1]!, 10) : undefined;

  return { value, count };
}

export function extractFilmHrefs(html: string): string[] {
  return [...html.matchAll(/href="(\/cinema\/films\/[^"]+)"/g)].map((m) => m[1]!);
}

export function pickBestFilmHref(hrefs: string[], year?: number): string | null {
  if (hrefs.length === 0) return null;

  if (year) {
    for (const href of hrefs) {
      const m = href.match(/(\d{4})/);
      if (m && Math.abs(parseInt(m[1]!, 10) - year) <= 1) return href;
    }
  }

  return hrefs[0]!;
}

async function findFilmUrl(title: string, year?: number): Promise<string | null> {
  const url = `${TLR_SEARCH}?q=${encodeURIComponent(title)}`;
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) return null;

  const html = await resp.text();
  const href = pickBestFilmHref(extractFilmHrefs(html), year);
  return href ? `${TLR_BASE}${href}` : null;
}

async function fetchTeleramaRatings(title: string, year?: number): Promise<TeleramaRatings | null> {
  const filmUrl = await findFilmUrl(title, year);
  if (!filmUrl) return null;

  const resp = await fetch(filmUrl, { credentials: 'include' });
  if (!resp.ok) return null;

  const html = await resp.text();
  if (html.includes('data-page="home_cinema"')) return null;

  const ratings: TeleramaRatings = {};

  const criticValue = parseCriticRating(html);
  if (criticValue != null) {
    ratings.critic = { value: criticValue, url: filmUrl };
  }

  const sub = parseSubscriberRating(html);
  if (sub) {
    ratings.subscribers = { value: sub.value, count: sub.count, url: filmUrl };
  }

  return ratings.critic || ratings.subscribers ? ratings : null;
}

export const teleramaProvider: RatingProvider = {
  id: 'telerama',
  produces: ['telerama', 'telerama-abonnes'],

  isConfigured(): boolean {
    return true;
  },

  async fetchRatings(resolved: ResolvedTitle): Promise<RatingResult[]> {
    try {
      const ratings = await fetchTeleramaRatings(resolved.localizedTitle || resolved.title, resolved.year);

      if (!ratings) {
        return this.produces.map((source) => ({
          status: 'unavailable' as const,
          source,
          reasonKey: 'err_not_found',
        }));
      }

      const results: RatingResult[] = [];

      if (ratings.critic) {
        results.push({
          status: 'ok',
          rating: {
            source: 'telerama',
            value: ratings.critic.value,
            scale: 5,
            url: ratings.critic.url,
          },
        });
      } else {
        results.push({
          status: 'unavailable',
          source: 'telerama',
          reasonKey: 'err_not_found',
        });
      }

      if (ratings.subscribers) {
        results.push({
          status: 'ok',
          rating: {
            source: 'telerama-abonnes',
            value: ratings.subscribers.value,
            scale: 5,
            count: ratings.subscribers.count,
            url: ratings.subscribers.url,
          },
        });
      } else {
        results.push({
          status: 'unavailable',
          source: 'telerama-abonnes',
          reasonKey: 'err_not_found',
        });
      }

      return results;
    } catch {
      return this.produces.map((source) => ({
        status: 'unavailable' as const,
        source,
        reasonKey: 'err_network',
      }));
    }
  },
};
