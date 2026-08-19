import { describe, expect, it } from 'vitest';
import { aggregate } from '../utils/aggregate';
import type { RatingResult } from '../utils/types';

describe('aggregate', () => {
  it('returns undefined when no results are ok', () => {
    const results: RatingResult[] = [
      { status: 'unavailable', source: 'tmdb', reasonKey: 'err_network' },
    ];
    expect(aggregate(results)).toBeUndefined();
  });

  it('normalizes mixed scales to /10', () => {
    const results: RatingResult[] = [
      { status: 'ok', rating: { source: 'tmdb', value: 8, scale: 10 } },
      { status: 'ok', rating: { source: 'allocine-presse', value: 4, scale: 5 } },
      { status: 'ok', rating: { source: 'rottentomatoes', value: 90, scale: 100 } },
    ];
    const result = aggregate(results);
    expect(result).toBeDefined();
    expect(result?.value).toBe(8.3);
    expect(result?.sourcesUsed).toBe(3);
    expect(result?.scale).toBe(10);
  });

  it('ignores unavailable results', () => {
    const results: RatingResult[] = [
      { status: 'ok', rating: { source: 'imdb', value: 7.5, scale: 10 } },
      { status: 'unavailable', source: 'tmdb', reasonKey: 'err_no_key' },
    ];
    const result = aggregate(results);
    expect(result?.value).toBe(7.5);
    expect(result?.sourcesUsed).toBe(1);
  });
});
