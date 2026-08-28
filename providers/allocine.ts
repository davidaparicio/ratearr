import { dbg } from '../utils/debug';
import { rankByTitleMatch, titleSimilarity } from '../utils/normalize';
import type { MediaType, RatingResult, ResolvedTitle } from '../utils/types';
import type { RatingProvider } from './types';

const ALLOCINE_BASE = 'https://www.allocine.fr';

interface AllocineRatings {
  presse?: { value: number; count?: number };
  spectateurs?: { value: number; count?: number };
  url: string;
}

export function parseAllocineHtml(html: string, pageUrl: string): AllocineRatings | null {
  const result: AllocineRatings = { url: pageUrl };

  // Pattern: rating-item-content → "Presse" or "Spectateurs" label → stareval-note with score
  const ratingBlocks = html.match(/rating-item[\s\S]*?(?=rating-item|$)/gi);
  if (!ratingBlocks) return null;

  for (const block of ratingBlocks) {
    const noteMatch = block.match(/stareval-note[^>]*>([^<]+)/);
    if (!noteMatch) continue;
    const rawScore = noteMatch[1]!.trim();
    if (rawScore === '--' || rawScore === '') continue;
    const value = parseFloat(rawScore.replace(',', '.'));
    if (Number.isNaN(value)) continue;

    const countMatch = block.match(/stareval-review[^>]*>\s*(\d[\d\s]*)\s*(?:notes|critiques)/i);
    const count = countMatch ? parseInt(countMatch[1]!.replace(/\s/g, ''), 10) : undefined;

    if (/Presse\s/i.test(block)) {
      result.presse = { value, count };
    } else if (/Spectateurs?\s/i.test(block)) {
      result.spectateurs = { value, count };
    }
  }

  if (!result.presse && !result.spectateurs) return null;
  return result;
}

export interface AutocompleteResult {
  entity_type: string;
  entity_id: string;
  label: string;
  original_label?: string;
  data?: { year?: string };
}

export function pickBestAutocompleteMatch(
  results: AutocompleteResult[],
  title: string,
  entityFilter: string,
  year?: number,
): AutocompleteResult | null {
  const matches = results.filter((r) => r.entity_type === entityFilter);
  if (matches.length === 0) return null;

  const ranked = rankByTitleMatch(matches, title, year, {
    getTitle: (r) => r.label || '',
    getAltTitle: (r) => r.original_label || '',
    getYear: (r) => (r.data?.year ? parseInt(r.data.year, 10) : undefined),
  });

  const best = ranked[0]!;
  if (best.score === 0) return null;

  return best.item;
}

function buildAllocineUrl(entityId: string, mediaType: MediaType): string {
  if (mediaType === 'tv') {
    return `${ALLOCINE_BASE}/series/ficheserie_gen_cserie=${entityId}.html`;
  }
  return `${ALLOCINE_BASE}/film/fichefilm_gen_cfilm=${entityId}.html`;
}

async function searchByAutocomplete(
  title: string,
  mediaType: MediaType,
  year?: number,
): Promise<string | null> {
  const entityFilter = mediaType === 'tv' ? 'series' : 'movie';
  const url = new URL(`${ALLOCINE_BASE}/_/autocomplete/${entityFilter}`);
  url.searchParams.set('q', title);

  const resp = await fetch(url.toString());
  if (!resp.ok) return null;
  const json = await resp.json();
  const results: AutocompleteResult[] = json.results || [];
  dbg('allocine', `autocomplete "${title}" → ${results.length} results`, results.map(r => `${r.label} (${r.data?.year}) id:${r.entity_id}`));

  const best = pickBestAutocompleteMatch(results, title, entityFilter, year);
  if (!best) {
    dbg('allocine', 'autocomplete: no match above threshold');
    return null;
  }
  dbg('allocine', `autocomplete picked: "${best.label}" (${best.data?.year}) id:${best.entity_id}`);

  if (!/^\d+$/.test(best.entity_id)) return null;
  return buildAllocineUrl(best.entity_id, mediaType);
}

