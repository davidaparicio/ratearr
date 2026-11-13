import type { Browser } from 'wxt/browser';
import {
  getEnabledProviders,
  keepEnabledSources,
  mergeResults,
  providersToRefetch,
  unavailableResults,
} from '../providers/registry';
import { fetchWatchProviders, resolveTitle } from '../providers/tmdb';
import type { RatingProvider } from '../providers/types';
import { aggregate } from '../utils/aggregate';
import { getCached, putCached } from '../utils/cache';
import { buildCandidates } from '../utils/candidates';
import { dbg, setDebug } from '../utils/debug';
import type { Msg } from '../utils/messages';
import { getSettings, type Settings } from '../utils/settings';
import { deleteTabState, getTabState, setTabState, type TabState } from '../utils/tab-state';
import type {
  RatingResult,
  RatingsPanelData,
  ResolvedTitle,
  TitleCandidate,
  TitleQuery,
} from '../utils/types';

const PROVIDER_TIMEOUT_MS = 8000;
const MAX_SELECTION_LENGTH = 200;

// MV2 (Firefox) uses browserAction; MV3 (Chrome) uses action
const browserAction = browser.action ?? browser.browserAction;

const tabGenerations = new Map<number, number>();
// Tabs with a lookup running in this worker instance; a stored 'loading' state
// for any other tab was interrupted by a worker restart.
const inFlightTabs = new Set<number>();
// One fetch per provider and title at a time, shared by every lookup that needs
// it (several tabs, or a full fetch and a cache top-up). Results are unfiltered;
// each caller filters them by its own settings.
const inFlightProviders = new Map<string, Promise<RatingResult[]>>();

function fetchProviderOnce(
  provider: RatingProvider,
  resolved: ResolvedTitle,
  settings: Settings,
): Promise<RatingResult[]> {
  const key = `${provider.id}:${resolved.mediaType}:${resolved.tmdbId}`;
  let promise = inFlightProviders.get(key);
  if (!promise) {
    promise = withTimeout(PROVIDER_TIMEOUT_MS, provider.fetchRatings(resolved, settings)).finally(
      () => inFlightProviders.delete(key),
    );
    inFlightProviders.set(key, promise);
  }
  return promise;
}

