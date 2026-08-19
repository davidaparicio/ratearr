import type { RatingResult, SourceId } from './types';

export function aggregate(
  results: RatingResult[],
  weights?: Partial<Record<SourceId, number>>,
): { value: number; scale: 10; sourcesUsed: number } | undefined {
  const ok = results.filter((r) => r.status === 'ok');
  if (ok.length === 0) return undefined;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const r of ok) {
    if (r.status !== 'ok') continue;
    const w = weights?.[r.rating.source] ?? 1;
    if (w <= 0) continue;
    weightedSum += (r.rating.value / r.rating.scale) * 10 * w;
    totalWeight += w;
  }

  if (totalWeight === 0) return undefined;

  return {
    value: Math.round((weightedSum / totalWeight) * 10) / 10,
    scale: 10,
    sourcesUsed: ok.length,
  };
}
