import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TitleQuery } from '../utils/types';

const query: TitleQuery = { title: 'Inception', ids: { imdb: 'tt1375666' }, sourceSite: 'imdb' };

// Re-importing the module simulates an MV3 service worker restart: in-memory state is gone.
async function freshModule() {
  vi.resetModules();
  return import('../utils/tab-state');
}

describe('tab state', () => {
  beforeEach(async () => {
    await browser.storage.session.clear();
  });

  it('survives a service worker restart', async () => {
    const before = await freshModule();
    await before.setTabState(7, { state: 'not-found', data: null, query });

    const after = await freshModule();
    expect(await after.getTabState(7)).toEqual({ state: 'not-found', data: null, query });
  });

  it('returns undefined for unknown tabs', async () => {
    const mod = await freshModule();
    expect(await mod.getTabState(123)).toBeUndefined();
  });

  it('forgets a tab once it is deleted', async () => {
    const before = await freshModule();
    await before.setTabState(7, { state: 'loading', data: null, query });
    await before.deleteTabState(7);

    const after = await freshModule();
    expect(await after.getTabState(7)).toBeUndefined();
  });
});
