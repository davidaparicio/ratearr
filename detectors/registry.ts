import { allocineDetector } from './allocine';
import { disneyPlusDetector } from './disneyplus';
import { imdbDetector } from './imdb';
import { letterboxdDetector } from './letterboxd';
import { netflixDetector } from './netflix';
import { primeVideoDetector } from './primevideo';
import { senscritiqueDetector } from './senscritique';
import { tmdbSiteDetector } from './tmdb-site';
import { wikipediaDetector } from './wikipedia';
import type { SiteDetector } from './types';

const ALL_DETECTORS: SiteDetector[] = [
  imdbDetector,
  tmdbSiteDetector,
  allocineDetector,
  netflixDetector,
  primeVideoDetector,
  disneyPlusDetector,
  letterboxdDetector,
  senscritiqueDetector,
  wikipediaDetector,
];

export function getDetector(hostname: string): SiteDetector | undefined {
  return ALL_DETECTORS.find((d) => d.hosts.includes(hostname));
}
