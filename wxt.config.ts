import { defineConfig } from 'wxt';

export default defineConfig({
  suppressWarnings: { firefoxDataCollection: true },
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['storage', 'activeTab', 'contextMenus'],
    icons: {
      16: 'icon/icon-16.svg',
      32: 'icon/icon-32.svg',
      48: 'icon/icon-48.svg',
      128: 'icon/icon-128.svg',
    },
    host_permissions: [
      'https://api.themoviedb.org/*',
      'https://www.omdbapi.com/*',
      'https://www.allocine.fr/*',
    ],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'ratearr@davidaparicio.github.io',
          strict_min_version: '121.0',
        },
      },
    }),
  }),
});
