import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseAllocineHtml,
  parseSearchPageEntities,
  pickBestAutocompleteMatch,
  type AutocompleteResult,
} from '../providers/allocine';

const fixture = readFileSync(resolve(__dirname, 'fixtures/allocine-page.html'), 'utf-8');

describe('parseAllocineHtml', () => {
  it('extracts presse and spectateurs from DOM rating-item blocks', () => {
    const result = parseAllocineHtml(
      fixture,
      'https://www.allocine.fr/film/fichefilm_gen_cfilm=255238.html',
    );
    expect(result).not.toBeNull();
    expect(result?.presse).toBeDefined();
    expect(result?.presse?.value).toBe(4.8);
    expect(result?.presse?.count).toBe(36);
    expect(result?.spectateurs).toBeDefined();
    expect(result?.spectateurs?.value).toBe(4.5);
    expect(result?.spectateurs?.count).toBe(34041);
    expect(result?.url).toBe('https://www.allocine.fr/film/fichefilm_gen_cfilm=255238.html');
  });

  it('returns null for HTML without ratings', () => {
    const result = parseAllocineHtml('<html><body></body></html>', 'https://example.com');
    expect(result).toBeNull();
  });

  it('skips "--" (no-rating) entries', () => {
    const html = `
      <div class="rating-item">
        <div class="rating-item-content">Presse
          <span class="stareval-note no-rating">--</span>
        </div>
      </div>
    `;
    const result = parseAllocineHtml(html, 'https://example.com');
    expect(result).toBeNull();
  });

  it('handles French comma decimal format', () => {
    const html = `
      <div class="rating-item">
        <div class="rating-item-content">Spectateurs
          <span class="stareval-note">3,2</span>
          <span class="stareval-review light"> 500 notes</span>
        </div>
      </div>
    `;
    const result = parseAllocineHtml(html, 'https://example.com');
    expect(result).not.toBeNull();
    expect(result?.spectateurs?.value).toBe(3.2);
    expect(result?.spectateurs?.count).toBe(500);
  });
});

describe('pickBestAutocompleteMatch', () => {
  const unrelatedResults: AutocompleteResult[] = [
    { entity_type: 'movie', entity_id: '255238', label: 'Parasite', original_label: 'Gisaengchung', data: { year: '2019' } },
    { entity_type: 'movie', entity_id: '258374', label: 'Joker', original_label: 'Joker', data: { year: '2019' } },
  ];

  it('returns null when no result matches the title', () => {
    const result = pickBestAutocompleteMatch(unrelatedResults, 'Juste ciel !', 'movie', 2023);
    expect(result).toBeNull();
  });

  it('returns null for year-only match with no title similarity', () => {
    const sameYearResults: AutocompleteResult[] = [
      { entity_type: 'movie', entity_id: '290065', label: 'Pauvres Créatures', original_label: 'Poor Things', data: { year: '2023' } },
    ];
    const result = pickBestAutocompleteMatch(sameYearResults, 'Juste ciel !', 'movie', 2023);
    expect(result).toBeNull();
  });

  it('returns null for empty results', () => {
    expect(pickBestAutocompleteMatch([], 'Test', 'movie')).toBeNull();
  });

  it('returns null when entity_type does not match', () => {
    const result = pickBestAutocompleteMatch(unrelatedResults, 'Parasite', 'series');
    expect(result).toBeNull();
  });

  it('picks exact title match', () => {
    const results: AutocompleteResult[] = [
      { entity_type: 'movie', entity_id: '288851', label: 'Juste ciel !', data: { year: '2023' } },
      ...unrelatedResults,
    ];
    const result = pickBestAutocompleteMatch(results, 'Juste ciel !', 'movie', 2023);
    expect(result).not.toBeNull();
    expect(result!.entity_id).toBe('288851');
  });

  it('picks by year when title matches multiple', () => {
    const results: AutocompleteResult[] = [
      { entity_type: 'movie', entity_id: '100', label: 'Inception', data: { year: '2020' } },
      { entity_type: 'movie', entity_id: '200', label: 'Inception', data: { year: '2010' } },
    ];
    const result = pickBestAutocompleteMatch(results, 'Inception', 'movie', 2010);
    expect(result!.entity_id).toBe('200');
  });

  it('accepts year-only match when title partially matches', () => {
    const results: AutocompleteResult[] = [
      { entity_type: 'movie', entity_id: '300', label: 'Juste ciel ! Extended', data: { year: '2023' } },
    ];
    const result = pickBestAutocompleteMatch(results, 'Juste ciel !', 'movie', 2023);
    expect(result).not.toBeNull();
  });
});

describe('parseSearchPageEntities', () => {
  function makeHtml(entities: Record<string, unknown>): string {
    return `<script>var jsEntities = ${JSON.stringify(entities)}; var foo;</script>`;
  }

  it('finds movie by title match', () => {
    const key = btoa('Movie:288851');
    const html = makeHtml({ [key]: { title: 'Juste ciel !' } });
    expect(parseSearchPageEntities(html, 'Juste ciel !', 'movie')).toBe('288851');
  });

  it('returns null for title mismatch', () => {
    const key = btoa('Movie:100');
    const html = makeHtml({ [key]: { title: 'Parasite' } });
    expect(parseSearchPageEntities(html, 'Juste ciel !', 'movie')).toBeNull();
  });

  it('filters by media type prefix', () => {
    const key = btoa('TVSeries:999');
    const html = makeHtml({ [key]: { title: 'Juste ciel !' } });
    expect(parseSearchPageEntities(html, 'Juste ciel !', 'movie')).toBeNull();
    expect(parseSearchPageEntities(html, 'Juste ciel !', 'tv')).toBe('999');
  });

  it('returns null for missing jsEntities', () => {
    expect(parseSearchPageEntities('<html></html>', 'Test', 'movie')).toBeNull();
  });
});
