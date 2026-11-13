import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, notFound, startBackground, tmdbOnly } from './helpers/background';

const TAB = 1;

afterEach(() => {
  vi.unstubAllGlobals();
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
