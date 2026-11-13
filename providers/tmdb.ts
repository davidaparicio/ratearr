import { dbg } from '../utils/debug';
import { fetchWithTimeout } from '../utils/http';
import { rankByTitleMatch } from '../utils/normalize';
import type { Settings } from '../utils/settings';
import type {
  MediaType,
  RatingResult,
  ResolvedTitle,
  TitleCandidate,
  TitleQuery,
  WatchProviderData,
} from '../utils/types';
import type { RatingProvider } from './types';

const TMDB_BASE = 'https://api.themoviedb.org/3';

function apiKey(settings: Settings): string {
  return settings.tmdbApiKey || import.meta.env.WXT_TMDB_API_KEY || '';
}

function validateMediaType(mediaType: string): asserts mediaType is MediaType {
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    throw new Error('invalid_media_type');
  }
}

async function tmdbFetch(
  path: string,
  params: Record<string, string>,
  settings: Settings,
): Promise<any> {
  const key = apiKey(settings);
  if (!key) throw new Error('no_tmdb_key');
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', key);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const resp = await fetchWithTimeout(url.toString());
  if (!resp.ok) throw new Error(`tmdb_http_${resp.status}`);
  return resp.json();
}

export interface ResolutionResult {
  resolved: ResolvedTitle;
  alternatives: TitleCandidate[];
}

/** The original-language title when it differs from the displayed one (movies and series). */
function originalTitleOf(r: any): string | undefined {
  const original = r.original_title || r.original_name;
  return original && original !== (r.title || r.name) ? original : undefined;
}

function parseYear(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const match = dateStr.match(/^(\d{4})/);
  return match ? parseInt(match[1]!, 10) : undefined;
}

async function resolveByTmdbId(query: TitleQuery, settings: Settings): Promise<ResolutionResult> {
  const mediaType = query.mediaType ?? 'movie';
  validateMediaType(mediaType);
  const [data, extIds] = await Promise.all([
    tmdbFetch(`/${mediaType}/${query.ids.tmdb}`, { language: 'en-US' }, settings),
    tmdbFetch(`/${mediaType}/${query.ids.tmdb}/external_ids`, {}, settings),
  ]);
  return {
    resolved: {
      tmdbId: query.ids.tmdb!,
      imdbId: extIds.imdb_id || undefined,
      mediaType,
      title: data.title || data.name || query.title,
      localizedTitle: originalTitleOf(data),
      year: parseYear(data.release_date || data.first_air_date),
      posterPath: data.poster_path || undefined,
    },
    alternatives: [],
  };
}

async function resolveByImdbId(
  query: TitleQuery,
  settings: Settings,
): Promise<ResolutionResult | null> {
  const data = await tmdbFetch(`/find/${query.ids.imdb}`, { external_source: 'imdb_id' }, settings);
  const movie = data.movie_results?.[0];
  const tv = data.tv_results?.[0];
  const result = movie || tv;
  if (!result) return null;
  const mediaType = movie ? ('movie' as const) : ('tv' as const);
  return {
    resolved: {
      tmdbId: result.id,
      imdbId: query.ids.imdb,
      mediaType,
      title: result.title || result.name,
      localizedTitle: originalTitleOf(result),
      year: parseYear(result.release_date || result.first_air_date),
      posterPath: result.poster_path || undefined,
    },
    alternatives: [],
  };
}

const MAX_ALTERNATIVES = 7;

/**
 * Searches in English and French and merges the hits, each tagged with its
 * `media_type`: taken from the hit for /search/multi (people are dropped), or
 * `endpointMediaType` for the typed endpoints. The English record is kept; the
 * French title of the same id goes in `other_titles` so French queries match.
 */
