import type { TitleQuery, RatingsPanelData, RatingResult } from '../utils/types';
import type { Msg } from '../utils/messages';
import { getSettings } from '../utils/settings';
import { resolveTitle } from '../providers/tmdb';
import { getEnabledProviders, unavailableResults } from '../providers/registry';
import { getCached, putCached } from '../utils/cache';
import { aggregate } from '../utils/aggregate';

const PROVIDER_TIMEOUT_MS = 8000;

// MV2 (Firefox) uses browserAction; MV3 (Chrome) uses action
const browserAction = browser.action ?? browser.browserAction;

interface TabState {
  state: 'loading' | 'ready' | 'no-title';
  data: RatingsPanelData | null;
}

const tabStates = new Map<number, TabState>();

function withTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function handleTitleDetected(query: TitleQuery, tabId: number) {
  tabStates.set(tabId, { state: 'loading', data: null });
  updateBadge(tabId, undefined);

  const settings = await getSettings();

  let resolved;
  try {
    resolved = await resolveTitle(query, settings);
  } catch (err) {
    console.warn('Ratearr: resolution failed', err);
    tabStates.set(tabId, { state: 'no-title', data: null });
    updateBadge(tabId, undefined);
    return;
  }
  if (!resolved) {
    tabStates.set(tabId, { state: 'no-title', data: null });
    updateBadge(tabId, undefined);
    return;
  }

  const cached = await getCached(resolved.mediaType, resolved.tmdbId, settings.cacheTtlHours);
  if (cached) {
    const panelData = { ...cached, fromCache: true };
    tabStates.set(tabId, { state: 'ready', data: panelData });
    updateBadge(tabId, panelData.aggregate);
    return;
  }

  const providers = getEnabledProviders(settings);
  const allResults: RatingResult[] = [];

  const settled = await Promise.allSettled(
    providers.map(async (p) => {
      if (!p.isConfigured(settings)) {
        return unavailableResults(p, 'err_no_key');
      }
      return withTimeout(PROVIDER_TIMEOUT_MS, p.fetchRatings(resolved, settings));
    }),
  );

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      allResults.push(...outcome.value);
    } else {
      allResults.push(...unavailableResults(providers[i], 'err_network'));
    }
  }

  const agg = aggregate(allResults);

  const panelData: RatingsPanelData = {
    resolved,
    results: allResults,
    aggregate: agg,
    fetchedAt: Date.now(),
    fromCache: false,
  };

  await putCached(resolved.mediaType, resolved.tmdbId, panelData);
  tabStates.set(tabId, { state: 'ready', data: panelData });
  updateBadge(tabId, agg);
}

function updateBadge(tabId: number, agg: { value: number } | undefined) {
  if (!agg) {
    browserAction.setBadgeText({ tabId, text: '' });
    return;
  }
  const text = agg.value.toFixed(1);
  let color: string;
  if (agg.value >= 7) color = '#1a7f37';
  else if (agg.value >= 5) color = '#b58105';
  else color = '#c0392b';

  browserAction.setBadgeText({ tabId, text });
  browserAction.setBadgeBackgroundColor({ tabId, color });
}

export default defineBackground(() => {
  // Context menu: "Get movie rating" on selected text
  browser.contextMenus.create({
    id: 'ratearr-lookup',
    title: browser.i18n.getMessage('contextMenu_getRating'),
    contexts: ['selection'],
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'ratearr-lookup' || !info.selectionText || !tab?.id) return;
    const query: TitleQuery = {
      title: info.selectionText.trim(),
      ids: {},
      sourceSite: 'context-menu',
    };
    handleTitleDetected(query, tab.id);
    // Open the popup programmatically — MV2 supports openPopup() on user gesture
    browserAction.openPopup?.();
  });

  browser.runtime.onMessage.addListener(
    (message: unknown, sender: browser.Runtime.MessageSender) => {
      const msg = message as Msg;

      if (msg.kind === 'title-detected' && sender.tab?.id != null) {
        handleTitleDetected(msg.query, sender.tab.id);
        return undefined;
      }

      if (msg.kind === 'get-panel-data') {
        const tabState = tabStates.get(msg.tabId);
        const response: Msg = {
          kind: 'panel-data',
          data: tabState?.data ?? null,
          state: tabState?.state ?? 'idle',
        };
        return Promise.resolve(response);
      }

      if (msg.kind === 'refresh' && msg.tabId) {
        const tabState = tabStates.get(msg.tabId);
        if (tabState?.data?.resolved) {
          tabStates.set(msg.tabId, { state: 'loading', data: null });
          // Re-run the pipeline with a synthetic query from the resolved title
          const query: TitleQuery = {
            title: tabState.data.resolved.title,
            year: tabState.data.resolved.year,
            mediaType: tabState.data.resolved.mediaType,
            ids: {
              tmdb: tabState.data.resolved.tmdbId,
              imdb: tabState.data.resolved.imdbId,
            },
            sourceSite: 'refresh',
          };
          handleTitleDetected(query, msg.tabId);
        }
        return undefined;
      }

      return undefined;
    },
  );

  browser.tabs.onRemoved.addListener((tabId) => {
    tabStates.delete(tabId);
  });
});
