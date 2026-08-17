import type { CacheEntry, MediaType, RatingsPanelData } from './types';

const MAX_ENTRIES = 300;
const PRUNE_COUNT = 50;

let indexLock: Promise<void> = Promise.resolve();

function cacheKey(mediaType: MediaType, tmdbId: number): string {
  return `cache:v1:${mediaType}:tmdb:${tmdbId}`;
}

interface CacheIndex {
  entries: { key: string; fetchedAt: number }[];
}

async function getIndex(): Promise<CacheIndex> {
  const stored = await browser.storage.local.get('cache:index');
  return (stored['cache:index'] as CacheIndex) ?? { entries: [] };
}

async function setIndex(index: CacheIndex): Promise<void> {
  await browser.storage.local.set({ 'cache:index': index });
}

export async function getCached(
  mediaType: MediaType,
  tmdbId: number,
  ttlHours: number,
): Promise<RatingsPanelData | null> {
  const key = cacheKey(mediaType, tmdbId);
  const stored = await browser.storage.local.get(key);
  const entry = stored[key] as CacheEntry | undefined;
  if (!entry) return null;

  const ageMs = Date.now() - entry.fetchedAt;
  if (ageMs > ttlHours * 60 * 60 * 1000) {
    await browser.storage.local.remove(key);
    indexLock = indexLock.then(async () => {
      const index = await getIndex();
      index.entries = index.entries.filter((e) => e.key !== key);
      await setIndex(index);
    });
    await indexLock;
    return null;
  }

  return { ...entry.data, fromCache: true };
}

export async function putCached(
  mediaType: MediaType,
  tmdbId: number,
  data: RatingsPanelData,
): Promise<void> {
  const key = cacheKey(mediaType, tmdbId);
  const entry: CacheEntry = { v: 1, fetchedAt: Date.now(), data };
  await browser.storage.local.set({ [key]: entry });

  indexLock = indexLock.then(async () => {
    const index = await getIndex();
    index.entries = index.entries.filter((e) => e.key !== key);
    index.entries.push({ key, fetchedAt: entry.fetchedAt });

    if (index.entries.length > MAX_ENTRIES) {
      index.entries.sort((a, b) => a.fetchedAt - b.fetchedAt);
      const toRemove = index.entries.splice(0, PRUNE_COUNT);
      await browser.storage.local.remove(toRemove.map((e) => e.key));
    }

    await setIndex(index);
  });
  await indexLock;
}

export async function clearCache(): Promise<void> {
  const index = await getIndex();
  const keys = index.entries.map((e) => e.key);
  if (keys.length > 0) await browser.storage.local.remove(keys);
  await browser.storage.local.remove('cache:index');
}
