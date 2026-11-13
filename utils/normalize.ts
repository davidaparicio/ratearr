const LEADING_ARTICLES = /^(the|les|le|la|un|une|a|an)\s+/i;
const LEADING_ELISION = /^l['']\s*/i;

const LIGATURES: Record<string, string> = { œ: 'oe', æ: 'ae', ß: 'ss' };

export function normalizeTitle(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[œæß]/g, (c) => LIGATURES[c]!)
      .replace(LEADING_ELISION, '')
      .replace(LEADING_ARTICLES, '')
      // Unicode-aware so Cyrillic, CJK, etc. titles don't normalize to ''
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** True when `needle` appears in `haystack` as a run of whole words ("Up" is not in "Upgrade"). */
function containsWords(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (containsWords(na, nb) || containsWords(nb, na)) return 0.8;
  return 0;
}

/** Sites often list the local release year, which can be one off from the production year. */
function isYearClose(year: number | undefined, queryYear: number | undefined): boolean {
  return year != null && queryYear != null && Math.abs(year - queryYear) <= 1;
}

export interface TitleAccessors<T> {
  getTitle: (item: T) => string;
  getAltTitle: (item: T) => string;
  getYear: (item: T) => number | undefined;
}

export function rankByTitleMatch<T>(
  items: T[],
  query: string,
  queryYear: number | undefined,
  accessors: TitleAccessors<T>,
): { item: T; score: number; yearMatch: boolean }[] {
  return (
    items
      .map((item) => ({
        item,
        score: Math.max(
          titleSimilarity(query, accessors.getTitle(item)),
          titleSimilarity(query, accessors.getAltTitle(item)),
        ),
        yearMatch: isYearClose(accessors.getYear(item), queryYear),
      }))
      // Title first: a same-year but unrelated title must not outrank the right
      // title; the year only breaks ties (e.g. between remakes).
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        if (a.yearMatch !== b.yearMatch) return a.yearMatch ? -1 : 1;
        return 0;
      })
  );
}
