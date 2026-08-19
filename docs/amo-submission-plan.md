# Ratearr — AMO (addons.mozilla.org) Submission Plan

## Pre-submission checklist

### Already done

- [x] `manifest.json` with gecko id `ratearr@davidaparicio.fr`
- [x] `data_collection_permissions` declared (`required: ["none"]`, `optional: ["technicalAndInteraction"]`)
- [x] `strict_min_version: "140.0"` (satisfies `data_collection_permissions` requirement)
- [x] `web-ext lint` passes (0 errors, 1 Android-only warning)
- [x] LICENSE file (MIT)
- [x] PRIVACY.md (lists all 6 API services and 11 detection sites)
- [x] Build: `npm run build:firefox` produces `.output/firefox-mv2/` (~100 KB)
- [x] 102 tests passing
- [x] All strings i18n'd (5 locales: EN, FR, ES, DE, IT)

### Before submission (manual steps)

- [ ] **Create a Mozilla Developer account** at https://addons.mozilla.org/developers/
- [ ] **Package the extension**: `npm run zip:firefox` → produces `.output/ratearr-X.Y.Z-firefox.zip`
- [ ] **Bump version** in `package.json` (currently `0.1.0` → suggest `2.0.0`)
- [ ] **Take screenshots** (1280×800 recommended):
  - Popup with ratings for a popular movie (Inception, Gladiator)
  - Popup in dark mode
  - Options page showing source toggles and weights
  - Context menu "Get movie rating" on selected text
- [ ] **Prepare source code ZIP** — required because WXT bundles the code:
  - Include the full repo (minus `node_modules/`, `.output/`)
  - Include `package-lock.json` for reproducible builds
  - README with build instructions:
    ```
    OS: any (macOS/Linux/Windows)
    Node: 24.x (tested with 24.14.0)
    npm install
    npm run build:firefox
    ```

## AMO listing information

| Field | Value |
|-------|-------|
| **Name** | Ratearr |
| **Summary** | Aggregated movie & TV ratings from 10 sources: TMDB, IMDb, Rotten Tomatoes, Metacritic, Allociné, SensCritique, Letterboxd, and more. |
| **Description** | See below |
| **Categories** | Entertainment, Search Tools |
| **License** | MIT |
| **Support** | https://github.com/davidaparicio/ratearr/issues |
| **Homepage** | https://www.ratearr.com |
| **Privacy policy** | Paste content of PRIVACY.md |
| **Requires payment** | No |
| **Experimental** | No |

### Suggested description

```
Ratearr shows you aggregated movie & TV ratings from 10 sources in one popup.

RATING SOURCES
• TMDB, IMDb, Rotten Tomatoes, Metacritic
• Allociné (Presse + Spectateurs)
• SensCritique, Letterboxd
• Télérama (critic + subscriber, optional)

DETECTION SITES
Works automatically on: IMDb, TMDB, Allociné, Netflix, Prime Video, Disney+, Letterboxd, SensCritique, Wikipedia (EN/FR/ES/DE/IT).

Also works via right-click → "Get movie rating" on any selected text.

FEATURES
• Weighted aggregate score with customizable source weights
• Keyboard shortcut (Alt+R)
• Dark mode (auto/light/dark)
• Copy or Share ratings with friends
• Export/import settings
• Badge color thresholds (green/yellow/red)
• Bilingual: EN, FR, ES, DE, IT

PRIVACY
No data collection. No analytics. No tracking. Your browser talks directly to the APIs — no backend server. API keys stored locally.

OPEN SOURCE
MIT license — https://github.com/davidaparicio/ratearr
```

### Reviewer notes

```
This extension uses WXT (https://wxt.dev) as its build framework, which
bundles TypeScript source into the output. Source code is attached for review.

To build from source:
  npm install
  npm run build:firefox

The extension requires two user-provided API keys (TMDB + OMDb) configured
in the options page. Without them, only Allociné, SensCritique, Letterboxd,
and Télérama sources work.

No remote code is loaded. All API calls are data-only (JSON/HTML) over HTTPS.
No user data is collected or transmitted beyond movie titles sent to rating APIs.
```

## Submission steps

1. Go to https://addons.mozilla.org/developers/addon/submit/distribution
2. Choose "On this site" (AMO distribution)
3. Upload `.output/ratearr-X.Y.Z-firefox.zip`
4. Fix any validator errors (should be none — `web-ext lint` already passes)
5. Upload source code ZIP
6. Fill in listing information (table above)
7. Paste privacy policy from PRIVACY.md
8. Add reviewer notes
9. Upload screenshots
10. Submit

## After submission

- AMO review typically takes 1–5 days for new extensions
- Check email for review outcome
- If rejected, fix issues and resubmit as a new version (not a new add-on)
- Once approved, update the website (ratearr.com / ratearr.fr) with the AMO link
