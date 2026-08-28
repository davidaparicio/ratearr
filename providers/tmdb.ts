import { dbg } from '../utils/debug';
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
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`tmdb_http_${resp.status}`);
  return resp.json();
}

export interface ResolutionResult {
  resolved: ResolvedTitle;
  alternatives: TitleCandidate[];
}

function parseYear(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const match = dateStr.match(/^(\d{4})/);
  return match ? parseInt(match[1]!, 10) : undefined;
}

async function resolveByTmdbId(query: TitleQuery, settings: Settings): Promise<ResolutionResult> {
  const mediaType = query.mediaType ?? 'movie';
  validateMediaType(mediaType);
  const data = await tmdbFetch(`/${mediaType}/${query.ids.tmdb}`, { language: 'en-US' }, settings);
  const extIds = await tmdbFetch(`/${mediaType}/${query.ids.tmdb}/external_ids`, {}, settings);
  return {
    resolved: {
      tmdbId: query.ids.tmdb!,
      imdbId: extIds.imdb_id || undefined,
      mediaType,
      title: data.title || data.name || query.title,
      localizedTitle: data.original_title !== data.title ? data.original_title : undefined,
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
      localizedTitle: result.original_title !== result.title ? result.original_title : undefined,
      year: parseYear(result.release_date || result.first_air_date),
      posterPath: result.poster_path || undefined,
    },
    alternatives: [],
  };
}

async function fetchBilingualResults(
  endpoint: string,
  baseParams: Record<string, string>,
  settings: Settings,
): Promise<any[]> {
  const [dataEn, dataFr] = await Promise.all([
    tmdbFetch(endpoint, { ...baseParams, language: 'en-US' }, settings),
    tmdbFetch(endpoint, { ...baseParams, language: 'fr-FR' }, settings),
  ]);

  const seenIds = new Set<number>();
  const results: any[] = [];
  const enResults = Array.isArray(dataEn.results) ? dataEn.results : [];
  const frResults = Array.isArray(dataFr.results) ? dataFr.results : [];
  for (const r of [...enResults, ...frResults]) {
    if (!seenIds.has(r.id)) {
      seenIds.add(r.id);
      results.push(r);
    }
  }
  return results;
}

async function resolveByTitleSearch(
  query: TitleQuery,
  settings: Settings,
): Promise<ResolutionResult | null> {
  const mediaType = query.mediaType ?? 'movie';
  validateMediaType(mediaType);
  const endpoint = mediaType === 'tv' ? '/search/tv' : '/search/movie';
  const baseParams: Record<string, string> = { query: query.title };
  if (query.year) baseParams.year = String(query.year);

  const results = await fetchBilingualResults(endpoint, baseParams, settings);
  dbg('tmdb', `search "${query.title}" year:${query.year} → ${results.length} results`, results.map((r: any) => `${r.title || r.name} (${r.release_date || r.first_air_date}) id:${r.id} pop:${r.popularity}`));
  if (results.length === 0) return null;

  const ranked = rankByTitleMatch(results, query.title, query.year, {
    getTitle: (r) => r.title || r.name || '',
    getAltTitle: (r) => r.original_title || r.original_name || '',
    getYear: (r) => parseYear(r.release_date || r.first_air_date),
  }).sort((a, b) => {
    if (a.yearMatch !== b.yearMatch) return a.yearMatch ? -1 : 1;
    if (a.score !== b.score) return b.score - a.score;
    return (b.item.popularity || 0) - (a.item.popularity || 0);
  });

  const best = ranked[0]!;
  dbg('tmdb', `best: "${best.item.title || best.item.name}" score:${best.score} yearMatch:${best.yearMatch}`);
  if (best.score === 0 && !best.yearMatch) return null;

  const chosen = best.item;
  let imdbId: string | undefined;
  try {
    const extIds = await tmdbFetch(`/${mediaType}/${chosen.id}/external_ids`, {}, settings);
    imdbId = extIds.imdb_id || undefined;
  } catch {
    // non-critical
  }

  const alternatives: TitleCandidate[] = ranked.slice(1, 4).map((r) => ({
    tmdbId: r.item.id,
    mediaType,
    title: r.item.title || r.item.name,
    originalTitle: r.item.original_title || r.item.original_name || undefined,
    year: parseYear(r.item.release_date || r.item.first_air_date),
    posterPath: r.item.poster_path || undefined,
  }));

  return {
    resolved: {
      tmdbId: chosen.id,
      imdbId,
      mediaType,
      title: chosen.title || chosen.name,
      localizedTitle: chosen.original_title !== chosen.title ? chosen.original_title : undefined,
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
