import { describe, expect, it } from 'vitest';
import { getEnabledProviders, keepEnabledSources } from '../providers/registry';
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
