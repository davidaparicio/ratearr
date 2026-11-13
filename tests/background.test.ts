import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { json, notFound, startBackground, tmdbOnly } from './helpers/background';

const TAB = 1;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('background pipeline', () => {
  it('a stale lookup failing late does not overwrite a newer result', async () => {
    let failSlowSearch!: () => void;
    const slowSearch = new Promise<Response>((_, reject) => {
      failSlowSearch = () => reject(new Error('network down'));
    });
    const tmdb = tmdbOnly([{ id: 2, title: 'Fast', release_date: '2020-01-01' }]);
    const bg = await startBackground((url) =>
      url.searchParams.get('query') === 'Slow' ? slowSearch : tmdb(url),
    );

    await bg.detect({ title: 'Slow', ids: {}, sourceSite: 'test' }, TAB);
    await bg.detect({ title: 'Fast', ids: {}, sourceSite: 'test' }, TAB);
    await vi.waitFor(async () => expect((await bg.panel(TAB)).state).toBe('ready'));

    failSlowSearch();
    await new Promise((r) => setTimeout(r, 10));

    const panel = await bg.panel(TAB);
    expect(panel.state).toBe('ready');
    expect(panel.data?.resolved.title).toBe('Fast');
  });

  it('a stale lookup finding nothing does not overwrite a newer result', async () => {
    let answerSlowSearch!: () => void;
    const slowSearch = new Promise<void>((resolve) => {
      answerSlowSearch = resolve;
    });
    const tmdb = tmdbOnly([{ id: 2, title: 'Fast' }]);
    const bg = await startBackground((url) =>
      url.searchParams.get('query') === 'Slow'
        ? slowSearch.then(() => json({ results: [] }))
        : tmdb(url),
    );

    await bg.detect({ title: 'Slow', ids: {}, sourceSite: 'test' }, TAB);
    await bg.detect({ title: 'Fast', ids: {}, sourceSite: 'test' }, TAB);
    await vi.waitFor(async () => expect((await bg.panel(TAB)).state).toBe('ready'));

    answerSlowSearch();
    await new Promise((r) => setTimeout(r, 10));

    expect((await bg.panel(TAB)).state).toBe('ready');
  });

  it('a stale lookup finishing late (slow watch providers) does not overwrite a newer result', async () => {
    let releaseWatch!: () => void;
    const watchGate = new Promise<void>((resolve) => {
      releaseWatch = resolve;
    });
    const tmdb = tmdbOnly([
      { id: 1, title: 'Slow', release_date: '2020-01-01' },
      { id: 2, title: 'Fast', release_date: '2020-01-01' },
    ]);
    const bg = await startBackground((url) =>
      url.pathname === '/3/movie/1/watch/providers' ? watchGate.then(() => tmdb(url)) : tmdb(url),
    );

    await bg.detect({ title: 'Slow', ids: {}, sourceSite: 'test' }, TAB);
    // let Slow get past its ratings and block on watch providers
    await vi.waitFor(() =>
      expect(bg.fetchMock.mock.calls.some(([u]) => String(u).includes('/3/movie/1/watch'))).toBe(
        true,
      ),
    );
    await bg.detect({ title: 'Fast', ids: {}, sourceSite: 'test' }, TAB);
    await vi.waitFor(async () => expect((await bg.panel(TAB)).data?.resolved.title).toBe('Fast'));

    releaseWatch();
    await new Promise((r) => setTimeout(r, 20));

    expect((await bg.panel(TAB)).data?.resolved.title).toBe('Fast');
  });

  it('reports an error when TMDB is unreachable', async () => {
    const bg = await startBackground(() => notFound());
    await bg.detect({ title: 'Nothing', ids: {}, sourceSite: 'test' }, TAB);
    await vi.waitFor(async () => expect((await bg.panel(TAB)).state).toBe('error'));
  });
});

