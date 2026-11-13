import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  getSettings,
  parseBadgeThresholds,
  sanitizeSettings,
  saveSettings,
  weightChoices,
} from '../utils/settings';

describe('sanitizeSettings', () => {
  it('keeps well-typed known fields', () => {
    expect(
      sanitizeSettings({
        theme: 'dark',
        cacheTtlHours: 48,
        enabledSources: { imdb: false },
        sourceWeights: { tmdb: 2 },
        tmdbApiKey: 'abc',
        debug: true,
      }),
    ).toEqual({
      theme: 'dark',
      cacheTtlHours: 48,
      enabledSources: { imdb: false },
      sourceWeights: { tmdb: 2 },
      tmdbApiKey: 'abc',
      debug: true,
    });
  });

  it('drops wrongly-typed, out-of-range and unknown values', () => {
    expect(
      sanitizeSettings({
        enabledSources: null,
        sourceWeights: { tmdb: 'heavy', imdb: -1, bogus: 1 },
        theme: 'neon',
        badgeGreenMin: 42,
        cacheTtlHours: 0,
        omdbApiKey: 123,
        somethingElse: true,
      }),
    ).toEqual({ sourceWeights: {} });
  });

  it('drops unknown sources and non-boolean flags inside enabledSources', () => {
    expect(sanitizeSettings({ enabledSources: { imdb: 'yes', tmdb: false, bogus: true } })).toEqual(
      { enabledSources: { tmdb: false } },
    );
  });

  it.each([[null], ['text'], [42], [[]]])('returns nothing for non-object input %j', (input) => {
    expect(sanitizeSettings(input)).toEqual({});
  });
});

describe('getSettings / saveSettings', () => {
  beforeEach(async () => {
    await browser.storage.sync.clear();
  });

  it('fills sources missing from stored settings with their defaults', async () => {
    // e.g. settings saved by a version that predates a source
    await browser.storage.sync.set({ settings: { enabledSources: { imdb: false } } });
    const settings = await getSettings();
    expect(settings.enabledSources).toEqual({ ...DEFAULT_SETTINGS.enabledSources, imdb: false });
  });

  it('ignores corrupt stored values instead of crashing later', async () => {
    await browser.storage.sync.set({ settings: { enabledSources: null, cacheTtlHours: 'x' } });
    const settings = await getSettings();
    expect(settings.enabledSources).toEqual(DEFAULT_SETTINGS.enabledSources);
    expect(settings.cacheTtlHours).toBe(DEFAULT_SETTINGS.cacheTtlHours);
  });

  it('merges a partial enabledSources into the current one', async () => {
    await saveSettings({ enabledSources: { ...DEFAULT_SETTINGS.enabledSources, telerama: true } });
    await saveSettings({ enabledSources: { imdb: false } as never });
    const settings = await getSettings();
    expect(settings.enabledSources.telerama).toBe(true);
    expect(settings.enabledSources.imdb).toBe(false);
    expect(settings.enabledSources.tmdb).toBe(true);
  });
});

describe('parseBadgeThresholds', () => {
  it('accepts 0 as a threshold', () => {
    expect(parseBadgeThresholds('0', '0')).toEqual({ badgeGreenMin: 0, badgeYellowMin: 0 });
  });

  it('falls back to the defaults for empty or invalid input', () => {
    expect(parseBadgeThresholds('', 'abc')).toEqual({
      badgeGreenMin: DEFAULT_SETTINGS.badgeGreenMin,
      badgeYellowMin: DEFAULT_SETTINGS.badgeYellowMin,
    });
  });

  it('clamps to 0–10', () => {
    expect(parseBadgeThresholds('12', '-3')).toEqual({ badgeGreenMin: 10, badgeYellowMin: 0 });
  });

  it('keeps green at or above yellow by swapping reversed thresholds', () => {
    expect(parseBadgeThresholds('5', '7.5')).toEqual({ badgeGreenMin: 7.5, badgeYellowMin: 5 });
  });
});

describe('weightChoices', () => {
  it('offers the standard weights', () => {
    expect(weightChoices(1)).toEqual([0.5, 1, 1.5, 2]);
  });

  it('keeps a non-standard current weight (e.g. imported) selectable, in order', () => {
    expect(weightChoices(3)).toEqual([0.5, 1, 1.5, 2, 3]);
    expect(weightChoices(0)).toEqual([0, 0.5, 1, 1.5, 2]);
  });
});
