import { describe, it, expect } from 'vitest';
import { parseOmdbResponse } from '../providers/omdb';
import inceptionFixture from './fixtures/omdb-inception.json';
import notFoundFixture from './fixtures/omdb-not-found.json';
import naFixture from './fixtures/omdb-na-ratings.json';

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
    const imdb = results.find((r) => 'source' in r && r.status === 'unavailable' && r.source === 'imdb');
    expect(imdb).toBeDefined();
  });
});
