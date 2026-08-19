import type { Settings } from '../utils/settings';
import type { RatingResult, ResolvedTitle, SourceId } from '../utils/types';

export interface RatingProvider {
  id: 'tmdb' | 'omdb' | 'allocine' | 'senscritique' | 'letterboxd';
  produces: SourceId[];
  isConfigured(settings: Settings): boolean;
  fetchRatings(resolved: ResolvedTitle, settings: Settings): Promise<RatingResult[]>;
}
