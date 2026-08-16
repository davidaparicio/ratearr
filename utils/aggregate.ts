import type { RatingResult } from './types';

export function aggregate(
  results: RatingResult[],
): { value: number; scale: 10; sourcesUsed: number } | undefined {
  const ok = results.filter((r) => r.status === 'ok');
  if (ok.length === 0) return undefined;

  const sum = ok.reduce((acc, r) => {
    if (r.status !== 'ok') return acc;
    return acc + (r.rating.value / r.rating.scale) * 10;
  }, 0);

  return {
    value: Math.round((sum / ok.length) * 10) / 10,
    scale: 10,
    sourcesUsed: ok.length,
  };
}