async function fetchBilingualResults(
  endpoint: string,
  baseParams: Record<string, string>,
  settings: Settings,
  endpointMediaType?: MediaType,
): Promise<any[]> {
  const [dataEn, dataFr] = await Promise.all([
    tmdbFetch(endpoint, { ...baseParams, language: 'en-US' }, settings),
    tmdbFetch(endpoint, { ...baseParams, language: 'fr-FR' }, settings),
  ]);

  // Movie and TV ids are separate namespaces, so dedupe on both.
  const byKey = new Map<string, any>();
  const enResults = Array.isArray(dataEn.results) ? dataEn.results : [];
  const frResults = Array.isArray(dataFr.results) ? dataFr.results : [];
  for (const r of [...enResults, ...frResults]) {
    const mediaType = endpointMediaType ?? r.media_type;
    if (mediaType !== 'movie' && mediaType !== 'tv') continue;
    const key = `${mediaType}:${r.id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...r, media_type: mediaType, other_titles: [] });
    } else {
      const title = r.title || r.name;
      if (title && title !== (existing.title || existing.name)) existing.other_titles.push(title);
    }
  }
  return [...byKey.values()];
}

async function resolveByTitleSearch(
  query: TitleQuery,
  settings: Settings,
): Promise<ResolutionResult | null> {
  const { mediaType } = query;
  if (mediaType) validateMediaType(mediaType);
  // Netflix, Prime Video and context-menu lookups can't tell a movie from a
  // series; /search/multi covers both (it takes no `year`, ranking uses it).
  const endpoint = mediaType ? `/search/${mediaType}` : '/search/multi';
  const baseParams: Record<string, string> = { query: query.title };
  if (query.year && mediaType) baseParams.year = String(query.year);

  const results = await fetchBilingualResults(endpoint, baseParams, settings, mediaType);
  dbg(
    'tmdb',
    `search "${query.title}" year:${query.year} → ${results.length} results`,
    results.map(
      (r: any) =>
        `${r.title || r.name} (${r.release_date || r.first_air_date}) id:${r.id} pop:${r.popularity}`,
    ),
  );
  if (results.length === 0) return null;

  const ranked = rankByTitleMatch(results, query.title, query.year, {
    getTitle: (r) => r.title || r.name || '',
    getAltTitle: (r) => r.original_title || r.original_name || '',
    getOtherTitles: (r) => r.other_titles,
    getYear: (r) => parseYear(r.release_date || r.first_air_date),
  }).sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.yearMatch !== b.yearMatch) return a.yearMatch ? -1 : 1;
    return (b.item.popularity || 0) - (a.item.popularity || 0);
  });

  const best = ranked[0]!;
  dbg(
    'tmdb',
    `best: "${best.item.title || best.item.name}" score:${best.score} yearMatch:${best.yearMatch}`,
  );
  // The `year` search param already filters by year, so a year match says
  // nothing about the title. With no title match, trust TMDB only when it
  // returned a single hit (it also searches translations we don't receive).
  if (best.score === 0 && results.length > 1) return null;

  const chosen = best.item;
  let imdbId: string | undefined;
  try {
    const extIds = await tmdbFetch(`/${chosen.media_type}/${chosen.id}/external_ids`, {}, settings);
    imdbId = extIds.imdb_id || undefined;
  } catch {
    // non-critical
  }

  const alternatives: TitleCandidate[] = ranked.slice(1, 1 + MAX_ALTERNATIVES).map((r) => ({
    tmdbId: r.item.id,
    mediaType: r.item.media_type,
    title: r.item.title || r.item.name,
    originalTitle: r.item.original_title || r.item.original_name || undefined,
    year: parseYear(r.item.release_date || r.item.first_air_date),
    posterPath: r.item.poster_path || undefined,
  }));

  return {
    resolved: {
      tmdbId: chosen.id,
      imdbId,
      mediaType: chosen.media_type,
      title: chosen.title || chosen.name,
      localizedTitle: originalTitleOf(chosen),
      year: parseYear(chosen.release_date || chosen.first_air_date),
      posterPath: chosen.poster_path || undefined,
    },
    alternatives,
  };
}

export async function resolveTitle(
  query: TitleQuery,
  settings: Settings,
): Promise<ResolutionResult | null> {
  if (query.ids.tmdb) return resolveByTmdbId(query, settings);
  if (query.ids.imdb) return resolveByImdbId(query, settings);
  return resolveByTitleSearch(query, settings);
}

function detectCountry(): string {
  const lang = navigator.language || 'en-US';
  const parts = lang.split('-');
  return (parts[1] || parts[0] || 'US').toUpperCase();
}

export async function fetchWatchProviders(
  resolved: ResolvedTitle,
  settings: Settings,
): Promise<WatchProviderData | undefined> {
  try {
    const endpoint =
      resolved.mediaType === 'tv'
        ? `/tv/${resolved.tmdbId}/watch/providers`
        : `/movie/${resolved.tmdbId}/watch/providers`;
    const data = await tmdbFetch(endpoint, {}, settings);
    const country = detectCountry();
    const countryData = data.results?.[country] || data.results?.US;
    if (!countryData) return undefined;
    const hasProviders =
      countryData.flatrate?.length || countryData.rent?.length || countryData.buy?.length;
    if (!hasProviders) return undefined;
    return {
      link: countryData.link,
      flatrate: countryData.flatrate,
      rent: countryData.rent,
      buy: countryData.buy,
      country: data.results?.[country] ? country : 'US',
    };
  } catch {
    return undefined;
  }
}

export function parseTmdbDetail(data: any): RatingResult {
  if (typeof data.vote_average === 'number' && typeof data.vote_count === 'number') {
    return {
      status: 'ok',
      rating: {
        source: 'tmdb',
        value: Math.round(data.vote_average * 10) / 10,
        scale: 10,
        count: data.vote_count,
      },
    };
  }
  return { status: 'unavailable', source: 'tmdb', reasonKey: 'err_not_found' };
}

export const tmdbProvider: RatingProvider = {
  id: 'tmdb',
  produces: ['tmdb'],

  isConfigured(settings: Settings): boolean {
    return !!apiKey(settings);
  },

  async fetchRatings(resolved: ResolvedTitle, settings: Settings): Promise<RatingResult[]> {
    const endpoint =
      resolved.mediaType === 'tv' ? `/tv/${resolved.tmdbId}` : `/movie/${resolved.tmdbId}`;
    const data = await tmdbFetch(endpoint, { language: 'en-US' }, settings);
    const result = parseTmdbDetail(data);
    if (result.status === 'ok' && result.rating) {
      result.rating.url = `https://www.themoviedb.org/${resolved.mediaType}/${resolved.tmdbId}`;
    }
    return [result];
  },
};
