import type { Settings } from '../utils/settings';
import type { RatingResult, SourceId } from '../utils/types';
import { allocineProvider } from './allocine';
import { letterboxdProvider } from './letterboxd';
import { omdbProvider } from './omdb';
import { senscritiqueProvider } from './senscritique';
import { teleramaProvider } from './telerama';
import { tmdbProvider } from './tmdb';
import type { RatingProvider } from './types';

const ALL_PROVIDERS: RatingProvider[] = [
  tmdbProvider,
  omdbProvider,
  allocineProvider,
  senscritiqueProvider,
  letterboxdProvider,
  teleramaProvider,
];

export function getEnabledProviders(settings: Settings): RatingProvider[] {
  return ALL_PROVIDERS.filter((p) => {
    return p.produces.some((s) => settings.enabledSources[s]);
  });
}

/**
 * A provider runs when any of its sources is enabled, but it returns all of
 * them; drop the ones the user turned off so they are neither shown nor aggregated.
 */
export function keepEnabledSources(results: RatingResult[], settings: Settings): RatingResult[] {
  return results.filter(
    (r) => settings.enabledSources[r.status === 'ok' ? r.rating.source : r.source],
  );
}

export function unavailableResults(provider: RatingProvider, reasonKey: string): RatingResult[] {
  return provider.produces.map((source: SourceId) => ({
    status: 'unavailable' as const,
    source,
    reasonKey,
  }));
}
