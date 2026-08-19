# Privacy Policy — Ratearr

**Last updated:** 2026-08-19

Ratearr is a browser extension that aggregates movie and TV ratings. This policy explains what data is accessed, how it is used, and what is stored.

## Data we do NOT collect

- No personal information (name, email, location, demographics)
- No browsing history or browsing behavior
- No analytics, telemetry, or usage tracking
- No advertising or ad-related data
- No cookies or cross-site tracking

## Data accessed during use

When you visit a supported movie page (IMDb, TMDB, Allociné, Netflix, Prime Video, Disney+, Letterboxd, SensCritique, Wikipedia) or use the right-click lookup:

- **Movie/TV title** — extracted from the current page's structured data (JSON-LD) or page title. This title is sent to external APIs (TMDB, OMDb, Allociné) to look up ratings. No other page content is accessed or transmitted.

## API calls

Ratearr makes requests to the following third-party services:

| Service | Purpose | Data sent |
|---------|---------|-----------|
| [TMDB API](https://www.themoviedb.org/) | Title resolution and TMDB rating | Movie/TV title, year, your TMDB API key |
| [OMDb API](https://www.omdbapi.com/) | IMDb, Rotten Tomatoes, Metacritic ratings | IMDb ID, your OMDb API key |
| [Allociné](https://www.allocine.fr/) | Allociné Presse and Spectateurs ratings | Movie/TV title (search query) |
| [SensCritique](https://www.senscritique.com/) | SensCritique rating | Movie/TV title (GraphQL query) |
| [Letterboxd](https://letterboxd.com/) | Letterboxd rating | Movie title (page fetch by slug) |
| [Télérama](https://www.telerama.fr/) | Télérama critic and subscriber ratings (disabled by default) | Movie title (search query); uses your existing Télérama session cookies |

All API calls use **HTTPS**. No data is transmitted unencrypted.

Ratearr does **not** operate a backend server. Your browser communicates directly with these APIs.

## Data stored on your device

All data is stored locally in your browser using the Web Extensions Storage API:

- **API keys** (TMDB, OMDb) — stored in `browser.storage.sync` so they sync across your browser instances if sync is enabled. You can clear them from the extension's options page.
- **Cached ratings** — stored in `browser.storage.local` with a configurable TTL (default 24 hours). You can clear the cache from the options page at any time.
- **Settings** (enabled sources, weights, theme, badge thresholds, cache TTL) — stored in `browser.storage.sync`.

No data is stored on external servers.

## Data shared with third parties

**None.** Ratearr does not share, sell, or transmit your data to any third party beyond the API calls described above, which are initiated by your browser and go directly to the API providers.

## Your controls

- **Clear cache**: Options page → Clear Cache
- **Remove API keys**: Options page → clear the key fields and save
- **Disable sources**: Options page → uncheck any source you don't want queried
- **Uninstall**: removing the extension deletes all stored data

## Changes to this policy

Updates will be posted in this file in the repository. The "Last updated" date at the top reflects the most recent revision.

## Contact

For questions about this policy, open an issue on [GitHub](https://github.com/davidaparicio/ratearr) or contact [David Aparicio](https://github.com/davidaparicio).
