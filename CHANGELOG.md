# Changelog

All notable changes to Ratearr will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- LICENSE (MIT), PRIVACY.md, CHANGELOG.md
- CI workflow (GitHub Actions) — type check, tests, Chrome + Firefox builds
- Store assets directory with submission checklist
- Multi-browser build docs in README (Chrome, Firefox, Edge, Opera, Safari)
- v1.1/v1.2/v2 roadmap in `docs/roadmap.md`

### Changed
- Firefox manifest now declares `data_collection_permissions` (AMO requirement since Nov 2025)
- Removed `suppressWarnings: { firefoxDataCollection: true }` workaround

## [0.1.0] - 2026-08-17

### Added
- 6-source rating aggregation: TMDB, IMDb, Rotten Tomatoes, Metacritic, Allociné Presse, Allociné Spectateurs
- Popup UI with poster, aggregate score, per-source ratings, and cache age indicator
- Automatic title detection on IMDb, TMDB, and Allociné (including SPA navigation)
- Context menu: right-click selected text to look up ratings on any page
- Bilingual TMDB search (EN + FR) with "Did you mean?" disambiguation
- Audience vs. critics insight when Allociné Spectateurs rates higher than Presse
- Options page: enable/disable sources, configure API keys, cache TTL, clear cache
- Bilingual interface (EN/FR) via `_locales`
- Local caching with configurable TTL and index-based LRU pruning (300 max entries)
- Generated PNG icons (star + reel) at 16/32/48/128px

### Fixed
- Cache index race condition — serialized via promise chain with failure recovery
- SPA poll interval leak — previous intervals cleared on re-detect
- Fire-and-forget `handleTitleDetected` — all call sites catch rejections
- Tab race condition — generation counter discards stale results
- Content script `sendMessage` error on background not ready
- Expired cache entries now removed from index (not just storage)

### Security
- Message schema validation at background listener boundary
- `mediaType` allowlist check before TMDB API path construction
- Allociné `entity_id` numeric validation before URL interpolation
- OMDb response shape validation
- API key inputs use `type="password"` in options page
- Cache TTL clamped to [1, 168] hours
