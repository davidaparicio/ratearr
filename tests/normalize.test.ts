import { describe, expect, it } from 'vitest';
import { normalizeTitle, rankByTitleMatch, titleSimilarity } from '../utils/normalize';

describe('normalizeTitle', () => {
  it('strips diacritics', () => {
    expect(normalizeTitle('Léon')).toBe('leon');
  });

  it('removes leading articles (EN)', () => {
    expect(normalizeTitle('The Matrix')).toBe('matrix');
  });

  it('removes leading articles (FR)', () => {
    expect(normalizeTitle("L'Arnaqueur")).toBe('arnaqueur');
  });

  it('removes a leading elision written with a typographic apostrophe', () => {
    expect(normalizeTitle('L\u2019Odyssée')).toBe('odyssee');
    expect(titleSimilarity('L\u2019Arnaqueur', "L'Arnaqueur")).toBe(1);
  });

  it('strips punctuation and collapses whitespace', () => {
    expect(normalizeTitle('Spider-Man: No Way Home')).toBe('spiderman no way home');
  });

  it('handles mixed diacritics and articles', () => {
    expect(normalizeTitle("Le Fabuleux Destin d'Amélie Poulain")).toBe(
      'fabuleux destin damelie poulain',
    );
  });
});

describe('titleSimilarity', () => {
  it('returns 1 for exact normalized match', () => {
    expect(titleSimilarity('The Matrix', 'Matrix')).toBe(1);
  });

  it('returns 0.8 for substring match', () => {
    expect(titleSimilarity('Inception', 'Inception: Extended')).toBe(0.8);
  });

  it('only counts whole-word containment as a partial match', () => {
    expect(titleSimilarity('Up', 'Upgrade')).toBe(0);
    expect(titleSimilarity('It', 'Split')).toBe(0);
    expect(titleSimilarity('Dune', 'Dune: Part Two')).toBe(0.8);
  });

  it('matches titles in non-Latin scripts', () => {
    expect(titleSimilarity('Паразиты', 'Паразиты')).toBe(1);
    expect(titleSimilarity('千と千尋の神隠し', '千と千尋の神隠し')).toBe(1);
    expect(titleSimilarity('Паразиты', 'Inception')).toBe(0);
  });

  it('treats ligatures like their spelled-out letters', () => {
    expect(titleSimilarity('Cœur fidèle', 'Coeur fidele')).toBe(1);
  });

  it('returns 0 for no match', () => {
    expect(titleSimilarity('The Matrix', 'Inception')).toBe(0);
  });

  it('returns 0 when either title is empty', () => {
    expect(titleSimilarity('Inception', '')).toBe(0);
    expect(titleSimilarity('', 'Inception')).toBe(0);
    expect(titleSimilarity('', '')).toBe(0);
  });
});

describe('rankByTitleMatch', () => {
  const accessors = {
    getTitle: (r: { title: string }) => r.title,
    getAltTitle: () => '',
    getYear: (r: { year?: number }) => r.year,
  };

  it('ranks a matching title above an unrelated title from the queried year', () => {
    const items = [
      { title: 'Something Else', year: 2021 },
      { title: 'Dune', year: 2022 },
    ];
    const [best] = rankByTitleMatch(items, 'Dune', 2021, accessors);
    expect(best!.item.title).toBe('Dune');
    expect(best!.score).toBe(1);
  });

  it('accepts a year off by one (e.g. French release year)', () => {
    const [best] = rankByTitleMatch([{ title: 'Dune', year: 2022 }], 'Dune', 2021, accessors);
    expect(best!.yearMatch).toBe(true);
  });

  it('uses the year to pick between equally good titles', () => {
    const items = [
      { title: 'Dune', year: 1984 },
      { title: 'Dune', year: 2021 },
    ];
    const [best] = rankByTitleMatch(items, 'Dune', 2021, accessors);
    expect(best!.item.year).toBe(2021);
  });
});