async function fetchFromProviders(
  resolved: ResolvedTitle,
  settings: Settings,
  providers = getEnabledProviders(settings),
): Promise<RatingResult[]> {
  const allResults: RatingResult[] = [];

  const settled = await Promise.allSettled(
    providers.map(async (p) => {
      if (!p.isConfigured(settings)) {
        return unavailableResults(p, 'err_no_key');
      }
      return fetchProviderOnce(p, resolved, settings);
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

interface LookupOptions {
  /** "Did you mean?" list to keep stable when switching between candidates. */
  previousCandidates?: TitleCandidate[];
  bypassCache?: boolean;
  /** This lookup resumes one interrupted by a worker restart. */
  resumed?: boolean;
}

async function handleTitleDetected(
  query: TitleQuery,
  tabId: number,
  { previousCandidates, bypassCache = false, resumed = false }: LookupOptions = {},
) {
  const gen = (tabGenerations.get(tabId) ?? 0) + 1;
  tabGenerations.set(tabId, gen);
  inFlightTabs.add(tabId);

  // Every state write goes through here: once a newer lookup has started for
  // this tab, this one must not touch its state or badge. The check and the
  // (synchronous, in-memory) write happen together, after all of our awaits.
  let settings: Settings | undefined;
  const publish = async (state: TabState['state'], data: RatingsPanelData | null = null) => {
    if (tabGenerations.get(tabId) !== gen) return;
    const done = setTabState(tabId, { state, data, query, resumed });
    if (state === 'loading') showLoadingBadge(tabId);
    else updateBadge(tabId, data?.aggregate, settings?.badgeGreenMin, settings?.badgeYellowMin);
    await done;
  };

  try {
    await publish('loading');

    settings = await getSettings();
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
      await publish('error');
      return;
    }
    // A newer lookup started for this tab while resolving; its result wins.
    if (tabGenerations.get(tabId) !== gen) return;
    if (!resolution) {
      dbg('pipeline', 'no resolution found');
      await publish('not-found');
      return;
    }

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
      // Settings may have changed since this was cached: fetch only what it lacks.
      const missing = providersToRefetch(cached.results, settings);
      if (missing.length > 0) {
        dbg(
          'pipeline',
          'cache top-up',
          missing.map((p) => p.id),
        );
        const fresh = await fetchFromProviders(resolved, settings, missing);
        if (tabGenerations.get(tabId) !== gen) return;
        cached.results = mergeResults(cached.results, fresh);
        // Keeps the original fetchedAt, so topping up doesn't extend the TTL.
        await putCachedSafely(resolved.mediaType, resolved.tmdbId, { ...cached, fromCache: false });
      }
      const results = keepEnabledSources(cached.results, settings);
      const panelData = {
        ...cached,
        results,
        aggregate: aggregate(results, settings.sourceWeights),
        alternatives,
        candidates,
        fromCache: true,
      };
      await publish('ready', panelData);
      return;
    }

    // Independent of the ratings, so fetch it alongside rather than after them.
    const watchProvidersPromise = fetchWatchProviders(resolved, settings).catch(() => undefined);

    const allResults = await fetchFromProviders(resolved, settings);

    if (tabGenerations.get(tabId) !== gen) return;

    const agg = aggregate(allResults, settings.sourceWeights);

    const watchProviders = await watchProvidersPromise;

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

    // Failed sources are cached too; the next cache hit retries just those.
    await putCachedSafely(resolved.mediaType, resolved.tmdbId, panelData);
    await publish('ready', panelData);
  } catch (err) {
    // Anything unexpected (storage, settings) must not leave the tab "loading",
    // which the popup would otherwise keep waiting on or resuming.
    console.error('Ratearr: pipeline error', err);
    await publish('error').catch(() => {});
  } finally {
    // A newer lookup for this tab may still be running; let it clear the flag.
    if (tabGenerations.get(tabId) === gen) inFlightTabs.delete(tabId);
  }
}

/**
 * The tab moved on to a page without a (detected) title: forget what was shown
 * and invalidate any lookup still running for the previous page.
 */
function clearTab(tabId: number) {
  tabGenerations.set(tabId, (tabGenerations.get(tabId) ?? 0) + 1);
  inFlightTabs.delete(tabId);
  deleteTabState(tabId);
  updateBadge(tabId, undefined);
}

/** The cache is an optimisation: failing to write it (e.g. storage full) mustn't fail the lookup. */
async function putCachedSafely(...args: Parameters<typeof putCached>): Promise<void> {
  try {
    await putCached(...args);
  } catch (err) {
    console.warn('Ratearr: cache write failed', err);
  }
}

function showLoadingBadge(tabId: number) {
  browserAction.setBadgeText({ tabId, text: '...' });
  browserAction.setBadgeBackgroundColor({ tabId, color: '#6366f1' });
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
      // Selections can span lines or paragraphs; no title is longer than this.
      title: info.selectionText.replace(/\s+/g, ' ').trim().slice(0, MAX_SELECTION_LENGTH).trim(),
      ids: {},
      sourceSite: 'context-menu',
    };
    handleTitleDetected(query, tab.id).catch((err) =>
      console.error('Ratearr: pipeline error', err),
    );
    // Unsupported on older browsers, and may reject (e.g. no user gesture).
    Promise.resolve()
      .then(() => browserAction.openPopup?.())
      .catch(() => {});
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

      if (msg.kind === 'title-cleared' && sender.tab?.id != null) {
        clearTab(sender.tab.id);
        return undefined;
      }

      if (msg.kind === 'get-panel-data') {
        if (typeof msg.tabId !== 'number') return undefined;
        const tabId = msg.tabId;
        return getTabState(tabId).then((tabState): Msg => {
          const interrupted =
            tabState?.state === 'loading' && tabState.query && !inFlightTabs.has(tabId);
          if (interrupted && tabState.resumed) {
            // Already resumed once and interrupted again: report it rather than loop.
            return { kind: 'panel-data', data: null, state: 'error' };
          }
          if (interrupted) {
            dbg('pipeline', 'resuming lookup interrupted by a worker restart');
            handleTitleDetected(tabState.query!, tabId, { resumed: true }).catch((err) =>
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
          .then((tabState) =>
            handleTitleDetected(query, tabId, { previousCandidates: tabState?.data?.candidates }),
          )
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
            return handleTitleDetected(query, tabId, {
              previousCandidates: tabState.data?.candidates,
              bypassCache: true,
            });
          })
          .catch((err) => console.error('Ratearr: pipeline error', err));
        return undefined;
      }

      return undefined;
    },
  );

  // A new document is loading in the tab. (changeInfo.url would need the "tabs"
  // permission; in-site navigations are reported by the content script instead.)
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') clearTab(tabId);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    deleteTabState(tabId);
    tabGenerations.delete(tabId);
    inFlightTabs.delete(tabId);
  });
});
