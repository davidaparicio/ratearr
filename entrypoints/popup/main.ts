import { applyI18n, t } from '../../utils/i18n';
import type { RatingsPanelData, RatingResult } from '../../utils/types';
import type { Msg, PanelState } from '../../utils/messages';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w92';

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

  const response = await browser.runtime.sendMessage({
    kind: 'get-panel-data',
    tabId: tab.id,
  } as Msg) as Msg;

  if (response?.kind === 'panel-data') {
    render(app, response.state, response.data, tab.id);
  } else {
    renderNoTitle(app);
  }
}

function render(app: HTMLElement, state: PanelState, data: RatingsPanelData | null, tabId: number) {
  if (state === 'loading') {
    renderLoading(app);
    setTimeout(() => init(), 1000);
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

function renderPanel(app: HTMLElement, data: RatingsPanelData, tabId: number) {
  app.innerHTML = '';

  // Header with title + poster
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
  app.appendChild(header);

  // Aggregate score
  if (data.aggregate) {
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
    app.appendChild(aggRow);
  }

  // Ratings list
  const list = document.createElement('div');
  list.className = 'ratings-list';

  for (const result of data.results) {
    const row = document.createElement('div');
    row.className = 'rating-row';

    if (result.status === 'ok') {
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
    } else {
      row.classList.add('unavailable');
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
    }

    list.appendChild(row);
  }

  app.appendChild(list);

  // Refresh button
  const actions = document.createElement('div');
  actions.className = 'actions';
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = t('popup_refresh');
  refreshBtn.addEventListener('click', () => {
    browser.runtime.sendMessage({ kind: 'refresh', tabId } as Msg);
    renderLoading(app);
    setTimeout(() => init(), 1500);
  });
  actions.appendChild(refreshBtn);

  if (data.fromCache) {
    const cacheNote = document.createElement('span');
    cacheNote.className = 'cache-note';
    const age = Math.round((Date.now() - data.fetchedAt) / 3600000);
    cacheNote.textContent = age > 0 ? `cached ${age}h ago` : 'cached';
    actions.appendChild(cacheNote);
  }

  app.appendChild(actions);
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

applyI18n(document);
init();
