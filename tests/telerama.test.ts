import { describe, expect, it } from 'vitest';
import {
  extractFilmHrefs,
  parseCriticRating,
  parseSubscriberRating,
  pickBestFilmHref,
} from '../providers/telerama';

describe('parseCriticRating', () => {
  it('extracts rating from JSON-LD with data-tag="content"', () => {
    const html = `<script type="application/ld+json" data-tag="content">
      {"@type":"Movie","review":{"reviewRating":{"@type":"Rating","worstRating":1,"ratingValue":2,"bestRating":5}}}
    </script>`;
    expect(parseCriticRating(html)).toBe(2);
  });

  it('extracts rating wrapped in CDATA', () => {
    const html = `<script type="application/ld+json" data-tag="content">
      /* <![CDATA[ */
      {"@type":"Movie","review":{"reviewRating":{"ratingValue":4,"bestRating":5}}}
      /* ]]> */
    </script>`;
    expect(parseCriticRating(html)).toBe(4);
  });

  it('returns null when no JSON-LD with data-tag="content"', () => {
    const html = '<html><body>No structured data</body></html>';
    expect(parseCriticRating(html)).toBeNull();
  });

  it('returns null when no reviewRating', () => {
    const html = `<script type="application/ld+json" data-tag="content">
      {"@type":"Movie","name":"Test"}
    </script>`;
    expect(parseCriticRating(html)).toBeNull();
  });
});

describe('parseSubscriberRating', () => {
  it('extracts rating and count from notation classes', () => {
    const html = `
      <span class="notation notation--readers notation--3"></span>
      <span class="comments__globalRatingLabel">Bien</span>
      <span class="comments__globalRatingStats">(14 notes, 3 avis)</span>
    `;
    expect(parseSubscriberRating(html)).toEqual({ value: 3, count: 14 });
  });

  it('extracts rating without stats', () => {
    const html = '<span class="notation notation--readers notation--4"></span>';
    expect(parseSubscriberRating(html)).toEqual({ value: 4, count: undefined });
  });

  it('returns null when no notation--readers', () => {
    const html = '<html><body>No rating</body></html>';
    expect(parseSubscriberRating(html)).toBeNull();
  });
});

describe('extractFilmHrefs', () => {
  it('extracts film hrefs from search HTML', () => {
    const html = `
      <a href="/cinema/films/juste-ciel-2023,123.php">Juste ciel</a>
      <a href="/cinema/films/juste-ciel-2010,456.php">Juste ciel (2010)</a>
    `;
    expect(extractFilmHrefs(html)).toEqual([
      '/cinema/films/juste-ciel-2023,123.php',
      '/cinema/films/juste-ciel-2010,456.php',
    ]);
  });

  it('returns empty for no matches', () => {
    expect(extractFilmHrefs('<html></html>')).toEqual([]);
  });
});

describe('pickBestFilmHref', () => {
  const hrefs = [
    '/cinema/films/juste-ciel-2010,456.php',
    '/cinema/films/juste-ciel-2023,123.php',
  ];

  it('returns first href when no year', () => {
    expect(pickBestFilmHref(hrefs)).toBe(hrefs[0]);
  });

  it('prefers year-matching href', () => {
    expect(pickBestFilmHref(hrefs, 2023)).toBe(hrefs[1]);
  });

  it('accepts ±1 year tolerance', () => {
    expect(pickBestFilmHref(hrefs, 2022)).toBe(hrefs[1]);
  });

  it('falls back to first when no year matches', () => {
    expect(pickBestFilmHref(hrefs, 1999)).toBe(hrefs[0]);
  });

  it('returns null for empty list', () => {
    expect(pickBestFilmHref([], 2023)).toBeNull();
  });
});
