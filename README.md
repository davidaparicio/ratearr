# Ratearr

A browser extension that aggregates movie and TV show ratings from multiple sources into a single view. Browse IMDb, Allociné, or TMDB and see a unified rating badge without leaving the page.

## Features

- **Automatic detection** on IMDb, Allociné, and TMDB movie/TV pages
- **Right-click lookup** — select any title text and get ratings via the context menu
- **6 rating sources** — TMDB, IMDb, Rotten Tomatoes, Metacritic, Allociné Presse, Allociné Spectateurs
- **Aggregated score** displayed as a color-coded badge on the extension icon
- **"Did you mean?" disambiguation** with bilingual TMDB search
- **Audience vs. critics insight** — flags when Allociné audience rates higher than critics
- **Configurable** — enable/disable individual sources, set cache TTL, manage API keys
- **Bilingual** — English and French (i18n via `_locales`)
- **Cross-browser** — Chrome, Firefox, Edge, Opera, Safari (via [WXT](https://wxt.dev/))

## Getting Started

### Prerequisites

- Node.js (LTS recommended)
- A [TMDB API key](https://www.themoviedb.org/settings/api) (required for title resolution)
- An [OMDb API key](https://www.omdbapi.com/apikey.aspx) (optional, for IMDb/RT/Metacritic ratings)

### Install dependencies

```bash
npm install
```

### Configure API keys

Copy the example env file and add your keys:

```bash
cp .env.example .env.local
```

Then enter your `TMDB_API_KEY` and `OMDB_API_KEY`. You can also set them later in the extension's options page.

### Development

```bash
npm run dev            # Chrome with hot reload
npm run dev:firefox    # Firefox with hot reload
```

### Build

WXT supports 5 browsers out of the box. Use the `-b` flag to target a specific browser:

| Browser | Build | Zip | Manifest |
|---------|-------|-----|----------|
| **Chrome** (default) | `npm run build` | `npm run zip` | MV3 |
| **Firefox** | `npm run build:firefox` | `npm run zip:firefox` | MV2 |
| **Edge** | `npx wxt build -b edge` | `npx wxt zip -b edge` | MV3 |
| **Opera** | `npx wxt build -b opera` | `npx wxt zip -b opera` | MV3 |
| **Safari** | `npx wxt build -b safari` | `npx wxt zip -b safari` | MV2 |

You can also force a manifest version with `--mv2` or `--mv3` (e.g., `npx wxt build -b firefox --mv3`).

Safari requires an extra step after building: convert the output with Xcode's `xcrun safari-web-extension-converter` to create a macOS/iOS app wrapper.

### Tests

```bash
npm test               # Run tests once
npm run test:watch     # Watch mode
```

### Type checking

```bash
npm run compile
```

### Install in your browser

**Chrome / Edge / Opera:** go to `chrome://extensions` (or `edge://extensions`, `opera://extensions`), enable "Developer mode", click "Load unpacked", and select the `.output/<browser>-mv3/` folder.

**Firefox:** go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select any file inside `.output/firefox-mv2/`.

**Safari:** run `xcrun safari-web-extension-converter .output/safari-mv2/`, build the generated Xcode project, then enable the extension in Safari preferences.

## Architecture

```
entrypoints/
  detect.content.ts   Content script — detects movie/TV pages and extracts title info
  background.ts       Service worker — orchestrates lookups, caching, badge updates
  popup/              Extension popup UI
  options/            Settings page UI
detectors/            Site-specific extractors (IMDb, TMDB, Allociné, JSON-LD)
providers/            Rating fetchers (TMDB API, OMDb API, Allociné scraper)
utils/                Shared types, aggregation, caching, i18n, normalization
```

The extension detects a movie or TV title on supported sites, resolves it via TMDB, then fetches ratings from all enabled providers in parallel. Results are cached in `browser.storage` and displayed in the popup with an aggregated score badge.

## Tech Stack

- [WXT](https://wxt.dev/) — cross-browser extension framework
- TypeScript
- Vitest — testing

## License

See [LICENSE](LICENSE) for details.
