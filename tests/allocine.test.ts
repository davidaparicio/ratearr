import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseAllocineHtml } from '../providers/allocine';

const fixture = readFileSync(
  resolve(__dirname, 'fixtures/allocine-page.html'),
  'utf-8',
);

describe('parseAllocineHtml', () => {
  it('extracts presse and spectateurs from DOM rating-item blocks', () => {
    const result = parseAllocineHtml(fixture, 'https://www.allocine.fr/film/fichefilm_gen_cfilm=255238.html');
    expect(result).not.toBeNull();
    expect(result!.presse).toBeDefined();
    expect(result!.presse!.value).toBe(4.8);
    expect(result!.presse!.count).toBe(36);
    expect(result!.spectateurs).toBeDefined();
    expect(result!.spectateurs!.value).toBe(4.5);
    expect(result!.spectateurs!.count).toBe(34041);
    expect(result!.url).toBe('https://www.allocine.fr/film/fichefilm_gen_cfilm=255238.html');
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
    expect(result!.spectateurs!.value).toBe(3.2);
    expect(result!.spectateurs!.count).toBe(500);
  });
});
