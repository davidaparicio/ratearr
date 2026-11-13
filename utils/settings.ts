import type { SourceId } from './types';

export interface Settings {
  enabledSources: Record<SourceId, boolean>;
  sourceWeights: Partial<Record<SourceId, number>>;
  theme: 'auto' | 'light' | 'dark';
  badgeGreenMin: number;
  badgeYellowMin: number;
  tmdbApiKey: string;
  omdbApiKey: string;
  cacheTtlHours: number;
  debug?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabledSources: {
    tmdb: true,
    imdb: true,
    rottentomatoes: true,
    metacritic: true,
    'allocine-presse': true,
    'allocine-spectateurs': true,
    senscritique: true,
    letterboxd: true,
    telerama: false,
    'telerama-abonnes': false,
  },
  sourceWeights: {},
  theme: 'auto',
  badgeGreenMin: 7,
  badgeYellowMin: 5,
  tmdbApiKey: '',
  omdbApiKey: '',
  cacheTtlHours: 24,
};

const SOURCE_IDS = Object.keys(DEFAULT_SETTINGS.enabledSources) as SourceId[];
const THEMES: readonly Settings['theme'][] = ['auto', 'light', 'dark'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberIn(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined;
}

/**
 * Keeps only known, well-typed, in-range fields from untrusted settings (an
 * imported file, or storage written by another version), so a bad value can't
 * break the pipeline later.
 */
export function sanitizeSettings(raw: unknown): Partial<Settings> {
  if (!isRecord(raw)) return {};
  const out: Partial<Settings> = {};

  if (isRecord(raw.enabledSources)) {
    const enabled: Partial<Record<SourceId, boolean>> = {};
    for (const id of SOURCE_IDS) {
      const flag = raw.enabledSources[id];
      if (typeof flag === 'boolean') enabled[id] = flag;
    }
    out.enabledSources = enabled as Settings['enabledSources'];
  }
  if (isRecord(raw.sourceWeights)) {
    const weights: Partial<Record<SourceId, number>> = {};
    for (const id of SOURCE_IDS) {
      const weight = numberIn(raw.sourceWeights[id], 0, 10);
      if (weight != null) weights[id] = weight;
    }
    out.sourceWeights = weights;
  }
  if (THEMES.includes(raw.theme as Settings['theme'])) out.theme = raw.theme as Settings['theme'];
  const green = numberIn(raw.badgeGreenMin, 0, 10);
  if (green != null) out.badgeGreenMin = green;
  const yellow = numberIn(raw.badgeYellowMin, 0, 10);
  if (yellow != null) out.badgeYellowMin = yellow;
  if (typeof raw.tmdbApiKey === 'string') out.tmdbApiKey = raw.tmdbApiKey;
  if (typeof raw.omdbApiKey === 'string') out.omdbApiKey = raw.omdbApiKey;
  const ttl = numberIn(raw.cacheTtlHours, 1, 168);
  if (ttl != null) out.cacheTtlHours = ttl;
  if (typeof raw.debug === 'boolean') out.debug = raw.debug;

  return out;
}

/** Overlays `patch` on `base`; enabledSources is merged per source so a partial map keeps the rest. */
function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
  return {
    ...base,
    ...patch,
    enabledSources: { ...base.enabledSources, ...patch.enabledSources },
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get('settings');
  return mergeSettings(DEFAULT_SETTINGS, sanitizeSettings(stored.settings));
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await browser.storage.sync.set({ settings: mergeSettings(current, sanitizeSettings(settings)) });
}

function parseThreshold(raw: string, fallback: number): number {
  const value = parseFloat(raw);
  // `|| fallback` would also replace a legitimate 0
  return Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : fallback;
}

/** Badge thresholds from the options form, kept in 0–10 with green ≥ yellow. */
export function parseBadgeThresholds(
  greenRaw: string,
  yellowRaw: string,
): Pick<Settings, 'badgeGreenMin' | 'badgeYellowMin'> {
  const green = parseThreshold(greenRaw, DEFAULT_SETTINGS.badgeGreenMin);
  const yellow = parseThreshold(yellowRaw, DEFAULT_SETTINGS.badgeYellowMin);
  return { badgeGreenMin: Math.max(green, yellow), badgeYellowMin: Math.min(green, yellow) };
}

const STANDARD_WEIGHTS = [0.5, 1, 1.5, 2];

/** Weights offered for a source; includes `current` so an imported value isn't lost on save. */
export function weightChoices(current: number): number[] {
  if (STANDARD_WEIGHTS.includes(current)) return STANDARD_WEIGHTS;
  return [...STANDARD_WEIGHTS, current].sort((a, b) => a - b);
}
