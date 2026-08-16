import type { SourceId } from './types';

export interface Settings {
  enabledSources: Record<SourceId, boolean>;
  tmdbApiKey: string;
  omdbApiKey: string;
  cacheTtlHours: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabledSources: {
    tmdb: true,
    imdb: true,
    rottentomatoes: true,
    metacritic: true,
    'allocine-presse': true,
    'allocine-spectateurs': true,
  },
  tmdbApiKey: '',
  omdbApiKey: '',
  cacheTtlHours: 24,
};

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get('settings');
  if (!stored.settings) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings>) };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await browser.storage.sync.set({ settings: { ...current, ...settings } });
}
