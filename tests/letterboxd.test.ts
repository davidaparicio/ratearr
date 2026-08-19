import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseJsonLdRating, titleToSlug } from '../providers/letterboxd';

const fixture = readFileSync(resolve(__dirname, 'fixtures/letterboxd-inception.html'), 'utf-8');

describe('titleToSlug', () => {
  it('converts a simple title', () => {
    expect(titleToSlug('Inception')).toBe('inception');
  });

  it('handles multi-word titles', () => {
    expect(titleToSlug('The Dark Knight')).toBe('the-dark-knight');
  });

  it('strips diacritics', () => {
    expect(titleToSlug('Amélie')).toBe('amelie');
  });

  it('strips punctuation', () => {
    expect(titleToSlug("L'Agent secret")).toBe('lagent-secret');
  });

  it('collapses multiple dashes', () => {
    expect(titleToSlug('Spider-Man: No Way Home')).toBe('spider-man-no-way-home');
  });

  it('returns empty for empty input', () => {
    expect(titleToSlug('')).toBe('');
  });
});

describe('parseJsonLdRating', () => {
  it('extracts rating from Letterboxd JSON-LD', () => {
    const result = parseJsonLdRating(fixture, 'https://letterboxd.com/film/inception/');
    expect(result).not.toBeNull();
    expect(result!.value).toBe(4.2);
    expect(result!.count).toBe(4353269);
    expect(result!.url).toBe('https://letterboxd.com/film/inception/');
  });

  it('returns null for HTML without JSON-LD', () => {
    const result = parseJsonLdRating('<html><body></body></html>', 'https://example.com');
    expect(result).toBeNull();
  });

  it('returns null for JSON-LD without aggregateRating', () => {
    const html = '<script type="application/ld+json">{"@type":"Movie","name":"Test"}</script>';
    const result = parseJsonLdRating(html, 'https://example.com');
    expect(result).toBeNull();
  });

  it('returns null for non-numeric ratingValue', () => {
    const html =
      '<script type="application/ld+json">{"aggregateRating":{"ratingValue":"N/A"}}</script>';
    const result = parseJsonLdRating(html, 'https://example.com');
    expect(result).toBeNull();
  });

  it('rounds rating to 1 decimal', () => {
    const html =
      '<script type="application/ld+json">{"aggregateRating":{"ratingValue":3.567,"ratingCount":100}}</script>';
    const result = parseJsonLdRating(html, 'https://example.com');
    expect(result!.value).toBe(3.6);
  });
});
