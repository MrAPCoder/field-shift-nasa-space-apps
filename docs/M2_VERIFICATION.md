# M2 — climate dashboard verification

## Implementation
Built from merged M1 commit `bf73a74` on branch `codex/m2-climate-dashboard`.
React dashboard with three configured locations, four 0–10 priority sliders,
monthly rainfall and GWETROOT charts, annual indicators, per-month value tables,
coverage, source access, limitations and the required disclaimer. Chart code loads
as a separate bundle. No new dependencies, backend, crop scoring, or M3 work.

Priority settings persist across farm switches for the current page session; they
reset on reload. They do not modify climate data or calculate scores. Income
explicitly remains unscored. These boundaries are visible in the interface.

## Data integrity
M1 `public/data`, configuration, Python pipeline and dependency files are unchanged
from `origin/main`. No NASA download or data-regeneration command was run for M2.
All three farms load local `climate.json` files, with validation of location,
structure, units, monthly ranges and coverage. Loading and error states are explicit.
Old requests are aborted on switching farms; old values are hidden immediately.
Missing numeric values display “Unavailable” and are not converted to zero.

Values match M1 (displayed to one decimal):

| Location | Annual rain (mm) | Frost-free days | Hot days/year |
|---|---:|---:|---:|
| Skagit Valley | 1,323.3 | 247.4 | 0.6 |
| Yakima Valley | 321.5 | 195.8 | 37.9 |
| Palouse | 731.7 | 152.2 | 14.0 |

Skagit frost-free coverage remains 43 valid years; other summary denominators
remain 45. GWETROOT is labeled as modeled wetness on a 0–1 scale, not SMAP or a
field measurement. Historical averages are explicitly not weather forecasts.

## Executed tests
- `npm test`: 8 passed, 0 failed (three M1 contracts plus five new frontend tests).
- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v`:
  14 passed, 0 failed. Existing M1 archive and formula checks only; no downloads.
- `npm run build`: production build passed. Initial JavaScript is about 235 KB
  minified / 74 KB gzip; separately loaded chart JavaScript about 402 KB / 116 KB gzip.
- `node tests/browser-smoke.cjs`: passed against the production preview using the
  environment's preinstalled Playwright and Chromium. Checked all three locations,
  nine indicators, all 72 monthly rainfall/wetness table values, two rendered
  charts, all four keyboard sliders at 0 and 10 and intermediate values, preference
  retention across farm switching, HTTP failure/retry, stale-request cancellation,
  and missing-value display using a clearly synthetic intercepted response.
- Layout checks at 1440, 768, 390 and 320 pixels: no horizontal overflow.
  Desktop and 390-pixel full-page screenshots were visually inspected.
- Normal interaction produced no console errors or uncaught page errors. The
  deliberately simulated HTTP 503 logs its expected resource error and recovers.
- Zero NASA API requests observed during browser tests.
- `git diff --check`: passed.

A missing favicon was detected and fixed during browser testing. Chart bundling
was split to remove Vite's large-chunk warning. No known failing tests remain.
This is Chromium verification, not exhaustive cross-browser or screen-reader
certification. Accessible labels, keyboard controls, visible focus, skip link,
reduced-motion support and text alternatives to chart values are implemented.

## Run locally
```sh
npm ci
npm run dev
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

With Playwright already available in your environment (not a required project
dependency), run `node tests/browser-smoke.cjs` in another terminal. It defaults
to `http://127.0.0.1:4173` and `/usr/bin/chromium`. Override with `PREVIEW_URL` and
`CHROMIUM_PATH` if needed. Screenshots are written under ignored `work/`.

## Preview deployment
The connected Vercel project-list request returned HTTP 403: the connection needs
a team grant for `rionakul-2134` (`team_7Rynv1kA7LyV4jxhmOMUVhPG`). Deployment is
blocked until the user completes Vercel's team-access authorization flow. No live
preview URL has been created or claimed. The app is ready for Vercel's Vite preset:
`npm run build`, output `dist`. No production deployment or promotion is requested.

## AI-generated or modified files
- `src/App.jsx` — state, dashboard composition, indicators and source notes.
- `src/style.css` — desktop/mobile layout, chart/panel styles and accessibility.
- `src/components/FarmSelector.jsx` — labeled location selector.
- `src/components/PrioritySliders.jsx` — four controlled priority inputs.
- `src/components/ClimateCharts.jsx` — Recharts charts and inspectable data tables.
- `src/lib/climate.js` — cached-data loading, validation, formatting and chart rows.
- `index.html` — page title, description and favicon reference.
- `public/favicon.svg` — application icon.
- `tests/climate.test.js` — data-contract, missingness and loader tests.
- `tests/browser-smoke.cjs` — repeatable optional browser verification.
- `README.md` — M2 usage and deployment notes.
- `docs/AI_DISCLOSURE.md` — M2 assistance disclosure.
- `docs/M2_VERIFICATION.md` — this report.
