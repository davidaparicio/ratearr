import type { RatingProvider } from './types';
import type { ResolvedTitle, RatingResult, Rating, SourceId } from '../utils/types';
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

interface SourceExtractor {
  source: SourceId;
  extract: (data: OmdbResponse) => { value: number; scale: number; count?: number } | null;
}

const SOURCE_EXTRACTORS: SourceExtractor[] = [
  {
    source: 'imdb',
    extract: (data) => {
      if (!data.imdbRating || data.imdbRating === 'N/A') return null;
      const value = parseFloat(data.imdbRating);
      if (isNaN(value)) return null;
      return { value, scale: 10, count: parseVoteCount(data.imdbVotes) };
    },
  },
  {
    source: 'rottentomatoes',
    extract: (data) => {
      const entry = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes');
      if (!entry) return null;
      const match = entry.Value.match(/^(\d+)%$/);
      return match ? { value: parseInt(match[1], 10), scale: 100 } : null;
    },
  },
  {
    source: 'metacritic',
    extract: (data) => {
      const entry = data.Ratings?.find((r) => r.Source === 'Metacritic');
      if (!entry) return null;
      const match = entry.Value.match(/^(\d+)\/100$/);
      return match ? { value: parseInt(match[1], 10), scale: 100 } : null;
    },
  },
];

export function parseOmdbResponse(data: OmdbResponse, imdbId?: string): RatingResult[] {
  if (data.Response === 'False') {
    return SOURCE_EXTRACTORS.map(({ source }) => ({
      status: 'unavailable' as const, source, reasonKey: 'err_not_found',
    }));
  }

  return SOURCE_EXTRACTORS.map(({ source, extract }) => {
    const parsed = extract(data);
    if (parsed) {
      const rating: Rating = { source, ...parsed };
      if (source === 'imdb' && imdbId) rating.url = `https://www.imdb.com/title/${imdbId}/`;
      return { status: 'ok' as const, rating };
    }
    return { status: 'unavailable' as const, source, reasonKey: 'err_not_found' };
  });
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

    if (typeof data.Response !== 'string') {
      return this.produces.map((source: SourceId) => ({
        status: 'unavailable' as const,
        source,
        reasonKey: 'err_parse',
      }));
    }

    return parseOmdbResponse(data, resolved.imdbId);
  },
};
