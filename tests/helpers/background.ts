import { vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Msg, PanelState } from '../../utils/messages';
import { DEFAULT_SETTINGS, type Settings } from '../../utils/settings';
import type { RatingsPanelData, TitleQuery } from '../../utils/types';

export type FetchHandler = (url: URL, init?: RequestInit) => Promise<Response> | Response;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

export const notFound = (): Response => new Response('', { status: 404 });

/**
 * Starts a fresh copy of the background script against the fake browser, as a
 * new service worker would. Storage is cleared unless `keepStorage` is set.
 */
export async function startBackground(
  fetchHandler: FetchHandler,
  settings: Partial<Settings> = {},
  { keepStorage = false } = {},
) {
  if (!keepStorage) {
    fakeBrowser.reset();
    await fakeBrowser.storage.sync.set({
      settings: { ...DEFAULT_SETTINGS, tmdbApiKey: 'test-key', ...settings },
    });
  } else {
    fakeBrowser.runtime.onMessage.removeAllListeners();
  }

  const action = fakeBrowser.action as unknown as Record<string, unknown>;
  action.setBadgeText = vi.fn(async () => {});
  action.setBadgeBackgroundColor = vi.fn(async () => {});
  (fakeBrowser.i18n as unknown as Record<string, unknown>).getMessage = vi.fn((key: string) => key);
  const menus = fakeBrowser.contextMenus as unknown as Record<string, unknown>;
  menus.removeAll = vi.fn(async () => {});
  menus.create = vi.fn();
  menus.onClicked = { addListener: vi.fn() };

  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(fetchHandler(new URL(input instanceof Request ? input.url : input), init)),
  );
  vi.stubGlobal('fetch', fetchMock);

  vi.resetModules();
  const background = (await import('../../entrypoints/background')).default;
  background.main();

  async function send(message: Msg | Record<string, unknown>, tabId?: number) {
    const sender = (tabId != null ? { tab: { id: tabId } } : {}) as Browser.runtime.MessageSender;
    const [response] = await fakeBrowser.runtime.onMessage.trigger(message, sender, () => {});
    return response as Msg | undefined;
  }

  return {
    fetchMock,
    send,
    detect: (query: TitleQuery, tabId: number) => send({ kind: 'title-detected', query }, tabId),
    async panel(tabId: number): Promise<{ state: PanelState; data: RatingsPanelData | null }> {
      const res = await send({ kind: 'get-panel-data', tabId });
      if (res?.kind !== 'panel-data') throw new Error('no panel data');
      return { state: res.state, data: res.data };
    },
  };
}

/** A minimal TMDB that resolves `title` searches to `movie`; every other host 404s. */
export function tmdbOnly(movies: { id: number; title: string; release_date?: string }[]) {
  return (url: URL): Response => {
    if (url.hostname !== 'api.themoviedb.org') return notFound();
    const path = url.pathname;
    if (path.startsWith('/3/search/')) {
      const q = url.searchParams.get('query');
      const hits = movies.filter((m) => m.title === q).map((m) => ({ ...m, media_type: 'movie' }));
      return json({ results: hits });
    }
    const id = Number(path.match(/\/3\/movie\/(\d+)/)?.[1]);
    const movie = movies.find((m) => m.id === id);
    if (!movie) return notFound();
    if (path.endsWith('/external_ids')) return json({ imdb_id: null });
    if (path.endsWith('/watch/providers')) return json({ results: {} });
    return json({ ...movie, vote_average: 7.5, vote_count: 100 });
  };
}
