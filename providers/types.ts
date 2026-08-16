import type { ResolvedTitle, RatingResult, SourceId } from '../utils/types';
import type { Settings } from '../utils/settings';

export interface RatingProvider {
  id: 'tmdb' | 'omdb' | 'allocine';
  produces: SourceId[];
  isConfigured(settings: Settings): boolean;
  fetchRatings(resolved: ResolvedTitle, settings: Settings): Promise<RatingResult[]>;
}