export function parseSearchPageEntities(
  html: string,
  title: string,
  mediaType: MediaType,
): string | null {
  const match = html.match(/var jsEntities\s*=\s*({[\s\S]*?});\s*(?:var|<\/script>)/);
  if (!match) return null;

  try {
    const entities = JSON.parse(match[1]!);
    const prefix = mediaType === 'tv' ? 'TVSeries:' : 'Movie:';

    for (const [key, val] of Object.entries(entities)) {
      let decoded: string;
      try {
        decoded = atob(key);
      } catch {
        continue;
      }
      if (!decoded.startsWith(prefix)) continue;
      const entity = val as { title?: string };
      if (!entity.title) continue;

      if (titleSimilarity(title, entity.title) > 0) {
        const id = decoded.slice(prefix.length);
        dbg('allocine', `search page found: "${entity.title}" id:${id}`);
        return id;
      }
    }
  } catch {
    // invalid JSON
  }
  return null;
}

async function searchByPage(
  title: string,
  mediaType: MediaType,
): Promise<string | null> {
  const url = `${ALLOCINE_BASE}/rechercher/?q=${encodeURIComponent(title)}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;

  const html = await resp.text();
  const entityId = parseSearchPageEntities(html, title, mediaType);
  if (!entityId) {
    dbg('allocine', 'search page: no match');
    return null;
  }
  return buildAllocineUrl(entityId, mediaType);
}

async function searchAllocine(
  title: string,
  mediaType: MediaType,
  year?: number,
): Promise<string | null> {
  const fromAutocomplete = await searchByAutocomplete(title, mediaType, year);
  if (fromAutocomplete) return fromAutocomplete;

  return searchByPage(title, mediaType);
}

export const allocineProvider: RatingProvider = {
  id: 'allocine',
  produces: ['allocine-presse', 'allocine-spectateurs'],

  isConfigured(): boolean {
    return true;
  },

  async fetchRatings(resolved: ResolvedTitle): Promise<RatingResult[]> {
    const titlesToTry = resolved.localizedTitle
      ? [resolved.localizedTitle, resolved.title]
      : [resolved.title];

    let pageUrl: string | null = null;
    for (const t of titlesToTry) {
      pageUrl = await searchAllocine(t, resolved.mediaType, resolved.year);
      if (pageUrl) break;
    }

    if (!pageUrl) {
      return [
        { status: 'unavailable', source: 'allocine-presse', reasonKey: 'err_not_found' },
        { status: 'unavailable', source: 'allocine-spectateurs', reasonKey: 'err_not_found' },
      ];
    }

    const resp = await fetch(pageUrl);
    if (!resp.ok) {
      return [
        { status: 'unavailable', source: 'allocine-presse', reasonKey: 'err_network' },
        { status: 'unavailable', source: 'allocine-spectateurs', reasonKey: 'err_network' },
      ];
    }

    const html = await resp.text();
    const ratings = parseAllocineHtml(html, pageUrl);

    const results: RatingResult[] = [];

    if (ratings?.presse) {
      results.push({
        status: 'ok',
        rating: {
          source: 'allocine-presse',
          value: ratings.presse.value,
          scale: 5,
          count: ratings.presse.count,
          url: ratings.url,
        },
      });
    } else {
      results.push({
        status: 'unavailable',
        source: 'allocine-presse',
        reasonKey: 'err_not_found',
      });
    }

    if (ratings?.spectateurs) {
      results.push({
        status: 'ok',
        rating: {
          source: 'allocine-spectateurs',
          value: ratings.spectateurs.value,
          scale: 5,
          count: ratings.spectateurs.count,
          url: ratings.url,
        },
      });
    } else {
      results.push({
        status: 'unavailable',
        source: 'allocine-spectateurs',
        reasonKey: 'err_not_found',
      });
    }

    return results;
  },
};
