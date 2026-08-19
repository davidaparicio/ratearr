import type { Settings } from '../utils/settings';
import type { RatingResult, SourceId } from '../utils/types';
import { allocineProvider } from './allocine';
import { letterboxdProvider } from './letterboxd';
import { omdbProvider } from './omdb';
import { senscritiqueProvider } from './senscritique';
import { tmdbProvider } from './tmdb';
import type { RatingProvider } from './types';

const ALL_PROVIDERS: RatingProvider[] = [
  tmdbProvider,
  omdbProvider,
  allocineProvider,
  senscritiqueProvider,
  letterboxdProvider,
];

export function getEnabledProviders(settings: Settings): RatingProvider[] {
  return ALL_PROVIDERS.filter((p) => {
    return p.produces.some((s) => settings.enabledSources[s]);
  });
}

export function unavailableResults(provider: RatingProvider, reasonKey: string): RatingResult[] {
  return provider.produces.map((source: SourceId) => ({
    status: 'unavailable' as const,
    source,
    reasonKey,
  }));
}
