import type { PanelState } from './messages';
import type { RatingsPanelData, TitleQuery } from './types';

export interface TabState {
  state: Exclude<PanelState, 'idle'>;
  data: RatingsPanelData | null;
  /** The query behind this state, so a lookup cut short by a worker restart can be resumed. */
  query?: TitleQuery;
}

// The MV3 service worker is stopped after ~30s idle, wiping memory; storage.session
// keeps per-tab state for the browser session so the popup still finds it.
const memory = new Map<number, TabState>();

function storageKey(tabId: number): string {
  return `tab:${tabId}`;
}

export async function setTabState(tabId: number, tabState: TabState): Promise<void> {
  memory.set(tabId, tabState);
  try {
    await browser.storage.session.set({ [storageKey(tabId)]: tabState });
  } catch (err) {
    console.warn('Ratearr: could not persist tab state', err);
  }
}

export async function getTabState(tabId: number): Promise<TabState | undefined> {
  const inMemory = memory.get(tabId);
  if (inMemory) return inMemory;
  try {
    const key = storageKey(tabId);
    const stored = (await browser.storage.session.get(key))[key] as TabState | undefined;
    if (stored) memory.set(tabId, stored);
    return stored;
  } catch {
    return undefined;
  }
}

export async function deleteTabState(tabId: number): Promise<void> {
  memory.delete(tabId);
  await browser.storage.session.remove(storageKey(tabId)).catch(() => {});
}
