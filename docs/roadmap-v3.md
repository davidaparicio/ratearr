# Ratearr — v3 Roadmap

## Context

v2 is complete: 10 rating sources, 8 detection sites (IMDb, TMDB, Allociné, Netflix, Prime Video, Disney+), custom weights, badge thresholds, keyboard shortcut, settings export/import, request coalescing, 5 locales, Biome, 90 tests, AMO-ready Firefox manifest. Builds for Chrome, Firefox, Edge, Opera, Safari on WXT 0.21.

v3's theme: **be indispensable to the cinephile who already lives on Letterboxd, SensCritique, Allociné and Télérama** — and pay down the two structural debts (WXT 1.x, popup UI architecture) before they get expensive.

Guiding principles, in order:
1. **Meet users where they browse.** The highest-leverage detection sites are the *cinephile* sites themselves (Letterboxd, SensCritique, Wikipedia) and the French streamers (myCANAL, Arte), not more US-only platforms.
2. **Read-only stays sacred.** No accounts required, no data collection. The one exception is opt-in Trakt OAuth, which is the gateway to every "personal" feature.
3. **Each source/detector stays a one-module drop-in.** The `providers/registry.ts` and `detectors/registry.ts` patterns are the project's best asset — every v3 feature must preserve them.

Effort scale: **S** < 1 day · **M** 1–3 days · **L** ~1 week+.

---

## Milestone v3.0 — Cinephile quick wins (S/M items, highest value-to-effort)

Priority-ordered:

1. **Rating history / trend** — **M**. Deferred since the v2 roadmap and still the cheapest differentiator: `CacheEntry` already carries `fetchedAt` (`utils/types.ts`); keep the last N snapshots per tmdbId in `storage.local` (new `utils/history.ts`, separate from the LRU cache) and render "SensCritique ↑ 0.3 this month" deltas in the popup. No new network calls, no new permissions.
2. **Dark mode in popup + options** — **S**. Pure CSS: `prefers-color-scheme` media query plus a three-state override (auto/light/dark) in `Settings`. The popup is vanilla TS/CSS (`entrypoints/popup/main.ts`), so this is a stylesheet refactor into custom properties. Table stakes for store reviews in 2026.
3. **Detection on Letterboxd + SensCritique + Wikipedia film pages** — **S each**. The killer inversion: a cinephile on a Letterboxd film page sees Allociné Presse/Télérama instantly (and vice versa). Letterboxd and Wikipedia both embed JSON-LD, so `detectors/jsonld.ts` does most of the work; SensCritique pages carry the Apollo state the provider already parses. Three new detector modules + `matches` entries in `entrypoints/detect.content.ts`.
4. **Share / copy ratings summary** — **S**. "Copy as text/Markdown" button in the popup footer: title, year, aggregate, per-source lines, ratearr.com attribution link. Clipboard API needs no new permissions in a popup. Cheap virality for a niche extension.
5. **Critics vs. audience comparison view** — **M**. Generalize the existing Allociné Presse-vs-Spectateurs insight: tag each `SourceId` as `critic` (Metacritic, RT, Allociné Presse, Télérama) or `audience` (IMDb, TMDB, Letterboxd, SensCritique, Allociné Spectateurs) in a source-meta map, compute two sub-aggregates in `utils/aggregate.ts`, render a two-bar split with the divergence callout. This is the popup's "screenshot moment" for store listings.
6. **Per-source cache TTL** — **S**. Carried over from v2's nice-to-haves; ratings for a 2010 film are stable, this week's release changes daily. Key TTL off release year (`ResolvedTitle.year`): e.g. 6h if < 60 days old, 7 days if > 2 years. One function in `utils/cache.ts`.

**Exit criteria:** trend arrows on a second visit; dark popup screenshot in `store/`; Allociné ratings visible on a Letterboxd page; copied summary pastes cleanly into Discord/Mastodon.

---

## Milestone v3.1 — Trakt & the personal layer (the differentiator)

7. **Trakt integration (OAuth device flow)** — **L**, the headline v3 feature and the only one warranting real architectural work:
   - **Phase A — Trakt as 11th rating source** (M): `providers/trakt.ts` keyed on `imdbId` (already in `ResolvedTitle`); public endpoints need only a client id, same "bring your own key" model as TMDB/OMDb. New `SourceId: 'trakt'`, weights/thresholds work for free.
   - **Phase B — watchlist & watched badges** (M): device-code OAuth from the options page (no redirect URL headaches in extensions), token in `storage.local` (never `sync`), then "on your watchlist" / "watched on <date>" chips in the popup.
   - **Phase C — quick actions** (S, gated on B): add/remove watchlist from the popup.
   - Update the Firefox `data_collection_permissions` declaration in `wxt.config.ts` — this is the first feature that transmits any account-linked data.
   - *Why Trakt and not Letterboxd:* Letterboxd's API remains invite-only; Trakt is the only watchlist platform with a proper public OAuth API. Revisit Letterboxd auth in v4 if their API opens.
