import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, getSettings, sanitizeSettings, saveSettings } from '../utils/settings';

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
