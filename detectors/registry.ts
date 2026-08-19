import { allocineDetector } from './allocine';
import { disneyPlusDetector } from './disneyplus';
import { imdbDetector } from './imdb';
import { netflixDetector } from './netflix';
import { primeVideoDetector } from './primevideo';
import { tmdbSiteDetector } from './tmdb-site';
import type { SiteDetector } from './types';

const ALL_DETECTORS: SiteDetector[] = [
  imdbDetector,
  tmdbSiteDetector,
  allocineDetector,
  netflixDetector,
  primeVideoDetector,
  disneyPlusDetector,
];

export function getDetector(hostname: string): SiteDetector | undefined {
  return ALL_DETECTORS.find((d) => d.hosts.includes(hostname));
}
