import { describe, expect, it } from 'vitest';
import { buildCandidates } from '../utils/candidates';
import type { ResolvedTitle, TitleCandidate } from '../utils/types';

const cand = (tmdbId: number): TitleCandidate => ({
  tmdbId,
  mediaType: 'movie',
  title: `T${tmdbId}`,
});
const resolved = (tmdbId: number): ResolvedTitle => ({
  tmdbId,
  mediaType: 'movie',
  title: `T${tmdbId}`,
});

describe('buildCandidates', () => {
  it('puts the resolved title first, then alternatives', () => {
    const ids = buildCandidates(resolved(1), [cand(2), cand(3)]).map((c) => c.tmdbId);
    expect(ids).toEqual([1, 2, 3]);
  });

  it('keeps a previous list in its original order after selecting another', () => {
    const first = buildCandidates(resolved(1), [cand(2), cand(3)]);
    const ids = buildCandidates(resolved(3), [], first).map((c) => c.tmdbId);
    expect(ids).toEqual([1, 2, 3]);
  });

  it('adds the resolved title if the previous list lacks it', () => {
    const ids = buildCandidates(resolved(9), [], [cand(1), cand(2)]).map((c) => c.tmdbId);
    expect(ids).toEqual([9, 1, 2]);
  });
});
