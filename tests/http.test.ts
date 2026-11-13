import { afterEach, describe, expect, it, vi } from 'vitest';
import { allocineProvider } from '../providers/allocine';
import { letterboxdProvider } from '../providers/letterboxd';
import { omdbProvider } from '../providers/omdb';
import { senscritiqueProvider } from '../providers/senscritique';
import { teleramaProvider } from '../providers/telerama';
import { fetchWatchProviders, resolveTitle, tmdbProvider } from '../providers/tmdb';
import { fetchWithTimeout } from '../utils/http';
import { DEFAULT_SETTINGS } from '../utils/settings';
import type { ResolvedTitle } from '../utils/types';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fetch that never answers, but rejects like the real one when its signal aborts. */
function hangingFetch() {
  return vi.fn(
    (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      }),
  );
}

describe('fetchWithTimeout', () => {
  it('aborts the request once the timeout elapses', async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithTimeout('https://example.com/', {}, 20)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });

  it("keeps the caller's own options", async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await fetchWithTimeout('https://example.com/', { method: 'POST', credentials: 'include' });
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://example.com/',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    ]);
  });
});

describe('every network call is bounded by a timeout', () => {
  const settings = { ...DEFAULT_SETTINGS, tmdbApiKey: 'k', omdbApiKey: 'k' };
  const resolved: ResolvedTitle = {
    tmdbId: 27205,
    imdbId: 'tt1375666',
    mediaType: 'movie',
    title: 'Inception',
    localizedTitle: 'Origine',
    year: 2010,
  };
  const providers = [
    tmdbProvider,
    omdbProvider,
    allocineProvider,
    senscritiqueProvider,
    letterboxdProvider,
    teleramaProvider,
  ];

  const calls: Record<string, () => Promise<unknown>> = {
    ...Object.fromEntries(providers.map((p) => [p.id, () => p.fetchRatings(resolved, settings)])),
    resolveTitle: () => resolveTitle({ title: 'Inception', ids: {}, sourceSite: 't' }, settings),
    fetchWatchProviders: () => fetchWatchProviders(resolved, settings),
  };

  for (const [name, call] of Object.entries(calls)) {
    it(`${name} passes an abort signal to fetch`, async () => {
      const fetchMock = vi.fn(async () => new Response('{}', { status: 404 }));
      vi.stubGlobal('fetch', fetchMock);

      await call().catch(() => {});

      expect(fetchMock).toHaveBeenCalled();
      for (const [, init] of fetchMock.mock.calls as unknown as [unknown, RequestInit?][]) {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
      }
    });
  }
});
