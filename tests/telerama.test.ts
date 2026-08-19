import { describe, expect, it } from 'vitest';
import { parseCriticRating, parseSubscriberRating } from '../providers/telerama';

describe('parseCriticRating', () => {
  it('extracts rating from JSON-LD with data-tag="content"', () => {
    const html = `<script type="application/ld+json" data-tag="content">
      {"@type":"Movie","review":{"reviewRating":{"@type":"Rating","worstRating":1,"ratingValue":2,"bestRating":5}}}
    </script>`;
    expect(parseCriticRating(html, 'https://example.com')).toBe(2);
  });

  it('extracts rating wrapped in CDATA', () => {
    const html = `<script type="application/ld+json" data-tag="content">
      /* <![CDATA[ */
      {"@type":"Movie","review":{"reviewRating":{"ratingValue":4,"bestRating":5}}}
      /* ]]> */
    </script>`;
    expect(parseCriticRating(html, 'https://example.com')).toBe(4);
  });

  it('returns null when no JSON-LD with data-tag="content"', () => {
    const html = '<html><body>No structured data</body></html>';
    expect(parseCriticRating(html, 'https://example.com')).toBeNull();
  });

  it('returns null when no reviewRating', () => {
    const html = `<script type="application/ld+json" data-tag="content">
      {"@type":"Movie","name":"Test"}
    </script>`;
    expect(parseCriticRating(html, 'https://example.com')).toBeNull();
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
