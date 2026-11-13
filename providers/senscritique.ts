import { dbg } from '../utils/debug';
import { fetchWithTimeout } from '../utils/http';
import { rankByTitleMatch } from '../utils/normalize';
import type { RatingResult, ResolvedTitle } from '../utils/types';
import { httpsUrl } from '../utils/url';
import type { RatingProvider } from './types';

const SC_GRAPHQL = 'https://apollo.senscritique.com/';
const SC_BASE = 'https://www.senscritique.com';
const SC_UNIVERSE_FILM = 1;
const SC_UNIVERSE_TV = 4;

export interface ScProduct {
  id: number;
  /** French title. */
  title: string;
  originalTitle: string | null;
  year_of_production: number | null;
  rating: number | null;
  url: string;
  slug: string;
  universe: number;
}

interface ScProductWithStats extends ScProduct {
  stats: { ratingCount: number };
}

async function scQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const resp = await fetchWithTimeout(SC_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`senscritique_http_${resp.status}`);
  const json = await resp.json();
  if (json.errors) throw new Error(`senscritique_gql: ${json.errors[0].message}`);
  return json.data;
}

export function filterAndRankProducts(
  items: { product: ScProduct | null }[],
  title: string,
  mediaType: 'movie' | 'tv',
  year?: number,
): ScProduct | null {
  const universe = mediaType === 'tv' ? SC_UNIVERSE_TV : SC_UNIVERSE_FILM;
  const products = items
    .map((i) => i.product)
    .filter((p): p is ScProduct => p != null && p.universe === universe);

  if (products.length === 0) return null;

  const ranked = rankByTitleMatch(products, title, year, {
    getTitle: (p) => p.title,
    getAltTitle: (p) => p.originalTitle ?? '',
    getYear: (p) => p.year_of_production ?? undefined,
  });

  const best = ranked[0]!;
  dbg(
    'senscritique',
    `search "${title}" → ${products.length} products, best: "${best.item.title}" (${best.item.year_of_production}) score:${best.score} yearMatch:${best.yearMatch}`,
  );
  if (best.score === 0) {
    dbg('senscritique', 'no match above threshold');
    return null;
  }

  return best.item;
}

async function searchSensCritique(
  title: string,
  mediaType: 'movie' | 'tv',
  year?: number,
): Promise<ScProduct | null> {
  // Titles come from page text and selections (quotes, backslashes, newlines),
  // so pass them as a variable rather than splicing them into the query.
  const data = await scQuery<{
    searchAutocomplete: { items: { product: ScProduct | null }[] };
  }>(
    'query Search($keywords: String!) { searchAutocomplete(keywords: $keywords) { items { product { id title originalTitle year_of_production rating url slug universe } } } }',
    { keywords: title },
  );

  return filterAndRankProducts(data.searchAutocomplete.items, title, mediaType, year);
}

async function getProductStats(id: number): Promise<number | undefined> {
  try {
    const data = await scQuery<{ product: ScProductWithStats }>(
      `{ product(id: ${id}) { stats { ratingCount } } }`,
    );
    return data.product?.stats?.ratingCount;
  } catch {
    return undefined;
  }
}

export const senscritiqueProvider: RatingProvider = {
  id: 'senscritique',
  produces: ['senscritique'],

  isConfigured(): boolean {
    return true;
  },

  async fetchRatings(resolved: ResolvedTitle): Promise<RatingResult[]> {
    const titlesToTry = resolved.localizedTitle
      ? [resolved.localizedTitle, resolved.title]
      : [resolved.title];

    let product: Awaited<ReturnType<typeof searchSensCritique>> = null;
    const errors: unknown[] = [];
    for (const t of titlesToTry) {
      try {
        product = await searchSensCritique(t, resolved.mediaType, resolved.year);
      } catch (err) {
        errors.push(err);
        continue;
      }
      if (product?.rating != null) break;
    }
    // Every search failed: surface it as a network error rather than "not found".
    if (errors.length === titlesToTry.length) throw errors[0];

    if (!product || product.rating == null) {
      return [{ status: 'unavailable', source: 'senscritique', reasonKey: 'err_not_found' }];
    }

    const count = await getProductStats(product.id);

    return [
      {
        status: 'ok',
        rating: {
          source: 'senscritique',
          value: product.rating,
          scale: 10,
          count,
          // Concatenating would let a value like "@other.host/" change the link's host.
          url: httpsUrl(product.url, SC_BASE),
        },
      },
    ];
  },
};
