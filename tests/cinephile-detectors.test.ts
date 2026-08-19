import { describe, expect, it } from 'vitest';
import { letterboxdDetector } from '../detectors/letterboxd';
import { senscritiqueDetector } from '../detectors/senscritique';
import { wikipediaDetector } from '../detectors/wikipedia';
import { getDetector } from '../detectors/registry';

describe('letterboxdDetector', () => {
  it('matches /film/ URLs', () => {
    expect(letterboxdDetector.matches(new URL('https://letterboxd.com/film/inception/'))).toBe(
      true,
    );
  });

  it('does not match user pages', () => {
    expect(letterboxdDetector.matches(new URL('https://letterboxd.com/user/films/'))).toBe(false);
  });

  it('is found by registry', () => {
    expect(getDetector('letterboxd.com')).toBe(letterboxdDetector);
  });
});

describe('senscritiqueDetector', () => {
  it('matches /film/ URLs', () => {
    expect(
      senscritiqueDetector.matches(
        new URL('https://www.senscritique.com/film/inception/123456'),
      ),
    ).toBe(true);
  });

  it('matches /serie/ URLs', () => {
    expect(
      senscritiqueDetector.matches(
        new URL('https://www.senscritique.com/serie/breaking_bad/789'),
      ),
    ).toBe(true);
  });

  it('does not match home', () => {
    expect(senscritiqueDetector.matches(new URL('https://www.senscritique.com/'))).toBe(false);
  });

  it('is found by registry', () => {
    expect(getDetector('www.senscritique.com')).toBe(senscritiqueDetector);
  });
});

describe('wikipediaDetector', () => {
  it('matches /wiki/ URLs', () => {
    expect(
      wikipediaDetector.matches(new URL('https://en.wikipedia.org/wiki/Inception_(film)')),
    ).toBe(true);
  });

  it('matches French Wikipedia', () => {
    expect(
      wikipediaDetector.matches(new URL('https://fr.wikipedia.org/wiki/Inception_(film)')),
    ).toBe(true);
  });

  it('does not match non-wiki paths', () => {
    expect(
      wikipediaDetector.matches(new URL('https://en.wikipedia.org/w/index.php?title=Test')),
    ).toBe(false);
  });

  it('is found by registry for en', () => {
    expect(getDetector('en.wikipedia.org')).toBe(wikipediaDetector);
  });

  it('is found by registry for fr', () => {
    expect(getDetector('fr.wikipedia.org')).toBe(wikipediaDetector);
  });
});
