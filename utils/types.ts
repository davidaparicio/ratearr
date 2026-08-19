export type MediaType = 'movie' | 'tv';

export type SourceId =
  | 'tmdb'
  | 'imdb'
  | 'rottentomatoes'
  | 'metacritic'
  | 'allocine-presse'
  | 'allocine-spectateurs'
  | 'senscritique';

export type ProviderId = 'tmdb' | 'omdb' | 'allocine' | 'senscritique';

export interface RatingSourceMeta {
  id: SourceId;
  labelKey: string;
  scale: number;
  providerId: ProviderId;
}

export interface Rating {
  source: SourceId;
  value: number;
  scale: number;
  count?: number;
  url?: string;
}

export type RatingResult =
  | { status: 'ok'; rating: Rating }
  | { status: 'unavailable'; source: SourceId; reasonKey: string };

export interface TitleQuery {
  title: string;
  originalTitle?: string;
  year?: number;
  mediaType?: MediaType;
  ids: { imdb?: string; tmdb?: number; allocine?: string };
  sourceSite: string;
}

export interface ResolvedTitle {
  tmdbId: number;
  imdbId?: string;
  mediaType: MediaType;
  title: string;
  localizedTitle?: string;
  year?: number;
  posterPath?: string;
}

export interface TitleCandidate {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  year?: number;
  posterPath?: string;
}

export interface RatingsPanelData {
  resolved: ResolvedTitle;
  results: RatingResult[];
  aggregate?: { value: number; scale: 10; sourcesUsed: number };
  alternatives?: TitleCandidate[];
  fetchedAt: number;
  fromCache: boolean;
}

export interface CacheEntry {
  v: 1;
  fetchedAt: number;
  data: RatingsPanelData;
}
