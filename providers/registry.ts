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

/** Display order of sources: the order providers are listed in, then their `produces`. */
const SOURCE_ORDER: SourceId[] = ALL_PROVIDERS.flatMap((p) => p.produces);

function sourceOf(result: RatingResult): SourceId {
  return result.status === 'ok' ? result.rating.source : result.source;
}

/**
 * Enabled providers that a cached entry can't answer for: one of their enabled
 * sources was never fetched (enabled after caching), or was cached as "no key"
 * and the key has since been added.
 */
export function providersToRefetch(cached: RatingResult[], settings: Settings): RatingProvider[] {
  const bySource = new Map(cached.map((r) => [sourceOf(r), r]));
  return getEnabledProviders(settings).filter((p) =>
    p.produces.some((source) => {
      if (!settings.enabledSources[source]) return false;
      const result = bySource.get(source);
      if (!result) return true;
      return (
        result.status === 'unavailable' &&
        result.reasonKey === 'err_no_key' &&
        p.isConfigured(settings)
      );
    }),
  );
}

/** Cached results with `fresh` ones taking precedence per source, in display order. */
export function mergeResults(cached: RatingResult[], fresh: RatingResult[]): RatingResult[] {
  const bySource = new Map(cached.map((r) => [sourceOf(r), r]));
  for (const r of fresh) bySource.set(sourceOf(r), r);
  return [...bySource.values()].sort(
    (a, b) => SOURCE_ORDER.indexOf(sourceOf(a)) - SOURCE_ORDER.indexOf(sourceOf(b)),
  );
}

/**
 * A provider runs when any of its sources is enabled, but it returns all of
 * them; drop the ones the user turned off so they are neither shown nor aggregated.
 */
export function keepEnabledSources(results: RatingResult[], settings: Settings): RatingResult[] {
  return results.filter((r) => settings.enabledSources[sourceOf(r)]);
}

export function unavailableResults(provider: RatingProvider, reasonKey: string): RatingResult[] {
  return provider.produces.map((source: SourceId) => ({
    status: 'unavailable' as const,
    source,
    reasonKey,
  }));
}
