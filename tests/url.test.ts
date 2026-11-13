import { describe, expect, it } from 'vitest';
import { httpsUrl } from '../utils/url';

describe('httpsUrl', () => {
  it('accepts https URLs', () => {
    expect(httpsUrl('https://www.themoviedb.org/movie/27205/watch')).toBe(
      'https://www.themoviedb.org/movie/27205/watch',
    );
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'http://example.com/', 'not a url', ''])(
    'rejects %j',
    (raw) => {
      expect(httpsUrl(raw)).toBeUndefined();
    },
  );

  it('resolves a path against a base and keeps it on that host', () => {
    const base = 'https://www.senscritique.com';
    expect(httpsUrl('/film/le_parrain/408443', base)).toBe(
      'https://www.senscritique.com/film/le_parrain/408443',
    );
    // naive concatenation would turn this into https://www.senscritique.com@evil.example/
    expect(httpsUrl('@evil.example/', base)).toBe('https://www.senscritique.com/@evil.example/');
    expect(httpsUrl('//evil.example/x', base)).toBeUndefined();
  });
});
