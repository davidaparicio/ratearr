import { describe, expect, it } from 'vitest';
import {
  getEnabledProviders,
  keepEnabledSources,
  mergeResults,
  providersToRefetch,
} from '../providers/registry';
import { DEFAULT_SETTINGS, type Settings } from '../utils/settings';
import type { RatingResult } from '../utils/types';

function settingsWith(overrides: Partial<Settings['enabledSources']>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    enabledSources: { ...DEFAULT_SETTINGS.enabledSources, ...overrides },
  };
}

const omdbResults: RatingResult[] = [
  { status: 'ok', rating: { source: 'imdb', value: 8.8, scale: 10 } },
  { status: 'ok', rating: { source: 'rottentomatoes', value: 87, scale: 100 } },
  { status: 'unavailable', source: 'metacritic', reasonKey: 'err_not_found' },
];

describe('keepEnabledSources', () => {
  it('drops results of disabled sources from a provider that is still enabled', () => {
    const settings = settingsWith({ rottentomatoes: false, metacritic: false });
    expect(getEnabledProviders(settings).map((p) => p.id)).toContain('omdb');

    const kept = keepEnabledSources(omdbResults, settings);
    expect(kept).toEqual([omdbResults[0]]);
  });

  it('drops unavailable results of disabled sources too', () => {
    const settings = settingsWith({ metacritic: false });
    const kept = keepEnabledSources(omdbResults, settings);
    expect(kept.map((r) => (r.status === 'ok' ? r.rating.source : r.source))).toEqual([
      'imdb',
      'rottentomatoes',
    ]);
  });

  it('keeps everything when all sources are enabled', () => {
    expect(keepEnabledSources(omdbResults, DEFAULT_SETTINGS)).toEqual(omdbResults);
  });
});

describe('providersToRefetch', () => {
  const tmdbOk: RatingResult = { status: 'ok', rating: { source: 'tmdb', value: 7, scale: 10 } };

  it('is empty when the cached results cover every enabled source', () => {
    const settings = settingsWith({
      imdb: false,
      rottentomatoes: false,
      metacritic: false,
      'allocine-presse': false,
      'allocine-spectateurs': false,
      senscritique: false,
      letterboxd: false,
    });
    expect(providersToRefetch([tmdbOk], settings)).toEqual([]);
  });

  it('returns providers whose enabled sources are missing from the cache', () => {
    const settings = settingsWith({ telerama: true });
    const cached: RatingResult[] = [
      tmdbOk,
      ...omdbResults,
      { status: 'ok', rating: { source: 'allocine-presse', value: 4, scale: 5 } },
      { status: 'ok', rating: { source: 'allocine-spectateurs', value: 4, scale: 5 } },
      { status: 'ok', rating: { source: 'senscritique', value: 7, scale: 10 } },
      { status: 'ok', rating: { source: 'letterboxd', value: 4, scale: 5 } },
    ];
    expect(providersToRefetch(cached, settings).map((p) => p.id)).toEqual(['telerama']);
  });

  it('returns a provider cached as "no key" once its key is configured', () => {
    const cached: RatingResult[] = [
      tmdbOk,
      { status: 'unavailable', source: 'imdb', reasonKey: 'err_no_key' },
      { status: 'unavailable', source: 'rottentomatoes', reasonKey: 'err_no_key' },
      { status: 'unavailable', source: 'metacritic', reasonKey: 'err_no_key' },
    ];
    const onlyTmdbAndOmdb = settingsWith({
      'allocine-presse': false,
      'allocine-spectateurs': false,
      senscritique: false,
      letterboxd: false,
    });
    expect(providersToRefetch(cached, onlyTmdbAndOmdb)).toEqual([]);
    expect(
      providersToRefetch(cached, { ...onlyTmdbAndOmdb, omdbApiKey: 'key' }).map((p) => p.id),
    ).toEqual(['omdb']);
  });
});

describe('mergeResults', () => {
  it('replaces cached results with fresh ones for the same source, in provider order', () => {
    const cached: RatingResult[] = [
      { status: 'ok', rating: { source: 'letterboxd', value: 4, scale: 5 } },
      { status: 'unavailable', source: 'imdb', reasonKey: 'err_no_key' },
    ];
    const fresh: RatingResult[] = [
      { status: 'ok', rating: { source: 'imdb', value: 8.8, scale: 10 } },
      { status: 'ok', rating: { source: 'tmdb', value: 7, scale: 10 } },
    ];
    expect(mergeResults(cached, fresh)).toEqual([fresh[1], fresh[0], cached[0]]);
  });
});
