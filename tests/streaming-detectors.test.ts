import { describe, expect, it } from 'vitest';
import { disneyPlusDetector } from '../detectors/disneyplus';
import { netflixDetector } from '../detectors/netflix';
import { primeVideoDetector } from '../detectors/primevideo';
import { getDetector } from '../detectors/registry';

describe('netflixDetector', () => {
  it('matches /title/ URLs', () => {
    expect(netflixDetector.matches(new URL('https://www.netflix.com/title/70131314'))).toBe(true);
  });

  it('does not match browse URLs', () => {
    expect(netflixDetector.matches(new URL('https://www.netflix.com/browse'))).toBe(false);
  });

  it('does not match search URLs', () => {
    expect(netflixDetector.matches(new URL('https://www.netflix.com/search?q=test'))).toBe(false);
  });

  it('is found by registry', () => {
    expect(getDetector('www.netflix.com')).toBe(netflixDetector);
  });
});

describe('primeVideoDetector', () => {
  it('matches /detail/ URLs', () => {
    expect(
      primeVideoDetector.matches(new URL('https://www.primevideo.com/detail/Inception/B00AQNLHEG')),
    ).toBe(true);
  });

  it('does not match home URL', () => {
    expect(primeVideoDetector.matches(new URL('https://www.primevideo.com/'))).toBe(false);
  });

  it('is found by registry', () => {
    expect(getDetector('www.primevideo.com')).toBe(primeVideoDetector);
  });
});

describe('disneyPlusDetector', () => {
  it('matches /movies/ URLs', () => {
    expect(
      disneyPlusDetector.matches(new URL('https://www.disneyplus.com/movies/frozen/abc123')),
    ).toBe(true);
  });

  it('matches /series/ URLs', () => {
    expect(
      disneyPlusDetector.matches(
        new URL('https://www.disneyplus.com/series/the-mandalorian/xyz789'),
      ),
    ).toBe(true);
  });

  it('does not match home URL', () => {
    expect(disneyPlusDetector.matches(new URL('https://www.disneyplus.com/'))).toBe(false);
  });

  it('does not match browse URLs', () => {
    expect(disneyPlusDetector.matches(new URL('https://www.disneyplus.com/browse'))).toBe(false);
  });

  it('is found by registry', () => {
    expect(getDetector('www.disneyplus.com')).toBe(disneyPlusDetector);
  });
});
