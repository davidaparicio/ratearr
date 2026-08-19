import { getSettings } from './settings';

export async function applyTheme(): Promise<void> {
  const { theme } = await getSettings();
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}
