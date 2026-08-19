import { applyI18n, t } from '../../utils/i18n';
import type { Msg, PanelState } from '../../utils/messages';
import type { RatingResult, RatingsPanelData } from '../../utils/types';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w92';

let pollTimer: ReturnType<typeof setTimeout> | null = null;

const SOURCE_LABELS: Record<string, string> = {
  tmdb: 'source_tmdb',
  imdb: 'source_imdb',
  rottentomatoes: 'source_rottentomatoes',
  metacritic: 'source_metacritic',
  'allocine-presse': 'source_allocine_presse',
  'allocine-spectateurs': 'source_allocine_spectateurs',
};

async function init() {
  const app = document.getElementById('app')!;

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    renderNoTitle(app);
    return;
  }

  renderLoading(app);

  const response = (await browser.runtime.sendMessage({
    kind: 'get-panel-data',
    tabId: tab.id,
  } as Msg)) as Msg;

  if (response?.kind === 'panel-data') {
    render(app, response.state, response.data, tab.id);
  } else {
    renderNoTitle(app);
  }
}

let pollCount = 0;
const MAX_POLL = 15;

function render(app: HTMLElement, state: PanelState, data: RatingsPanelData | null, tabId: number) {
  if (state === 'loading') {
    if (pollCount >= MAX_POLL) {
      renderError(app);
      return;
    }
    pollCount++;
    renderLoading(app);
    clearTimeout(pollTimer!);
    pollTimer = setTimeout(() => init(), 1000);
    return;
  }
  pollCount = 0;
  if (state === 'error') {
    renderError(app);
    return;
  }
  if (state === 'not-found') {
    renderNotFound(app);
    return;
  }
  if (state === 'no-title' || state === 'idle' || !data) {
    renderNoTitle(app);
    return;
  }
  renderPanel(app, data, tabId);
}

function renderNoTitle(app: HTMLElement) {
  app.innerHTML = '';
  const h = document.createElement('h1');
  h.textContent = 'Ratearr';
  app.appendChild(h);
  const p = document.createElement('p');
  p.id = 'status';
  p.textContent = t('popup_noTitle');
  app.appendChild(p);
}

function renderLoading(app: HTMLElement) {
  app.innerHTML = '';
  const h = document.createElement('h1');
  h.textContent = 'Ratearr';
  app.appendChild(h);
  const p = document.createElement('p');
  p.id = 'status';
  p.textContent = t('popup_loading');
  app.appendChild(p);
}

function renderError(app: HTMLElement) {
  app.innerHTML = '';
  const h = document.createElement('h1');
  h.textContent = 'Ratearr';
  app.appendChild(h);
  const p = document.createElement('p');
  p.id = 'status';
  p.className = 'error';
  p.textContent = t('popup_error');
  app.appendChild(p);
  const link = document.createElement('a');
  link.href = '#';
  link.className = 'options-link';
  link.textContent = t('popup_openSettings');
  link.addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
  app.appendChild(link);
}

function renderNotFound(app: HTMLElement) {
  app.innerHTML = '';
  const h = document.createElement('h1');
  h.textContent = 'Ratearr';
  app.appendChild(h);
  const p = document.createElement('p');
  p.id = 'status';
  p.textContent = t('popup_notFound');
  app.appendChild(p);
}

function renderPanel(app: HTMLElement, data: RatingsPanelData, tabId: number) {
  app.innerHTML = '';
  app.appendChild(renderHeader(data));
  const agg = renderAggregate(data);
  if (agg) app.appendChild(agg);
  app.appendChild(renderRatingsList(data));
  const insight = renderInsight(data);
  if (insight) app.appendChild(insight);
  const alts = renderAlternatives(data, tabId, app);
  if (alts) app.appendChild(alts);
  app.appendChild(renderActions(data, tabId, app));
}

function renderHeader(data: RatingsPanelData): HTMLElement {
  const header = document.createElement('div');
  header.className = 'panel-header';

  if (data.resolved.posterPath) {
    const img = document.createElement('img');
    img.src = `${TMDB_IMG_BASE}${data.resolved.posterPath}`;
    img.alt = data.resolved.title;
    img.className = 'poster';
    img.width = 46;
    img.height = 69;
    header.appendChild(img);
  }

  const titleBlock = document.createElement('div');
  titleBlock.className = 'title-block';
  const titleEl = document.createElement('h1');
  titleEl.textContent = data.resolved.title;
  titleBlock.appendChild(titleEl);
  if (data.resolved.year) {
    const yearEl = document.createElement('span');
    yearEl.className = 'year';
    yearEl.textContent = String(data.resolved.year);
    titleBlock.appendChild(yearEl);
  }
  header.appendChild(titleBlock);
  return header;
}

function renderAggregate(data: RatingsPanelData): HTMLElement | null {
  if (!data.aggregate) return null;
  const aggRow = document.createElement('div');
  aggRow.className = 'aggregate';
  const scoreEl = document.createElement('span');
  scoreEl.className = 'agg-score';
  scoreEl.textContent = data.aggregate.value.toFixed(1);
  aggRow.appendChild(scoreEl);
  const metaEl = document.createElement('span');
  metaEl.className = 'agg-meta';
  metaEl.textContent = ` / 10 · ${t('popup_sources', String(data.aggregate.sourcesUsed))}`;
  aggRow.appendChild(metaEl);
  return aggRow;
}