describe('background pipeline — cache vs. settings changes', () => {
  const movie = { id: 2, title: 'Fast', release_date: '2020-01-01' };
  const onlyTmdb = {
    enabledSources: {
      tmdb: true,
      imdb: false,
      rottentomatoes: false,
      metacritic: false,
      'allocine-presse': false,
      'allocine-spectateurs': false,
      senscritique: false,
      letterboxd: false,
      telerama: false,
      'telerama-abonnes': false,
    },
  };

  it('fetches a source enabled after the entry was cached, keeping the cache age', async () => {
    const tmdb = tmdbOnly([movie]);
    let bg = await startBackground(tmdb, onlyTmdb);
    await bg.detect({ title: 'Fast', ids: {}, sourceSite: 'test' }, TAB);
    await vi.waitFor(async () => expect((await bg.panel(TAB)).state).toBe('ready'));
    const firstFetchedAt = (await bg.panel(TAB)).data!.fetchedAt;

    const settings = {
      ...onlyTmdb,
      enabledSources: { ...onlyTmdb.enabledSources, letterboxd: true },
    };
    await browser.storage.sync.set({ settings: { ...settings, tmdbApiKey: 'test-key' } });
    bg = await startBackground(tmdb, settings, { keepStorage: true });
    await bg.detect({ title: 'Fast', ids: {}, sourceSite: 'test' }, TAB);
    await vi.waitFor(async () => {
      const { state, data } = await bg.panel(TAB);
      expect(state).toBe('ready');
      expect(data!.results.map((r) => (r.status === 'ok' ? r.rating.source : r.source))).toEqual([
        'tmdb',
        'letterboxd',
      ]);
      expect(data!.fromCache).toBe(true);
      expect(data!.fetchedAt).toBe(firstFetchedAt);
    });
    const hosts = bg.fetchMock.mock.calls.map(([u]) => new URL(String(u)).hostname);
    expect(hosts).toContain('letterboxd.com');
    // TMDB ratings came from the cache; only resolution hit TMDB again
    const paths = bg.fetchMock.mock.calls.map(([u]) => new URL(String(u)).pathname);
    expect(paths).not.toContain('/3/movie/2');
  });
});

describe('background pipeline — partial failures', () => {
  it('caches the good results and retries only the failed provider', async () => {
    const tmdb = tmdbOnly([{ id: 2, title: 'Fast', release_date: '2020-01-01' }]);
    const bg = await startBackground(
      (url) => {
        if (url.hostname === 'www.omdbapi.com') {
          return json({ Response: 'False', Error: 'Request limit reached!' }, 401);
        }
        if (url.hostname === 'api.themoviedb.org' && url.pathname.endsWith('/external_ids')) {
          return json({ imdb_id: 'tt0000002' });
        }
        return tmdb(url);
      },
      { omdbApiKey: 'key' },
    );
    const query = { title: 'Fast', ids: {}, sourceSite: 'test' };

    await bg.detect(query, TAB);
    await vi.waitFor(async () => expect((await bg.panel(TAB)).state).toBe('ready'));
    bg.fetchMock.mockClear();

    await bg.detect(query, TAB);
    await vi.waitFor(async () => expect((await bg.panel(TAB)).data?.fromCache).toBe(true));

    const hosts = new Set(bg.fetchMock.mock.calls.map(([u]) => new URL(String(u)).hostname));
    expect(hosts.has('www.omdbapi.com')).toBe(true);
    expect(hosts.has('www.allocine.fr')).toBe(false);
    expect(hosts.has('letterboxd.com')).toBe(false);
    const imdb = (await bg.panel(TAB)).data!.results.find(
      (r) => r.status === 'unavailable' && r.source === 'imdb',
    );
    expect(imdb).toMatchObject({ reasonKey: 'err_rate_limit' });
  });
});

