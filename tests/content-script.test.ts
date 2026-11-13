import { describe, expect, it } from 'vitest';
import contentScript from '../entrypoints/detect.content';

const patterns = contentScript.matches as string[];

/** Minimal match-pattern check for the `*://host/path*` patterns this extension uses. */
function isMatched(url: string): boolean {
  return patterns.some((pattern) => {
    const [, host, path] = pattern.match(/^\*:\/\/([^/]+)(\/.*)$/)!;
    const hostRe = host!.replace(/\./g, '\\.').replace(/^\*\\\./, '(?:[^/]+\\.)?');
    const pathRe = path!.replace(/[.?+]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^https?://${hostRe}${pathRe}$`).test(url);
  });
}

describe('content script injection', () => {
  // Content scripts are only injected on document load, never on pushState, so
  // SPA sites must be covered from any entry page for in-app navigation to work.
  it.each([
    'https://www.netflix.com/browse',
    'https://www.primevideo.com/storefront',
    'https://www.disneyplus.com/home',
    'https://www.imdb.com/',
    'https://www.themoviedb.org/',
    'https://letterboxd.com/films/',
    'https://www.senscritique.com/',
    'https://www.allocine.fr/',
  ])('is injected on %s', (url) => {
    expect(isMatched(url)).toBe(true);
  });

  it('is not injected on unrelated sites', () => {
    expect(isMatched('https://example.com/title/1')).toBe(false);
  });
});
