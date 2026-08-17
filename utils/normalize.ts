const LEADING_ARTICLES = /^(the|les|le|la|un|une|a|an)\s+/i;
const LEADING_ELISION = /^l['']\s*/i;

export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(LEADING_ELISION, '')
    .replace(LEADING_ARTICLES, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  return 0;
}

export function rankByTitleMatch<T>(
  items: T[],
  query: string,
  queryYear: number | undefined,
  getTitle: (item: T) => string,
  getAltTitle: (item: T) => string,
  getYear: (item: T) => number | undefined,
): { item: T; score: number; yearMatch: boolean }[] {
  return items
    .map((item) => ({
      item,
      score: Math.max(
        titleSimilarity(query, getTitle(item)),
        titleSimilarity(query, getAltTitle(item)),
      ),
      yearMatch: queryYear != null ? getYear(item) === queryYear : false,
    }))
    .sort((a, b) => {
      if (a.yearMatch !== b.yearMatch) return a.yearMatch ? -1 : 1;
      return b.score - a.score;
    });
}
