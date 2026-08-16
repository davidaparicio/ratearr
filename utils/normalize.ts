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
