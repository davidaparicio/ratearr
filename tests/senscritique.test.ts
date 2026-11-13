import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  filterAndRankProducts,
  type ScProduct,
  senscritiqueProvider,
} from '../providers/senscritique';
import { DEFAULT_SETTINGS } from '../utils/settings';

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/senscritique-inception.json'), 'utf-8'),
);
const items = fixture.data.searchAutocomplete.items;

describe('filterAndRankProducts', () => {
  it('returns the film product for movie mediaType', () => {
    const result = filterAndRankProducts(items, 'Inception', 'movie', 2010);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(471143);
    expect(result!.title).toBe('Inception');
    expect(result!.rating).toBe(7.5);
    expect(result!.universe).toBe(1);
  });

  it('filters out non-film universes (books, albums)', () => {
    const result = filterAndRankProducts(items, 'Inception', 'movie');
    expect(result).not.toBeNull();
    expect(result!.universe).toBe(1);
  });

  it('returns null when no products match the universe', () => {
    const result = filterAndRankProducts(items, 'Inception', 'tv');
    expect(result).toBeNull();
  });

  it('handles null product entries', () => {
    const withNulls = [{ product: null }, { product: null }];
    const result = filterAndRankProducts(withNulls, 'Test', 'movie');
    expect(result).toBeNull();
  });

  it('handles empty items array', () => {
    const result = filterAndRankProducts([], 'Test', 'movie');
    expect(result).toBeNull();
  });

  it('ranks by title similarity', () => {
    const mixedItems = [
      {
        product: {
          id: 1,
          title: 'Inception : Le Script',
          year_of_production: 2010,
          rating: 7.9,
          url: '/film/test/1',
          slug: 'test',
          universe: 1,
        } as ScProduct,
      },
      {
        product: {
          id: 2,
          title: 'Inception',
          year_of_production: 2010,
          rating: 7.5,
          url: '/film/inception/2',
          slug: 'inception',
          universe: 1,
        } as ScProduct,
      },
    ];
    const result = filterAndRankProducts(mixedItems, 'Inception', 'movie', 2010);
    expect(result!.id).toBe(2);
  });

  it('prefers year match', () => {
    const mixedItems = [
      {
        product: {
          id: 1,
          title: 'Inception',
          year_of_production: 2020,
          rating: 6.0,
          url: '/film/inception/1',
          slug: 'inception',
          universe: 1,
        } as ScProduct,
      },
      {
        product: {
          id: 2,
          title: 'Inception',
          year_of_production: 2010,
          rating: 7.5,
          url: '/film/inception/2',
          slug: 'inception',
          universe: 1,
        } as ScProduct,
      },
    ];
    const result = filterAndRankProducts(mixedItems, 'Inception', 'movie', 2010);
    expect(result!.id).toBe(2);
  });

  it('returns null when no result matches the title', () => {
    const unrelatedItems = [
      {
        product: {
          id: 1,
          title: 'Parasite',
          year_of_production: 2019,
          rating: 8.0,
          url: '/film/parasite/1',
          slug: 'parasite',
          universe: 1,
        } as ScProduct,
      },
      {
        product: {
          id: 2,
          title: 'Joker',
          year_of_production: 2019,
          rating: 7.0,
          url: '/film/joker/2',
          slug: 'joker',
          universe: 1,
        } as ScProduct,
      },
    ];
    const result = filterAndRankProducts(unrelatedItems, 'Juste ciel !', 'movie', 2023);
    expect(result).toBeNull();
  });
});

describe('senscritiqueProvider.fetchRatings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubGraphql(
    handler: (body: { query: string; variables?: Record<string, unknown> }) => unknown,
  ) {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      return new Response(JSON.stringify(handler(body)));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('passes the title as a GraphQL variable, not inside the query text', async () => {
    const title = 'Back\\slash "quoted"\nnewline';
    const seen: { query: string; variables?: Record<string, unknown> }[] = [];
    stubGraphql((body) => {
      seen.push(body);
      return body.query.includes('searchAutocomplete')
        ? { data: { searchAutocomplete: { items: [] } } }
        : { data: { product: null } };
    });

    await senscritiqueProvider.fetchRatings(
      { tmdbId: 1, mediaType: 'movie', title },
      DEFAULT_SETTINGS,
    );

    expect(seen[0]!.variables).toEqual({ keywords: title });
    expect(seen[0]!.query).not.toContain('quoted');
  });

  it('still tries the second title when the first search errors', async () => {
    stubGraphql((body) => {
      if (!body.query.includes('searchAutocomplete')) {
        return { data: { product: { stats: { ratingCount: 42 } } } };
      }
      return JSON.stringify(body).includes('Origine') ? { errors: [{ message: 'boom' }] } : fixture;
    });

    const results = await senscritiqueProvider.fetchRatings(
      { tmdbId: 1, mediaType: 'movie', title: 'Inception', localizedTitle: 'Origine', year: 2010 },
      DEFAULT_SETTINGS,
    );

    expect(results[0]).toMatchObject({ status: 'ok', rating: { value: 7.5, count: 42 } });
  });
});

describe('senscritique — French titles', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Shapes from live searches: SensCritique lists the French title, with the original alongside.
  const godfatherSearch = {
    data: {
      searchAutocomplete: {
        items: [
          {
            product: {
              id: 408443,
              title: 'Le Parrain',
              originalTitle: 'The Godfather',
              year_of_production: 1972,
              rating: 8.4,
              url: '/film/le_parrain/408443',
              slug: 'le_parrain',
              universe: 1,
            },
          },
        ],
      },
    },
  };

  it('matches the English title against the original title SensCritique returns', async () => {
    let searchQuery = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (!body.query.includes('searchAutocomplete')) {
          return new Response(JSON.stringify({ data: { product: { stats: { ratingCount: 1 } } } }));
        }
        searchQuery = body.query;
        return new Response(JSON.stringify(godfatherSearch));
      }),
    );

    const results = await senscritiqueProvider.fetchRatings(
      { tmdbId: 238, mediaType: 'movie', title: 'The Godfather', year: 1972 },
      DEFAULT_SETTINGS,
    );

    expect(searchQuery).toContain('originalTitle');
    expect(results[0]).toMatchObject({ status: 'ok', rating: { value: 8.4 } });
  });
});

describe('senscritique — rating link', () => {
  it('builds the link on www.senscritique.com whatever the API returns as url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (!body.query.includes('searchAutocomplete')) {
          return new Response(JSON.stringify({ data: { product: { stats: { ratingCount: 1 } } } }));
        }
        const product = {
          id: 1,
          title: 'Inception',
          originalTitle: null,
          year_of_production: 2010,
          rating: 7.5,
          url: '@evil.example/phish',
          slug: 'inception',
          universe: 1,
        };
        return new Response(
          JSON.stringify({ data: { searchAutocomplete: { items: [{ product }] } } }),
        );
      }),
    );
    const [result] = await senscritiqueProvider.fetchRatings(
      { tmdbId: 1, mediaType: 'movie', title: 'Inception', year: 2010 },
      DEFAULT_SETTINGS,
    );
    vi.unstubAllGlobals();
    expect(result!.status === 'ok' && new URL(result!.rating.url!).hostname).toBe(
      'www.senscritique.com',
    );
  });
});
