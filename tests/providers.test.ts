import { afterEach, describe, expect, it, vi } from 'vitest';
import { omdbProvider, parseOmdbResponse } from '../providers/omdb';
import { DEFAULT_SETTINGS } from '../utils/settings';
import inceptionFixture from './fixtures/omdb-inception.json';
import naFixture from './fixtures/omdb-na-ratings.json';
import notFoundFixture from './fixtures/omdb-not-found.json';

describe('parseOmdbResponse', () => {
  it('parses a full response with all three sources', () => {
    const results = parseOmdbResponse(inceptionFixture, 'tt1375666');
    expect(results).toHaveLength(3);

    const imdb = results.find((r) => r.status === 'ok' && r.rating.source === 'imdb');
    expect(imdb).toBeDefined();
    if (imdb?.status === 'ok') {
      expect(imdb.rating.value).toBe(8.8);
      expect(imdb.rating.scale).toBe(10);
      expect(imdb.rating.count).toBe(2500000);
      expect(imdb.rating.url).toBe('https://www.imdb.com/title/tt1375666/');
    }

    const rt = results.find((r) => r.status === 'ok' && r.rating.source === 'rottentomatoes');
    expect(rt).toBeDefined();
    if (rt?.status === 'ok') {
      expect(rt.rating.value).toBe(87);
      expect(rt.rating.scale).toBe(100);
    }

    const mc = results.find((r) => r.status === 'ok' && r.rating.source === 'metacritic');
    expect(mc).toBeDefined();
    if (mc?.status === 'ok') {
      expect(mc.rating.value).toBe(74);
      expect(mc.rating.scale).toBe(100);
    }
  });

  it('returns all unavailable for a not-found response', () => {
    const results = parseOmdbResponse(notFoundFixture);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'unavailable')).toBe(true);
  });

  it('handles N/A ratings gracefully', () => {
    const results = parseOmdbResponse(naFixture, 'tt9999999');
    expect(results).toHaveLength(3);
    const imdb = results.find(
      (r) => 'source' in r && r.status === 'unavailable' && r.source === 'imdb',
    );
    expect(imdb).toBeDefined();
  });
});

describe('omdbProvider.fetchRatings — HTTP 401', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const resolved = {
    tmdbId: 1,
    imdbId: 'tt1375666',
    mediaType: 'movie' as const,
    title: 'Inception',
  };
  const settings = { ...DEFAULT_SETTINGS, omdbApiKey: 'key' };

  function stub401(error: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ Response: 'False', Error: error }), { status: 401 }),
      ),
    );
  }

  it('reports an invalid key as such, not as a network error', async () => {
    stub401('Invalid API key!');
    const results = await omdbProvider.fetchRatings(resolved, settings);
    expect(results.map((r) => r.status === 'unavailable' && r.reasonKey)).toEqual([
      'err_bad_key',
      'err_bad_key',
      'err_bad_key',
    ]);
  });

  it('reports the daily request limit', async () => {
    stub401('Request limit reached!');
    const results = await omdbProvider.fetchRatings(resolved, settings);
    expect(
      results.every((r) => r.status === 'unavailable' && r.reasonKey === 'err_rate_limit'),
    ).toBe(true);
  });
});
