import type { Browser } from 'wxt/browser';
import { getEnabledProviders, keepEnabledSources, unavailableResults } from '../providers/registry';
import { fetchWatchProviders, resolveTitle } from '../providers/tmdb';
import { aggregate } from '../utils/aggregate';
import { getCached, isCacheable, putCached } from '../utils/cache';
import { buildCandidates } from '../utils/candidates';
import { dbg, setDebug } from '../utils/debug';
import type { Msg } from '../utils/messages';
import { getSettings, type Settings } from '../utils/settings';
import { deleteTabState, getTabState, setTabState } from '../utils/tab-state';
import type {
  RatingResult,
  RatingsPanelData,
  ResolvedTitle,
  TitleCandidate,
  TitleQuery,
} from '../utils/types';

const PROVIDER_TIMEOUT_MS = 8000;

// MV2 (Firefox) uses browserAction; MV3 (Chrome) uses action
const browserAction = browser.action ?? browser.browserAction;

const tabGenerations = new Map<number, number>();
// Tabs with a lookup running in this worker instance; a stored 'loading' state
// for any other tab was interrupted by a worker restart.
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

  return keepEnabledSources(allResults, settings);
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

async function handleTitleDetected(
  query: TitleQuery,
  tabId: number,
  previousCandidates?: TitleCandidate[],
  bypassCache = false,
) {
  const gen = (tabGenerations.get(tabId) ?? 0) + 1;
  tabGenerations.set(tabId, gen);
  inFlightTabs.add(tabId);

  try {
    await setTabState(tabId, { state: 'loading', data: null, query });
    updateBadge(tabId, undefined);

    const settings = await getSettings();
    setDebug(!!settings.debug);
    dbg('pipeline', 'query', {
      title: query.title,
      year: query.year,
      ids: query.ids,
      source: query.sourceSite,
    });

    let resolution: Awaited<ReturnType<typeof resolveTitle>> | undefined;
    try {
      resolution = await resolveTitle(query, settings);
    } catch (err) {
      console.warn('Ratearr: resolution failed', err);
      await setTabState(tabId, { state: 'error', data: null, query });
      updateBadge(tabId, undefined);
      return;
    }
    if (!resolution) {
      dbg('pipeline', 'no resolution found');
      await setTabState(tabId, { state: 'not-found', data: null, query });
      updateBadge(tabId, undefined);
      return;
    }

    if (tabGenerations.get(tabId) !== gen) return;

    const { resolved, alternatives } = resolution;
    const candidates = buildCandidates(resolved, alternatives, previousCandidates);
    dbg('pipeline', 'resolved', {
      tmdbId: resolved.tmdbId,
      imdbId: resolved.imdbId,
      title: resolved.title,
      localizedTitle: resolved.localizedTitle,
      year: resolved.year,
    });
    if (alternatives.length > 0)
      dbg(
        'pipeline',
        'alternatives',
        alternatives.map((a) => `${a.title} (${a.year}) tmdb:${a.tmdbId}`),
      );

    const cached = bypassCache
      ? null
      : await getCached(resolved.mediaType, resolved.tmdbId, settings.cacheTtlHours);
    if (cached) {
      if (tabGenerations.get(tabId) !== gen) return;
      const results = keepEnabledSources(cached.results, settings);
      const panelData = {
        ...cached,
        results,
        aggregate: aggregate(results, settings.sourceWeights),
        alternatives,
        candidates,
        fromCache: true,
      };
      await setTabState(tabId, { state: 'ready', data: panelData, query });
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
      candidates,
      fetchedAt: Date.now(),
      fromCache: false,
    };

    if (isCacheable(allResults)) {
      await putCached(resolved.mediaType, resolved.tmdbId, panelData);
    }
    await setTabState(tabId, { state: 'ready', data: panelData, query });
    updateBadge(tabId, agg, settings.badgeGreenMin, settings.badgeYellowMin);
  } finally {
    // A newer lookup for this tab may still be running; let it clear the flag.
    if (tabGenerations.get(tabId) === gen) inFlightTabs.delete(tabId);
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
  // Context menu: "Get movie rating" on selected text. Chrome keeps menus across
  // service worker restarts (re-creating throws "duplicate id") while Firefox's
  // MV2 background page does not, so clear and re-create on every start.
  browser.contextMenus
    .removeAll()
    .then(() =>
      browser.contextMenus.create({
        id: 'ratearr-lookup',
        title: browser.i18n.getMessage('contextMenu_getRating'),
        contexts: ['selection'],
      }),
    )
    .catch((err) => console.warn('Ratearr: context menu setup failed', err));

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
        const tabId = msg.tabId;
        return getTabState(tabId).then((tabState): Msg => {
          if (tabState?.state === 'loading' && tabState.query && !inFlightTabs.has(tabId)) {
            dbg('pipeline', 'resuming lookup interrupted by a worker restart');
            handleTitleDetected(tabState.query, tabId).catch((err) =>
              console.error('Ratearr: pipeline error', err),
            );
          }
          return {
            kind: 'panel-data',
            data: tabState?.data ?? null,
            state: tabState?.state ?? 'idle',
          };
        });
      }

      if (msg.kind === 'select-alternative') {
        if (typeof msg.tabId !== 'number' || typeof msg.tmdbId !== 'number') return undefined;
        if (msg.mediaType != null && msg.mediaType !== 'movie' && msg.mediaType !== 'tv')
          return undefined;
        const tabId = msg.tabId;
        const query: TitleQuery = {
          title: '',
          ids: { tmdb: msg.tmdbId },
          mediaType: (msg.mediaType as TitleQuery['mediaType']) ?? 'movie',
          sourceSite: 'alternative',
        };
        getTabState(tabId)
          .then((tabState) => handleTitleDetected(query, tabId, tabState?.data?.candidates))
          .catch((err) => console.error('Ratearr: pipeline error', err));
        return undefined;
      }

      if (msg.kind === 'refresh') {
        if (typeof msg.tabId !== 'number') return undefined;
        const tabId = msg.tabId;
        getTabState(tabId)
          .then((tabState) => {
            const resolved = tabState?.data?.resolved;
            if (!resolved) return;
            const query: TitleQuery = {
              title: resolved.title,
              year: resolved.year,
              mediaType: resolved.mediaType,
              ids: { tmdb: resolved.tmdbId, imdb: resolved.imdbId },
              sourceSite: 'refresh',
            };
            return handleTitleDetected(query, tabId, tabState.data?.candidates, true);
          })
          .catch((err) => console.error('Ratearr: pipeline error', err));
        return undefined;
      }

      return undefined;
    },
  );

  browser.tabs.onRemoved.addListener((tabId) => {
    deleteTabState(tabId);
    tabGenerations.delete(tabId);
    inFlightTabs.delete(tabId);
  });
});
