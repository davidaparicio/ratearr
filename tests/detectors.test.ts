import { describe, expect, it } from 'vitest';
import { getDetector } from '../detectors/registry';
import { imdbDetector } from '../detectors/imdb';
import { tmdbSiteDetector } from '../detectors/tmdb-site';
import { allocineDetector } from '../detectors/allocine';

describe('getDetector', () => {
  it('returns IMDb detector for www.imdb.com', () => {
    expect(getDetector('www.imdb.com')).toBe(imdbDetector);
  });

  it('returns IMDb detector for m.imdb.com', () => {
    expect(getDetector('m.imdb.com')).toBe(imdbDetector);
  });

  it('returns TMDB detector for www.themoviedb.org', () => {
    expect(getDetector('www.themoviedb.org')).toBe(tmdbSiteDetector);
  });

  it('returns Allociné detector for www.allocine.fr', () => {
    expect(getDetector('www.allocine.fr')).toBe(allocineDetector);
  });

  it('returns undefined for unknown hostname', () => {
    expect(getDetector('example.com')).toBeUndefined();
  });

  it('returns undefined for partial match', () => {
    expect(getDetector('imdb.com.evil.com')).toBeUndefined();
  });
});

describe('imdbDetector.matches', () => {
  it('matches a title page URL', () => {
    expect(imdbDetector.matches(new URL('https://www.imdb.com/title/tt1375666/'))).toBe(true);
  });

  it('matches a title page with extra path segments', () => {
    expect(imdbDetector.matches(new URL('https://www.imdb.com/title/tt1375666/reviews'))).toBe(true);
  });

  it('does not match the homepage', () => {
    expect(imdbDetector.matches(new URL('https://www.imdb.com/'))).toBe(false);
  });

  it('does not match a search page', () => {
    expect(imdbDetector.matches(new URL('https://www.imdb.com/find?q=inception'))).toBe(false);
  });

  it('does not match a name page', () => {
    expect(imdbDetector.matches(new URL('https://www.imdb.com/name/nm0634240/'))).toBe(false);
  });
});

describe('tmdbSiteDetector.matches', () => {
  it('matches a movie page', () => {
    expect(tmdbSiteDetector.matches(new URL('https://www.themoviedb.org/movie/27205-inception'))).toBe(true);
  });

  it('matches a TV page', () => {
    expect(tmdbSiteDetector.matches(new URL('https://www.themoviedb.org/tv/1396-breaking-bad'))).toBe(true);
  });

  it('matches a movie page with numeric-only path', () => {
    expect(tmdbSiteDetector.matches(new URL('https://www.themoviedb.org/movie/27205'))).toBe(true);
  });

  it('does not match the homepage', () => {
    expect(tmdbSiteDetector.matches(new URL('https://www.themoviedb.org/'))).toBe(false);
  });

  it('does not match a person page', () => {
    expect(tmdbSiteDetector.matches(new URL('https://www.themoviedb.org/person/6193'))).toBe(false);
  });
});

describe('allocineDetector.matches', () => {
  it('matches a film page', () => {
    expect(allocineDetector.matches(new URL('https://www.allocine.fr/film/fichefilm_gen_cfilm=143692.html'))).toBe(true);
  });

  it('matches a series page', () => {
    expect(allocineDetector.matches(new URL('https://www.allocine.fr/series/ficheserie_gen_cserie=7882.html'))).toBe(true);
  });

  it('matches a film slug path', () => {
    expect(allocineDetector.matches(new URL('https://www.allocine.fr/film/fichefilm-143692/casting/'))).toBe(true);
  });

  it('does not match the homepage', () => {
    expect(allocineDetector.matches(new URL('https://www.allocine.fr/'))).toBe(false);
  });

  it('does not match a news page', () => {
    expect(allocineDetector.matches(new URL('https://www.allocine.fr/article/fichearticle_gen_carticle=123.html'))).toBe(false);
  });
});
