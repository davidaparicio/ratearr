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
