import type { RatingProvider } from './types';
import type { Settings } from '../utils/settings';
import type { RatingResult, SourceId } from '../utils/types';
import { tmdbProvider } from './tmdb';
import { omdbProvider } from './omdb';
import { allocineProvider } from './allocine';

const ALL_PROVIDERS: RatingProvider[] = [
  tmdbProvider,
  omdbProvider,
  allocineProvider,
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
