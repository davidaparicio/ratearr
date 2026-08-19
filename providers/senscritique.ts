import { rankByTitleMatch } from '../utils/normalize';
import type { RatingResult, ResolvedTitle } from '../utils/types';
import type { RatingProvider } from './types';

const SC_GRAPHQL = 'https://apollo.senscritique.com/';
const SC_BASE = 'https://www.senscritique.com';
const SC_UNIVERSE_FILM = 1;
const SC_UNIVERSE_TV = 4;

interface ScProduct {
  id: number;
  title: string;
  year_of_production: number | null;
  rating: number | null;
  url: string;
  slug: string;
  universe: number;
}

interface ScProductWithStats extends ScProduct {
  stats: { ratingCount: number };
}

async function scQuery<T>(query: string): Promise<T> {
  const resp = await fetch(SC_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error(`senscritique_http_${resp.status}`);
  const json = await resp.json();
  if (json.errors) throw new Error(`senscritique_gql: ${json.errors[0].message}`);
  return json.data;
}

async function searchSensCritique(
  title: string,
  mediaType: 'movie' | 'tv',
  year?: number,
): Promise<ScProduct | null> {
  const escaped = title.replace(/"/g, '\\"');
  const data = await scQuery<{
    searchAutocomplete: { items: { product: ScProduct | null }[] };
  }>(
    `{ searchAutocomplete(keywords: "${escaped}") { items { product { id title year_of_production rating url slug universe } } } }`,
  );

  const universe = mediaType === 'tv' ? SC_UNIVERSE_TV : SC_UNIVERSE_FILM;
  const products = data.searchAutocomplete.items
    .map((i) => i.product)
    .filter((p): p is ScProduct => p != null && p.universe === universe);

  if (products.length === 0) return null;

  const ranked = rankByTitleMatch(products, title, year, {
    getTitle: (p) => p.title,
    getAltTitle: () => '',
    getYear: (p) => p.year_of_production ?? undefined,
  });

  return ranked[0].item;
}

async function getProductStats(id: number): Promise<number | undefined> {
  try {
    const data = await scQuery<{ product: ScProductWithStats }>(`{ product(id: ${id}) { stats { ratingCount } } }`);
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
    const product = await searchSensCritique(
      resolved.localizedTitle || resolved.title,
      resolved.mediaType,
      resolved.year,
    );

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
          url: `${SC_BASE}${product.url}`,
        },
      },
    ];
  },
};
