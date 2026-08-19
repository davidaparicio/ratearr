import { beforeEach, describe, expect, it } from 'vitest';
import { clearCache, getCached, putCached } from '../utils/cache';
import type { RatingsPanelData } from '../utils/types';

function makePanelData(title: string, fetchedAt?: number): RatingsPanelData {
  return {
    resolved: {
      tmdbId: 1,
      mediaType: 'movie',
      title,
    },
    results: [],
    fetchedAt: fetchedAt ?? Date.now(),
    fromCache: false,
  };
}

describe('cache', () => {
  beforeEach(async () => {
    await browser.storage.local.clear();
  });

  describe('getCached', () => {
    it('returns null for missing key', async () => {
      const result = await getCached('movie', 999, 24);
      expect(result).toBeNull();
    });

    it('returns data for valid cached entry within TTL', async () => {
      const data = makePanelData('Inception');
      await putCached('movie', 42, data);

      const result = await getCached('movie', 42, 24);
      expect(result).not.toBeNull();
      expect(result!.resolved.title).toBe('Inception');
      expect(result!.fromCache).toBe(true);
    });

    it('returns null and removes entry when TTL expired', async () => {
      const key = 'cache:v1:movie:tmdb:42';
      const oldData = makePanelData('Old Movie');
      const entry = { v: 1, fetchedAt: Date.now() - 25 * 60 * 60 * 1000, data: oldData };
      await browser.storage.local.set({ [key]: entry });
      await browser.storage.local.set({
        'cache:index': { entries: [{ key, fetchedAt: entry.fetchedAt }] },
      });

      const result = await getCached('movie', 42, 24);
      expect(result).toBeNull();

      const stored = await browser.storage.local.get(key);
      expect(stored[key]).toBeUndefined();
    });
  });

  describe('putCached', () => {
    it('stores entry and updates index', async () => {
      const data = makePanelData('Inception');
      await putCached('movie', 42, data);

      const key = 'cache:v1:movie:tmdb:42';
      const stored = await browser.storage.local.get(key);
      expect(stored[key]).toBeDefined();
      expect(stored[key].data.resolved.title).toBe('Inception');

      const indexStored = await browser.storage.local.get('cache:index');
      const index = indexStored['cache:index'];
      expect(index.entries).toHaveLength(1);
      expect(index.entries[0].key).toBe(key);
    });

    it('deduplicates index entries on update', async () => {
      await putCached('movie', 42, makePanelData('v1'));
      await putCached('movie', 42, makePanelData('v2'));

      const indexStored = await browser.storage.local.get('cache:index');
      const index = indexStored['cache:index'];
      expect(index.entries).toHaveLength(1);
    });

    it('uses different keys for movie and tv', async () => {
      await putCached('movie', 42, makePanelData('Movie'));
      await putCached('tv', 42, makePanelData('TV Show'));

      const indexStored = await browser.storage.local.get('cache:index');
      const index = indexStored['cache:index'];
      expect(index.entries).toHaveLength(2);

      const movieResult = await getCached('movie', 42, 24);
      expect(movieResult!.resolved.title).toBe('Movie');

      const tvResult = await getCached('tv', 42, 24);
      expect(tvResult!.resolved.title).toBe('TV Show');
    });
  });

  describe('clearCache', () => {
    it('removes all cached entries and the index', async () => {
      await putCached('movie', 1, makePanelData('Movie 1'));
      await putCached('movie', 2, makePanelData('Movie 2'));
      await putCached('tv', 3, makePanelData('TV 3'));

      await clearCache();

      expect(await getCached('movie', 1, 24)).toBeNull();
      expect(await getCached('movie', 2, 24)).toBeNull();
      expect(await getCached('tv', 3, 24)).toBeNull();

      const indexStored = await browser.storage.local.get('cache:index');
      expect(indexStored['cache:index']).toBeUndefined();
    });
  });

  describe('concurrency', () => {
    it('concurrent putCached calls do not corrupt the index', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(putCached('movie', i, makePanelData(`Movie ${i}`)));
      }
      await Promise.all(promises);

      const indexStored = await browser.storage.local.get('cache:index');
      const index = indexStored['cache:index'];
      expect(index.entries).toHaveLength(10);

      const keys = new Set(index.entries.map((e: { key: string }) => e.key));
      expect(keys.size).toBe(10);
    });
  });
});