describe('background pipeline — failures outside resolution', () => {
  const query = { title: 'Fast', ids: {}, sourceSite: 'test' };
  const tmdb = tmdbOnly([{ id: 2, title: 'Fast', release_date: '2020-01-01' }]);

  it('still shows the ratings when the cache write fails (e.g. storage full)', async () => {
    const bg = await startBackground(tmdb);
    const realSet = browser.storage.local.set.bind(browser.storage.local);
    vi.spyOn(browser.storage.local, 'set').mockImplementation(async (items) => {
      if (Object.keys(items).some((k) => k.startsWith('cache:'))) throw new Error('QUOTA_BYTES');
      return realSet(items);
    });

    await bg.detect(query, TAB);
    await vi.waitFor(async () => expect((await bg.panel(TAB)).state).toBe('ready'));
  });

  it('ends in an error, not a stuck "loading" that every popup poll restarts', async () => {
    const bg = await startBackground(tmdb);
    vi.spyOn(browser.storage.local, 'get').mockRejectedValue(new Error('storage broken'));

    await bg.detect(query, TAB);
    await vi.waitFor(async () => expect((await bg.panel(TAB)).state).toBe('error'));
    bg.fetchMock.mockClear();
    for (let i = 0; i < 5; i++) await bg.panel(TAB);
    expect(bg.fetchMock).not.toHaveBeenCalled();
  });
});

describe('background pipeline — resuming after a worker restart', () => {
  const query = { title: 'Fast', ids: {}, sourceSite: 'test' };
  const tmdb = tmdbOnly([{ id: 2, title: 'Fast', release_date: '2020-01-01' }]);

  it('resumes a lookup the previous worker left in "loading"', async () => {
    await startBackground(tmdb);
    await browser.storage.session.set({ [`tab:${TAB}`]: { state: 'loading', data: null, query } });

    const bg = await startBackground(tmdb, {}, { keepStorage: true });
    await bg.panel(TAB);
    await vi.waitFor(async () => expect((await bg.panel(TAB)).state).toBe('ready'));
  });

  it('gives up instead of resuming the same lookup again', async () => {
    await startBackground(tmdb);
    await browser.storage.session.set({
      [`tab:${TAB}`]: { state: 'loading', data: null, query, resumed: true },
    });

    const bg = await startBackground(tmdb, {}, { keepStorage: true });
    expect((await bg.panel(TAB)).state).toBe('error');
    expect(bg.fetchMock).not.toHaveBeenCalled();
  });
});

describe('background pipeline — leaving a title page', () => {
  const query = { title: 'Fast', ids: {}, sourceSite: 'test' };
  const tmdb = tmdbOnly([{ id: 2, title: 'Fast', release_date: '2020-01-01' }]);

  it('forgets the ratings when the tab starts loading another page', async () => {
    const bg = await startBackground(tmdb);
    await bg.detect(query, TAB);
    await vi.waitFor(async () => expect((await bg.panel(TAB)).state).toBe('ready'));

    await fakeBrowser.tabs.onUpdated.trigger(TAB, { status: 'loading' }, {} as never);

    expect(await bg.panel(TAB)).toEqual({ state: 'idle', data: null });
  });

  it('forgets the ratings when the content script reports a page with no title', async () => {
    const bg = await startBackground(tmdb);
    await bg.detect(query, TAB);
    await vi.waitFor(async () => expect((await bg.panel(TAB)).state).toBe('ready'));

    await bg.send({ kind: 'title-cleared' }, TAB);

    expect(await bg.panel(TAB)).toEqual({ state: 'idle', data: null });
  });

  it('drops the result of a lookup still running for the previous page', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bg = await startBackground((url) => gate.then(() => tmdb(url)));
    await bg.detect(query, TAB);

    await fakeBrowser.tabs.onUpdated.trigger(TAB, { status: 'loading' }, {} as never);
    release();
    await new Promise((r) => setTimeout(r, 20));

    expect((await bg.panel(TAB)).state).toBe('idle');
  });
});

describe('background pipeline — context menu', () => {
  it('keeps the loading badge until the lookup finishes, then shows the score', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tmdb = tmdbOnly([{ id: 2, title: 'Fast', release_date: '2020-01-01' }]);
    const bg = await startBackground((url) => gate.then(() => tmdb(url)));

    bg.clickContextMenu('Fast', TAB);
    await vi.waitFor(() => expect(bg.badgeTexts(TAB).at(-1)).toBe('...'));
    await new Promise((r) => setTimeout(r, 20));
    expect(bg.badgeTexts(TAB).at(-1)).toBe('...');

    release();
    await vi.waitFor(() => expect(bg.badgeTexts(TAB).at(-1)).toBe('7.5'));
  });
});
