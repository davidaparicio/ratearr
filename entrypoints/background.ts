import type { Browser } from 'wxt/browser';
import { getEnabledProviders, unavailableResults } from '../providers/registry';
import { fetchWatchProviders, resolveTitle } from '../providers/tmdb';
import { aggregate } from '../utils/aggregate';
import { getCached, putCached } from '../utils/cache';
import { dbg, setDebug } from '../utils/debug';
import type { Msg } from '../utils/messages';
import { getSettings, type Settings } from '../utils/settings';
import type { RatingResult, RatingsPanelData, ResolvedTitle, TitleQuery } from '../utils/types';

const PROVIDER_TIMEOUT_MS = 8000;

// MV2 (Firefox) uses browserAction; MV3 (Chrome) uses action
const browserAction = browser.action ?? browser.browserAction;

interface TabState {
  state: 'loading' | 'ready' | 'no-title' | 'error' | 'not-found';
  data: RatingsPanelData | null;
}

const tabStates = new Map<number, TabState>();
const tabGenerations = new Map<number, number>();
const inFlightTabs = new Set<number>();
const inFlightProviders = new Map<string, Promise<RatingResult[]>>();

async function fetchFromProviders(
  resolved: ResolvedTitle,
  settings: Settings,
): Promise<RatingResult[]> {
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
    const outcome = settled[i]!;
    if (outcome.status === 'fulfilled') {
      allResults.push(...outcome.value);
    } else {
      allResults.push(...unavailableResults(providers[i]!, 'err_network'));
    }
  }

  return allResults;
}

function withTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function handleTitleDetected(query: TitleQuery, tabId: number) {
  const gen = (tabGenerations.get(tabId) ?? 0) + 1;
  tabGenerations.set(tabId, gen);
  inFlightTabs.add(tabId);

  try {
    tabStates.set(tabId, { state: 'loading', data: null });
    updateBadge(tabId, undefined);

    const settings = await getSettings();
    setDebug(!!settings.debug);
    dbg('pipeline', 'query', { title: query.title, year: query.year, ids: query.ids, source: query.sourceSite });

    let resolution: Awaited<ReturnType<typeof resolveTitle>> | undefined;
    try {
      resolution = await resolveTitle(query, settings);
    } catch (err) {
      console.warn('Ratearr: resolution failed', err);
      tabStates.set(tabId, { state: 'error', data: null });
      updateBadge(tabId, undefined);
      return;
    }
    if (!resolution) {
      dbg('pipeline', 'no resolution found');
      tabStates.set(tabId, { state: 'not-found', data: null });
      updateBadge(tabId, undefined);
      return;
    }

    if (tabGenerations.get(tabId) !== gen) return;

    const { resolved, alternatives } = resolution;
    dbg('pipeline', 'resolved', { tmdbId: resolved.tmdbId, imdbId: resolved.imdbId, title: resolved.title, localizedTitle: resolved.localizedTitle, year: resolved.year });
    if (alternatives.length > 0) dbg('pipeline', 'alternatives', alternatives.map(a => `${a.title} (${a.year}) tmdb:${a.tmdbId}`));

    const cached = await getCached(resolved.mediaType, resolved.tmdbId, settings.cacheTtlHours);
    if (cached) {
      if (tabGenerations.get(tabId) !== gen) return;
      const panelData = { ...cached, alternatives, fromCache: true };
      tabStates.set(tabId, { state: 'ready', data: panelData });
      updateBadge(tabId, panelData.aggregate, settings.badgeGreenMin, settings.badgeYellowMin);
      return;
    }

    const providerKey = `${resolved.mediaType}:${resolved.tmdbId}`;
    let allResults: RatingResult[];
    const existing = inFlightProviders.get(providerKey);
    if (existing) {
      allResults = await existing;
    } else {
      const promise = fetchFromProviders(resolved, settings);
      inFlightProviders.set(providerKey, promise);
      try {
        allResults = await promise;
      } finally {
        inFlightProviders.delete(providerKey);
      }
    }

    if (tabGenerations.get(tabId) !== gen) return;

    const agg = aggregate(allResults, settings.sourceWeights);

    let watchProviders: Awaited<ReturnType<typeof fetchWatchProviders>> | undefined;
    try {
      watchProviders = await fetchWatchProviders(resolved, settings);
    } catch {
      // non-critical
    }

    const panelData: RatingsPanelData = {
      resolved,
      results: allResults,
      aggregate: agg,
      watchProviders,
      alternatives,
      fetchedAt: Date.now(),
      fromCache: false,
    };

    await putCached(resolved.mediaType, resolved.tmdbId, panelData);
    tabStates.set(tabId, { state: 'ready', data: panelData });
    updateBadge(tabId, agg, settings.badgeGreenMin, settings.badgeYellowMin);
  } finally {
    inFlightTabs.delete(tabId);
  }
}

