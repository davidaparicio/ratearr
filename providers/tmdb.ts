import type { RatingProvider } from './types';
import type { TitleQuery, ResolvedTitle, RatingResult } from '../utils/types';
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

export async function resolveTitle(query: TitleQuery, settings: Settings): Promise<ResolvedTitle | null> {
  if (query.ids.tmdb) {
    const mediaType = query.mediaType ?? 'movie';
    const data = await tmdbFetch(`/${mediaType}/${query.ids.tmdb}`, { language: 'en-US' }, settings);
    const extIds = await tmdbFetch(`/${mediaType}/${query.ids.tmdb}/external_ids`, {}, settings);
    return {
      tmdbId: query.ids.tmdb,
      imdbId: extIds.imdb_id || undefined,
      mediaType,
      title: data.title || data.name || query.title,
      localizedTitle: data.original_title !== data.title ? data.original_title : undefined,
      year: parseYear(data.release_date || data.first_air_date),
      posterPath: data.poster_path || undefined,
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
      tmdbId: result.id,
      imdbId: query.ids.imdb,
      mediaType,
      title: result.title || result.name,
      localizedTitle: result.original_title !== result.title ? result.original_title : undefined,
      year: parseYear(result.release_date || result.first_air_date),
      posterPath: result.poster_path || undefined,
    };
  }

  const mediaType = query.mediaType ?? 'movie';
  const endpoint = mediaType === 'tv' ? '/search/tv' : '/search/movie';
  const params: Record<string, string> = { query: query.title, language: 'en-US' };
  if (query.year) params.year = String(query.year);

  const data = await tmdbFetch(endpoint, params, settings);
  const results = data.results as any[];
  if (!results || results.length === 0) return null;

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

  return {
    tmdbId: chosen.id,
    imdbId,
    mediaType,
    title: chosen.title || chosen.name,
    localizedTitle: chosen.original_title !== chosen.title ? chosen.original_title : undefined,
    year: parseYear(chosen.release_date || chosen.first_air_date),
    posterPath: chosen.poster_path || undefined,
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
