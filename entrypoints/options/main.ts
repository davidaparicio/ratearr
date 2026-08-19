import { clearCache } from '../../utils/cache';
import { applyI18n, t } from '../../utils/i18n';
import { DEFAULT_SETTINGS, getSettings, type Settings, saveSettings } from '../../utils/settings';
import type { SourceId } from '../../utils/types';

const SOURCE_IDS: { id: SourceId; labelKey: string }[] = [
  { id: 'tmdb', labelKey: 'source_tmdb' },
  { id: 'imdb', labelKey: 'source_imdb' },
  { id: 'rottentomatoes', labelKey: 'source_rottentomatoes' },
  { id: 'metacritic', labelKey: 'source_metacritic' },
  { id: 'allocine-presse', labelKey: 'source_allocine_presse' },
  { id: 'allocine-spectateurs', labelKey: 'source_allocine_spectateurs' },
  { id: 'senscritique', labelKey: 'source_senscritique' },
  { id: 'letterboxd', labelKey: 'source_letterboxd' },
  { id: 'telerama', labelKey: 'source_telerama' },
  { id: 'telerama-abonnes', labelKey: 'source_telerama_abonnes' },
];

async function init() {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  const settings = await getSettings();

  // Title
  const title = document.createElement('h1');
  title.textContent = t('options_title');
  app.appendChild(title);

  // Sources section
  const sourcesSection = createSection(t('options_sources'));
  for (const src of SOURCE_IDS) {
    const row = document.createElement('div');
    row.className = 'option-row';
    const lbl = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = settings.enabledSources[src.id];
    cb.dataset.source = src.id;
    lbl.appendChild(cb);
    const span = document.createElement('span');
    span.textContent = t(src.labelKey);
    lbl.appendChild(span);
    row.appendChild(lbl);

    const weight = document.createElement('select');
    weight.className = 'weight-select';
    weight.dataset.weightSource = src.id;
    for (const w of [0.5, 1, 1.5, 2]) {
      const opt = document.createElement('option');
      opt.value = String(w);
      opt.textContent = `×${w}`;
      opt.selected = (settings.sourceWeights[src.id] ?? 1) === w;
      weight.appendChild(opt);
    }
    row.appendChild(weight);
    sourcesSection.appendChild(row);
  }
  app.appendChild(sourcesSection);

  // API Keys section
  const keysSection = createSection(t('options_apiKeys'));

  const tmdbRow = createKeyInput(
    'TMDB',
    settings.tmdbApiKey,
    'tmdb-key',
    'https://www.themoviedb.org/settings/api',
  );
  keysSection.appendChild(tmdbRow);

  const omdbRow = createKeyInput(
    'OMDb',
    settings.omdbApiKey,
    'omdb-key',
    'https://www.omdbapi.com/apikey.aspx',
  );
  keysSection.appendChild(omdbRow);

  app.appendChild(keysSection);

  // Cache section
  const cacheSection = createSection(t('options_cache'));

  const ttlRow = document.createElement('div');
  ttlRow.className = 'option-row';
  const ttlLabel = document.createElement('label');
  ttlLabel.textContent = t('options_cacheTtl');
  ttlLabel.htmlFor = 'cache-ttl';
  ttlRow.appendChild(ttlLabel);
  const ttlInput = document.createElement('input');
  ttlInput.type = 'number';
  ttlInput.id = 'cache-ttl';
  ttlInput.min = '1';
  ttlInput.max = '168';
  ttlInput.value = String(settings.cacheTtlHours);
  ttlRow.appendChild(ttlInput);
  cacheSection.appendChild(ttlRow);

  const clearBtn = document.createElement('button');
  clearBtn.textContent = t('options_clearCache');
  clearBtn.addEventListener('click', async () => {
    await clearCache();
    clearBtn.textContent = '✓';
    setTimeout(() => {
      clearBtn.textContent = t('options_clearCache');
    }, 1500);
  });
  cacheSection.appendChild(clearBtn);

  app.appendChild(cacheSection);

  // Badge section
  const badgeSection = createSection(t('options_badge'));

  const greenRow = document.createElement('div');
  greenRow.className = 'option-row';
  const greenLabel = document.createElement('label');
  greenLabel.htmlFor = 'badge-green';
  greenLabel.textContent = t('options_badgeGreen');
  greenRow.appendChild(greenLabel);
  const greenInput = document.createElement('input');
  greenInput.type = 'number';
  greenInput.id = 'badge-green';
  greenInput.min = '0';
  greenInput.max = '10';
  greenInput.step = '0.5';
  greenInput.value = String(settings.badgeGreenMin);
  greenRow.appendChild(greenInput);
  badgeSection.appendChild(greenRow);

  const yellowRow = document.createElement('div');
  yellowRow.className = 'option-row';
  const yellowLabel = document.createElement('label');
  yellowLabel.htmlFor = 'badge-yellow';
  yellowLabel.textContent = t('options_badgeYellow');
  yellowRow.appendChild(yellowLabel);
  const yellowInput = document.createElement('input');
  yellowInput.type = 'number';
  yellowInput.id = 'badge-yellow';
  yellowInput.min = '0';
  yellowInput.max = '10';
  yellowInput.step = '0.5';
  yellowInput.value = String(settings.badgeYellowMin);
  yellowRow.appendChild(yellowInput);
  badgeSection.appendChild(yellowRow);

  app.appendChild(badgeSection);

  // Backup section
  const backupSection = createSection(t('options_backup'));

  const exportBtn = document.createElement('button');
  exportBtn.textContent = t('options_export');
  exportBtn.addEventListener('click', async () => {
    const current = await getSettings();
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ratearr-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  backupSection.appendChild(exportBtn);

  const importBtn = document.createElement('button');
  importBtn.textContent = t('options_import');
  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as Partial<Settings>;
        await saveSettings(imported);
        init();
      } catch {
        alert(t('options_importError'));
      }
    });
    input.click();
  });
  backupSection.appendChild(importBtn);

  app.appendChild(backupSection);

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', async () => {
    const newSettings: Partial<Settings> = {
      enabledSources: { ...DEFAULT_SETTINGS.enabledSources },
      cacheTtlHours: Math.min(168, Math.max(1, parseInt(ttlInput.value, 10) || 24)),
    };

    const checkboxes = app.querySelectorAll<HTMLInputElement>('input[data-source]');
    for (const cb of checkboxes) {
      newSettings.enabledSources![cb.dataset.source as SourceId] = cb.checked;
    }

    const weights: Partial<Record<SourceId, number>> = {};
    const selects = app.querySelectorAll<HTMLSelectElement>('select[data-weight-source]');
    for (const sel of selects) {
      const w = parseFloat(sel.value);
      if (w !== 1) weights[sel.dataset.weightSource as SourceId] = w;
    }
    newSettings.sourceWeights = weights;
    newSettings.badgeGreenMin = Math.max(0, Math.min(10, parseFloat(greenInput.value) || 7));
    newSettings.badgeYellowMin = Math.max(0, Math.min(10, parseFloat(yellowInput.value) || 5));

    const tmdbInput = document.getElementById('tmdb-key') as HTMLInputElement;
    const omdbInput = document.getElementById('omdb-key') as HTMLInputElement;
    newSettings.tmdbApiKey = tmdbInput.value.trim();
    newSettings.omdbApiKey = omdbInput.value.trim();

    await saveSettings(newSettings);
    const msg = document.createElement('span');
    msg.className = 'save-msg';
    msg.textContent = t('options_saved');
    saveBtn.after(msg);
    setTimeout(() => msg.remove(), 2000);
  });
  app.appendChild(saveBtn);
}

function createSection(title: string): HTMLElement {
  const section = document.createElement('section');
  const h2 = document.createElement('h2');
  h2.textContent = title;
  section.appendChild(h2);
  return section;
}

function createKeyInput(label: string, value: string, id: string, signupUrl: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'key-row';

  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const input = document.createElement('input');
  input.type = 'password';
  input.id = id;
  input.value = value;
  input.placeholder = 'Enter API key';
  row.appendChild(input);

  const link = document.createElement('a');
  link.href = signupUrl;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Get key';
  link.className = 'key-link';
  row.appendChild(link);

  return row;
}

applyI18n(document);
init();
