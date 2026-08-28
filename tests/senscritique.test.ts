import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterAndRankProducts, type ScProduct } from '../providers/senscritique';

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
