import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['storage', 'activeTab', 'contextMenus'],
    icons: {
      16: 'icon/icon-16.png',
      32: 'icon/icon-32.png',
      48: 'icon/icon-48.png',
      128: 'icon/icon-128.png',
    },
    host_permissions: [
      'https://api.themoviedb.org/*',
      'https://www.omdbapi.com/*',
      'https://www.allocine.fr/*',
    ],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'ratearr@davidaparicio.fr',
          strict_min_version: '121.0',
          data_collection_permissions: {
            required: false,
            disclosure: {
              data_categories: ['technical', 'interaction'],
            },
          },
        },
      },
    }),
  }),
});
