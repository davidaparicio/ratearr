import type { RatingProvider } from './types';
import type { TitleQuery, ResolvedTitle, RatingResult, TitleCandidate } from '../utils/types';
import type { Settings } from '../utils/settings';
import { normalizeTitle, titleSimilarity } from '../utils/normalize';

const TMDB_BASE = 'https://api.themoviedb.org/3';

function apiKey(settings: Settings): string {
  return settings.tmdbApiKey || import.meta.env.WXT_TMDB_API_KEY || '';
}

async function tmdbFetch(path: string, params: Record<string, string>, settings: Settings): Promise<any> {
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

export async function resolveTitle(query: TitleQuery, settings: Settings): Promise<ResolutionResult | null> {
  if (query.ids.tmdb) {
    const mediaType = query.mediaType ?? 'movie';
    const data = await tmdbFetch(`/${mediaType}/${query.ids.tmdb}`, { language: 'en-US' }, settings);
    const extIds = await tmdbFetch(`/${mediaType}/${query.ids.tmdb}/external_ids`, {}, settings);
    return {
      resolved: {
        tmdbId: query.ids.tmdb,
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

  if (query.ids.imdb) {
    const data = await tmdbFetch('/find/' + query.ids.imdb, { external_source: 'imdb_id' }, settings);
    const movie = data.movie_results?.[0];
    const tv = data.tv_results?.[0];
    const result = movie || tv;
    if (!result) return null;
    const mediaType = movie ? 'movie' as const : 'tv' as const;
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

  const mediaType = query.mediaType ?? 'movie';
  const endpoint = mediaType === 'tv' ? '/search/tv' : '/search/movie';
  const baseParams: Record<string, string> = { query: query.title };
  if (query.year) baseParams.year = String(query.year);

  // Search in both EN and FR to handle French titles (e.g. "L'Agent secret")
  const [dataEn, dataFr] = await Promise.all([
    tmdbFetch(endpoint, { ...baseParams, language: 'en-US' }, settings),
    tmdbFetch(endpoint, { ...baseParams, language: 'fr-FR' }, settings),
  ]);

  // Merge and deduplicate by TMDB id, preferring EN data
  const seenIds = new Set<number>();
  const results: any[] = [];
  for (const r of [...(dataEn.results || []), ...(dataFr.results || [])]) {
    if (!seenIds.has(r.id)) {
      seenIds.add(r.id);
      results.push(r);
    }
  }
  if (results.length === 0) return null;

  const ranked = results
    .map((r: any) => ({
      item: r,
      score: Math.max(
        titleSimilarity(query.title, r.title || r.name || ''),
        titleSimilarity(query.title, r.original_title || r.original_name || ''),
      ),
      yearMatch: query.year ? parseYear(r.release_date || r.first_air_date) === query.year : false,
    }))
    .sort((a, b) => {
      if (a.yearMatch !== b.yearMatch) return a.yearMatch ? -1 : 1;
      if (a.score !== b.score) return b.score - a.score;
      return (b.item.popularity || 0) - (a.item.popularity || 0);
    });

  const best = ranked[0];
  if (best.score === 0 && !best.yearMatch) return null;

  const chosen = best.item;
  let imdbId: string | undefined;
  try {
    const extIds = await tmdbFetch(`/${mediaType}/${chosen.id}/external_ids`, {}, settings);
    imdbId = extIds.imdb_id || undefined;
  } catch {
    // non-critical
  }

  const alternatives: TitleCandidate[] = ranked
    .slice(1, 4)
    .map((r) => ({
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

function parseYear(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const match = dateStr.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : undefined;
}

export function parseTmdbDetail(data: any): RatingResult {
  if (data.vote_average != null && data.vote_count != null) {
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
    const endpoint = resolved.mediaType === 'tv'
      ? `/tv/${resolved.tmdbId}`
      : `/movie/${resolved.tmdbId}`;
    const data = await tmdbFetch(endpoint, { language: 'en-US' }, settings);
    const result = parseTmdbDetail(data);
    if (result.status === 'ok' && result.rating) {
      result.rating.url = `https://www.themoviedb.org/${resolved.mediaType}/${resolved.tmdbId}`;
    }
    return [result];
  },
};
