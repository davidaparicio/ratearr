# Ratearr — Review, Next Steps & v2 Roadmap

## Context

Ratearr v0.1.0 is feature-complete for its MVP: 6-source rating aggregation, popup UI, context-menu lookup, bilingual EN/FR, caching, and builds for all 5 WXT browsers (Chrome, Firefox, Edge, Opera, Safari). Three review rounds fixed all race conditions, validation gaps, and decomposition issues — 22 tests pass, no TODOs remain in the code.

An audit of the current state found the codebase healthy but **not yet shippable to stores**, with several robustness gaps and clear v2 feature opportunities. This plan organizes the findings into three milestones: **v1.1 (release blockers)**, **v1.2 (robustness)**, and **v2 (features)**.

---

## Milestone v1.1 — Release blockers (ship to AMO / Chrome Web Store)

Priority-ordered; these block store submission:

1. **Firefox data collection declaration** — `wxt.config.ts` currently *suppresses* the `firefoxDataCollection` warning instead of declaring data. AMO **requires** `browser_specific_settings.gecko.data_collection_permissions` since Nov 2025. Declare the honest set (API keys stored locally; titles sent to TMDB/OMDb/Allociné). Hard blocker for Firefox.
2. **LICENSE file** — README links to `LICENSE`, which doesn't exist (broken link). Add MIT (footer of the landing page already claims MIT).
3. **PRIVACY.md** — required by Chrome Web Store & AMO. Content already drafted in the landing page's Data Safety section (no collection, no third-party sharing, HTTPS-only, local storage) — turn it into a policy file and host it (the `ratearr_website` one-pager is a natural home).
4. **Store assets** — Chrome Web Store needs 1280×800 screenshots + 440×280 tile; AMO needs screenshots. Capture the popup on a real movie page (screenshot of *your own* extension UI is fine; the Inception poster inside it is acceptable as incidental UI capture).
5. **CI workflow** — `.github/workflows/ci.yml` running `npm run compile` + `npm test` + `wxt build` (chrome + firefox) on push/PR. Nothing runs tests today.
6. **CHANGELOG.md** — start at 0.1.0, keep-a-changelog format.

## Milestone v1.2 — Robustness & DX

**User-facing bugs (from audit):**

1. **Distinct error state in popup** — `PanelState` has no `'error'`; resolution failures collapse into `no-title`, so "network down", "no API key", and "not a movie page" all show the same message. The i18n keys `popup_error` / `popup_notFound` already exist *unused* in both locales — add `'error'` to `PanelState` (`utils/messages.ts:3`), set it in the `resolveTitle` catch (`entrypoints/background.ts:73-77`), render it in `popup/main.ts` with a link to options when the cause is a missing key.
2. **Allociné TV series support** — provider is movies-only (`providers/allocine.ts:6,60,77`): autocomplete hits `/movie`, filters `entity_type === 'movie'`, builds only film URLs — yet the content script matches `allocine.fr/series/*`. Add the `series` entity type + `/series/ficheserie_gen_cserie=<id>.html` URL, keyed on `resolved.mediaType`.
3. **Bounded popup polling** — popup re-`init()`s every 1s forever while `loading` (`popup/main.ts:45`); cap at ~15 attempts then show the error state.
4. **Context-menu feedback** — `browserAction.openPopup?.()` silently does nothing on Firefox MV2/older Chrome; add a fallback (e.g. badge "…" while loading, or `notifications` permission) so right-click lookup isn't a dead click.
5. **Request coalescing** — refresh + alternative clicks can stack duplicate in-flight fetches for the same tmdbId; dedupe by key (the generation counter discards stale *results* but doesn't prevent duplicate *requests*).

**DX debt:**

6. **Linting** — no ESLint/Prettier at all. Add ESLint flat config + `@typescript-eslint`, `lint` and `format` scripts, wire into CI.
7. **Test coverage holes** — entire `detectors/` layer, `utils/cache.ts` (the trickiest logic in the repo: index lock, TTL, failure-counter reset), `providers/registry.ts`, and `background.ts` orchestration are untested. Priority order: cache → detectors (needs IMDb/TMDB HTML fixtures like the existing `tests/fixtures/allocine-page.html`) → registry.
8. **i18n polish** — remove-or-use dead keys; translate `popup_sources` FR properly; add an i18n key-parity check to CI.
9. **WXT 1.x upgrade** — currently on pre-1.0 `wxt@0.21`; migrate when stable.

## Milestone v2 — Feature ideas

Ranked by value-to-effort:

**High value, moderate effort:**
- **More source sites for detection** — Netflix, Prime Video, Disney+, Letterboxd, SensCritique (FR!), Wikipedia film pages. The detector registry pattern (`detectors/registry.ts`) makes each one an isolated module + manifest match pattern.
- **SensCritique as a 7th rating source** — the French complement to Allociné; same scraping approach as the Allociné provider.
- **Rating history / trend** — cache already stores `fetchedAt`; keep N snapshots per title and show "↑ 0.2 since last month" in the popup.
- **Letterboxd rating** via their unofficial endpoints or scraping — high demand among cinephiles.

**High value, higher effort:**
- **Inline overlay mode (optional)** — badge injected next to titles on streaming sites (the original spec deferred this; the detector layer is ready). Gate behind a setting, default off.
- **Watchlist cross-check** — "already on your Letterboxd/Trakt watchlist" indicator; Trakt has a proper OAuth API.
- **Custom aggregate weights** — let users weight sources (e.g. Metacritic ×2, TMDB ×0.5) in options; `utils/aggregate.ts` is a 20-line function, easy to extend.

**Nice-to-have:**
- **Keyboard shortcut** (`commands` manifest key) to open the popup.
- **Export/import settings** as JSON from the options page.
- **More locales** — ES/DE/IT; the i18n scaffolding is done.
- **Badge threshold customization** — green/yellow/red cutoffs are hardcoded at 7/5 (`background.ts:124-126`).
- **Per-source cache TTL** — ratings for old films change slowly; recent releases change daily.

## Recommended sequencing

```
v1.1 (1–2 days)   → data_collection_permissions, LICENSE, PRIVACY, CI, assets, CHANGELOG → submit to AMO
v1.2 (3–5 days)   → error state, Allociné TV, polling cap, coalescing, ESLint, cache+detector tests
v2.0 (iterative)  → SensCritique + Letterboxd sources first (differentiators), then detection sites, then overlay
```

## Verification

- v1.1: `npx wxt build -b firefox` produces a manifest containing `data_collection_permissions`; CI green on push; AMO validator (`web-ext lint`) passes.
- v1.2: new Vitest suites for cache/detectors pass; manual check that a bad API key shows the error state (not "no title") and that an Allociné series page returns Presse/Spectateurs scores.
- v2: per-feature; each new source ships with a parser test + fixture, following the existing `tests/allocine.test.ts` pattern.
