import type { ResolvedTitle, TitleCandidate } from './types';

/**
 * Builds the ordered list of titles the user can navigate between in the
 * "Did you mean?" section. A previous list is kept as-is so rows don't
 * reshuffle when one is selected; the resolved title is added if missing.
 */
export function buildCandidates(
  resolved: ResolvedTitle,
  alternatives: TitleCandidate[],
  previous?: TitleCandidate[],
): TitleCandidate[] {
  const resolvedCandidate: TitleCandidate = {
    tmdbId: resolved.tmdbId,
    mediaType: resolved.mediaType,
    title: resolved.title,
    year: resolved.year,
    posterPath: resolved.posterPath,
  };
  const base = previous?.length ? previous : [resolvedCandidate, ...alternatives];
  const isSame = (c: TitleCandidate) =>
    c.tmdbId === resolved.tmdbId && c.mediaType === resolved.mediaType;
  return base.some(isSame) ? base : [resolvedCandidate, ...base];
}
