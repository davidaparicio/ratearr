import { allocineDetector } from './allocine';
import { imdbDetector } from './imdb';
import { tmdbSiteDetector } from './tmdb-site';
import type { SiteDetector } from './types';

const ALL_DETECTORS: SiteDetector[] = [imdbDetector, tmdbSiteDetector, allocineDetector];

export function getDetector(hostname: string): SiteDetector | undefined {
  return ALL_DETECTORS.find((d) => d.hosts.includes(hostname));
}