function updateBadge(
  tabId: number,
  agg: { value: number } | undefined,
  greenMin = 7,
  yellowMin = 5,
) {
  if (!agg) {
    browserAction.setBadgeText({ tabId, text: '' });
    return;
  }
  const text = agg.value.toFixed(1);
  let color: string;
  if (agg.value >= greenMin) color = '#1a7f37';
  else if (agg.value >= yellowMin) color = '#b58105';
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
    browserAction.setBadgeText({ tabId: tab.id, text: '...' });
    browserAction.setBadgeBackgroundColor({ tabId: tab.id, color: '#6366f1' });
    handleTitleDetected(query, tab.id).catch((err) =>
      console.error('Ratearr: pipeline error', err),
    );
    try {
      browserAction.openPopup?.();
    } catch {
      /* not supported */
    }
  });

  browser.runtime.onMessage.addListener(
    (message: unknown, sender: Browser.runtime.MessageSender) => {
      const msg = message as Record<string, unknown>;
      if (!msg || typeof msg.kind !== 'string') return undefined;

      if (msg.kind === 'title-detected' && sender.tab?.id != null) {
        const q = msg.query as Record<string, unknown> | undefined;
        if (!q || typeof q.title !== 'string' || !q.ids || typeof q.ids !== 'object')
          return undefined;
        const ids = q.ids as Record<string, unknown>;
        if (ids.tmdb != null && typeof ids.tmdb !== 'number') return undefined;
        if (ids.imdb != null && typeof ids.imdb !== 'string') return undefined;
        handleTitleDetected(q as unknown as TitleQuery, sender.tab.id).catch((err) =>
          console.error('Ratearr: pipeline error', err),
        );
        return undefined;
      }

      if (msg.kind === 'get-panel-data') {
        if (typeof msg.tabId !== 'number') return undefined;
        const tabState = tabStates.get(msg.tabId);
        const response: Msg = {
          kind: 'panel-data',
          data: tabState?.data ?? null,
          state: tabState?.state ?? 'idle',
        };
        return Promise.resolve(response);
      }

      if (msg.kind === 'select-alternative') {
        if (typeof msg.tabId !== 'number' || typeof msg.tmdbId !== 'number') return undefined;
        if (msg.mediaType != null && msg.mediaType !== 'movie' && msg.mediaType !== 'tv')
          return undefined;
        tabStates.set(msg.tabId, { state: 'loading', data: null });
        const query: TitleQuery = {
          title: '',
          ids: { tmdb: msg.tmdbId },
          mediaType: (msg.mediaType as TitleQuery['mediaType']) ?? 'movie',
          sourceSite: 'alternative',
        };
        handleTitleDetected(query, msg.tabId).catch((err) =>
          console.error('Ratearr: pipeline error', err),
        );
        return undefined;
      }

      if (msg.kind === 'refresh') {
        if (typeof msg.tabId !== 'number') return undefined;
        const tabState = tabStates.get(msg.tabId);
        if (tabState?.data?.resolved) {
          tabStates.set(msg.tabId, { state: 'loading', data: null });
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
          handleTitleDetected(query, msg.tabId).catch((err) =>
            console.error('Ratearr: pipeline error', err),
          );
        }
        return undefined;
      }

      return undefined;
    },
  );

  browser.tabs.onRemoved.addListener((tabId) => {
    tabStates.delete(tabId);
    tabGenerations.delete(tabId);
    inFlightTabs.delete(tabId);
  });
});
