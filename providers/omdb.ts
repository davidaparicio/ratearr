import type { RatingProvider } from './types';
import type { ResolvedTitle, RatingResult, SourceId } from '../utils/types';
import type { Settings } from '../utils/settings';

const OMDB_BASE = 'https://www.omdbapi.com/';

interface OmdbRating {
  Source: string;
  Value: string;
}

interface OmdbResponse {
  Response: string;
  imdbRating?: string;
  imdbVotes?: string;
  imdbID?: string;
  Ratings?: OmdbRating[];
  Error?: string;
}

export function parseOmdbResponse(data: OmdbResponse, imdbId?: string): RatingResult[] {
  const results: RatingResult[] = [];

  if (data.Response === 'False') {
    return [
      { status: 'unavailable', source: 'imdb', reasonKey: 'err_not_found' },
      { status: 'unavailable', source: 'rottentomatoes', reasonKey: 'err_not_found' },
      { status: 'unavailable', source: 'metacritic', reasonKey: 'err_not_found' },
    ];
  }

  // IMDb rating
  if (data.imdbRating && data.imdbRating !== 'N/A') {
    const value = parseFloat(data.imdbRating);
    if (!isNaN(value)) {
      results.push({
        status: 'ok',
        rating: {
          source: 'imdb',
          value,
          scale: 10,
          count: parseVoteCount(data.imdbVotes),
          url: imdbId ? `https://www.imdb.com/title/${imdbId}/` : undefined,
        },
      });
    }
  }
  if (!results.some((r) => r.status === 'ok' && 'rating' in r && r.rating.source === 'imdb')) {
    results.push({ status: 'unavailable', source: 'imdb', reasonKey: 'err_not_found' });
  }

  // Rotten Tomatoes from Ratings array
  const rtEntry = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes');
  if (rtEntry) {
    const match = rtEntry.Value.match(/^(\d+)%$/);
    if (match) {
      results.push({
        status: 'ok',
        rating: {
          source: 'rottentomatoes',
          value: parseInt(match[1], 10),
          scale: 100,
        },
      });
    }
  }
  if (!results.some((r) => r.status === 'ok' && 'rating' in r && r.rating.source === 'rottentomatoes')) {
    results.push({ status: 'unavailable', source: 'rottentomatoes', reasonKey: 'err_not_found' });
  }

  // Metacritic from Ratings array
  const mcEntry = data.Ratings?.find((r) => r.Source === 'Metacritic');
  if (mcEntry) {
    const match = mcEntry.Value.match(/^(\d+)\/100$/);
    if (match) {
      results.push({
        status: 'ok',
        rating: {
          source: 'metacritic',
          value: parseInt(match[1], 10),
          scale: 100,
        },
      });
    }
  }
  if (!results.some((r) => r.status === 'ok' && 'rating' in r && r.rating.source === 'metacritic')) {
    results.push({ status: 'unavailable', source: 'metacritic', reasonKey: 'err_not_found' });
  }

  return results;
}

function parseVoteCount(votes?: string): number | undefined {
  if (!votes || votes === 'N/A') return undefined;
  const cleaned = votes.replace(/,/g, '');
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? undefined : n;
}

export const omdbProvider: RatingProvider = {
  id: 'omdb',
  produces: ['imdb', 'rottentomatoes', 'metacritic'],

  isConfigured(settings: Settings): boolean {
    return !!settings.omdbApiKey;
  },

  async fetchRatings(resolved: ResolvedTitle, settings: Settings): Promise<RatingResult[]> {
    if (!resolved.imdbId) {
      return this.produces.map((source: SourceId) => ({
        status: 'unavailable' as const,
        source,
        reasonKey: 'err_not_found',
      }));
    }

    const url = new URL(OMDB_BASE);
    url.searchParams.set('i', resolved.imdbId);
    url.searchParams.set('apikey', settings.omdbApiKey);

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`omdb_http_${resp.status}`);
    const data: OmdbResponse = await resp.json();

    return parseOmdbResponse(data, resolved.imdbId);
  },
};