function renderRatingsList(data: RatingsPanelData): HTMLElement {
  const list = document.createElement('div');
  list.className = 'ratings-list';
  for (const result of data.results) {
    list.appendChild(
      result.status === 'ok' ? renderOkRatingRow(result) : renderUnavailableRatingRow(result),
    );
  }
  return list;
}

function renderOkRatingRow(result: Extract<RatingResult, { status: 'ok' }>): HTMLElement {
  const row = document.createElement('div');
  row.className = 'rating-row';

  const label = document.createElement('span');
  label.className = 'source-label';
  label.textContent = t(SOURCE_LABELS[result.rating.source] || result.rating.source);
  row.appendChild(label);

  const value = document.createElement('span');
  value.className = 'rating-value';
  value.textContent = `${result.rating.value} / ${result.rating.scale}`;
  row.appendChild(value);

  if (result.rating.count != null) {
    const count = document.createElement('span');
    count.className = 'rating-count';
    count.textContent = `(${formatCount(result.rating.count)})`;
    row.appendChild(count);
  }

  if (result.rating.url) {
    const link = document.createElement('a');
    link.href = result.rating.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'source-link';
    link.textContent = '↗';
    row.appendChild(link);
  }

  return row;
}

function renderUnavailableRatingRow(
  result: Extract<RatingResult, { status: 'unavailable' }>,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'rating-row unavailable';

  const label = document.createElement('span');
  label.className = 'source-label';
  label.textContent = t(SOURCE_LABELS[result.source] || result.source);
  row.appendChild(label);

  const reason = document.createElement('span');
  reason.className = 'rating-reason';
  reason.textContent = t(result.reasonKey);
  row.appendChild(reason);

  if (result.reasonKey === 'err_no_key') {
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'options-link';
    link.textContent = '⚙';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      browser.runtime.openOptionsPage();
    });
    row.appendChild(link);
  }

  return row;
}

function renderInsight(data: RatingsPanelData): HTMLElement | null {
  const presse = data.results.find(
    (r) => r.status === 'ok' && r.rating.source === 'allocine-presse',
  );
  const spectateurs = data.results.find(
    (r) => r.status === 'ok' && r.rating.source === 'allocine-spectateurs',
  );
  if (
    presse?.status === 'ok' &&
    spectateurs?.status === 'ok' &&
    spectateurs.rating.value > presse.rating.value
  ) {
    const el = document.createElement('div');
    el.className = 'insight';
    el.textContent = `★ ${t('popup_audienceFavorite')}`;
    return el;
  }
  return null;
}

function renderAlternatives(
  data: RatingsPanelData,
  tabId: number,
  app: HTMLElement,
): HTMLElement | null {
  if (!data.alternatives || data.alternatives.length === 0) return null;

  const section = document.createElement('div');
  section.className = 'alternatives';
  const header = document.createElement('div');
  header.className = 'alt-header';
  header.textContent = t('popup_didYouMean');
  section.appendChild(header);

  for (const alt of data.alternatives) {
    const row = document.createElement('button');
    row.className = 'alt-row';
    row.addEventListener('click', () => {
      browser.runtime
        .sendMessage({
          kind: 'select-alternative',
          tabId,
          tmdbId: alt.tmdbId,
          mediaType: alt.mediaType,
        } as Msg)
        .catch(() => {});
      renderLoading(app);
      clearTimeout(pollTimer!);
      pollTimer = setTimeout(() => init(), 1500);
    });

    if (alt.posterPath) {
      const thumb = document.createElement('img');
      thumb.src = `${TMDB_IMG_BASE}${alt.posterPath}`;
      thumb.alt = alt.title;
      thumb.className = 'alt-poster';
      thumb.width = 24;
      thumb.height = 36;
      row.appendChild(thumb);
    }

    const info = document.createElement('span');
    info.className = 'alt-info';
    info.textContent = alt.title + (alt.year ? ` (${alt.year})` : '');
    row.appendChild(info);

    section.appendChild(row);
  }

  return section;
}

function renderActions(data: RatingsPanelData, tabId: number, app: HTMLElement): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'actions';
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = t('popup_refresh');
  refreshBtn.addEventListener('click', () => {
    browser.runtime.sendMessage({ kind: 'refresh', tabId } as Msg).catch(() => {});
    renderLoading(app);
    clearTimeout(pollTimer!);
    pollTimer = setTimeout(() => init(), 1500);
  });
  actions.appendChild(refreshBtn);

  if (data.fromCache) {
    const cacheNote = document.createElement('span');
    cacheNote.className = 'cache-note';
    const age = Math.round((Date.now() - data.fetchedAt) / 3600000);
    cacheNote.textContent = age > 0 ? `cached ${age}h ago` : 'cached';
    actions.appendChild(cacheNote);
  }

  return actions;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

applyI18n(document);
init();
