import { describe, expect, it } from 'vitest';
import { normalizeTitle, titleSimilarity } from '../utils/normalize';

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

  it('returns 0 for no match', () => {
    expect(titleSimilarity('The Matrix', 'Inception')).toBe(0);
  });

  it('returns 0 when either title is empty', () => {
    expect(titleSimilarity('Inception', '')).toBe(0);
    expect(titleSimilarity('', 'Inception')).toBe(0);
    expect(titleSimilarity('', '')).toBe(0);
  });
});