8. **Personal rating & note (local-only)** — **M**. Let the user rate a film 0–10 and jot a one-line note, stored per tmdbId in `storage.local`, shown alongside the aggregate ("You: 8 — *rewatch in VO*"). Rides on settings export/import for backup. Zero-account "diary lite" for users who won't do OAuth.
9. **"Where to watch" via TMDB watch-providers** — **M**. Region-aware streaming availability (JustWatch-licensed data through TMDB's official `/watch/providers` endpoint — same API key, no ToS risk, unlike scraping JustWatch directly). Region from `navigator.language` with an options override. Closes the loop: see ratings on IMDb → learn it's on Canal+.

**Exit criteria:** Trakt rating appears with only a client id configured; device-flow pairing completes in options; watchlist chip on a known-watchlisted title; personal rating survives export/import round-trip.

---

## Milestone v3.2 — Detection reach & platform debt

10. **French/EU streamer detection: myCANAL, Arte.tv, france.tv** — **S–M each**. myCANAL is the highest-value gap for the target persona; Arte is the cinephile's channel. All are SPAs, so they follow the Netflix/Disney+ detector pattern (DOM/JSON-LD extraction + the existing SPA poll). france.tv only if title extraction proves reliable.
11. **Apple TV+ and Max detection** — **M each**. Broadest international reach of the remaining majors. Apple's `tv.apple.com` embeds usable metadata (schema.org); Max is a React SPA like Disney+. **Skip Hulu** (US-only, persona mismatch) and **defer Mubi/Criterion** (Mubi film pages have JSON-LD — take it as an S bonus if trivial; Criterion is US-centric).
12. **WXT 1.x upgrade** — **M**. Pre-1.0 `wxt@0.21` is the biggest platform risk (`package.json`); the longer it waits, the more entrypoints/config drift. Do it *before* the overlay work in v4, in an isolated PR: config API changes, `_execute_action` command handling, re-verify all five browser builds + `web-ext lint`.
13. **SPA navigation cleanup** — **S**. `entrypoints/detect.content.ts` runs a forever `setInterval(1000)` plus a broad head MutationObserver for URL-change detection. Use the Navigation API (`navigation.addEventListener('navigate')`, now in Chrome and Firefox) with the interval as fallback — less battery, fewer wasted wakeups across 10+ matched sites.
14. **E2E smoke tests** — **M**. 90 unit tests but zero end-to-end coverage. Playwright + `chromium.launchPersistentContext` loading the built extension against saved HTML fixtures: detection fires, popup renders, options round-trips. Catches the manifest/build breakage class that unit tests can't, and de-risks item 12.
15. **i18n key-parity CI check** — **S**. Five locales with no drift guard (carried from v1.2). A ~20-line script comparing `public/_locales/*/messages.json` key sets, wired into CI.

**Exit criteria:** ratings popup works on myCANAL and tv.apple.com; CI green on WXT 1.x for all five targets; E2E suite in CI; key-parity check fails on a deliberately dropped key.

---

## Considered and deprioritized

- **FilmAffinity / Douban sources** — wrong persona (ES/CN-centric), and both are aggressively anti-scraping (FilmAffinity bans, Douban requires login). Revisit only on user demand; the provider pattern makes them cheap *if* demand appears.
- **JustWatch scraping** — superseded by item 9 (TMDB's official watch-providers endpoint carries JustWatch data legitimately).
- **Inline overlay mode** — stays deferred to **v4**, per the standing "only if users request it" decision, and should land *after* the WXT 1.x upgrade (12) and E2E harness (14) exist. The detector layer is ready; the risk is CSS collisions and streamer-site churn, so it ships behind a default-off setting with per-site toggles.
- **Social features (shared lists, comments)** — requires a backend; contradicts the no-collection privacy posture that is itself a differentiator. The share-as-text button (4) covers 80% of the want.
- **Firefox for Android** — genuinely interesting (WXT supports it, AMO ships it), but popup-first UX needs rethinking on mobile. Park for v4 evaluation.

## Recommended sequencing

```
v3.0 (~1.5 wks)  history/trend → dark mode → LB/SC/Wikipedia detectors → share → critics-vs-audience → per-source TTL
v3.1 (~2 wks)    Trakt A → B → C → personal rating → where-to-watch
v3.2 (~2 wks)    myCANAL + Arte → WXT 1.x → SPA cleanup → E2E → Apple TV+/Max → i18n check
```

v3.0 ships alone as a store update (visible novelty, zero risk). Trakt Phase A can be pulled forward into v3.0 if a release needs a headline. Items 12–14 are sequential (upgrade → cleanup → E2E lock-in); everything else parallelizes.

## Verification

- Every new provider ships with a fixture + Vitest suite following `tests/senscritique.test.ts` / `tests/telerama.test.ts`; every detector follows `tests/streaming-detectors.test.ts`.
- Trakt: device-flow paired against a real account in Firefox + Chrome; token revocation path tested; `data_collection_permissions` re-validated with `web-ext lint`.
- WXT 1.x: all five `wxt zip` targets build; manual smoke of popup/options/context-menu/Alt+R per browser; E2E suite green before and after.
- History/personal data: storage growth bounded (assert max entries in tests); export/import round-trip test extended.
