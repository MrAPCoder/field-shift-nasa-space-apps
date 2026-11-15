# M5 visual simplification verification

Base: `fable/m5-simulator`, commit `cf1b91b`. Work branch: `codex/visual-farm-simulator`.

## Scope

Four steps: choose a farm, choose an illustrative Palouse plan or an assumed growing season, watch a monthly 2D historical replay, and compare a cover-crop or growing-season change. Play/pause, scrubber and historical window selection work without new dependencies. Reduced-motion preference disables visual animation and autoplay. Soil Status presents explicit assumed protection, precipitation-weighted exposure and at most three soil notes. Unknown is never displayed as bare or as a zero-value meter.

Climate charts, rotations, field calendars, priorities, sources, M5 detail comparisons and printable reports remain available inside one Advanced Details disclosure. State remains tab-local.

## Accuracy

Cash-crop weather screens now include cash months only. Bare-to-cover changes do not extend heat, frost or dry-spell exposure. Cover-only plans have unavailable cash-crop screens. All soil-exposure calculations retain the original explicit assumptions. The real Palouse baseline/improved regression checks equality of every cash-crop run and summary.

No thresholds, demo values, data or approvals changed. Valid 43/43 results remain in detailed results, with overlapping-window and provisional-screen context. The main cover comparison shows continuous mean precipitation exposure (60% → 25% rounded), not measured erosion or soil health. Monthly visuals use complete NASA archive months; missing values fail closed.

## Verification

- `npm ci --cache /tmp/field-npm-cache`: passed; default cache was unwritable, so a temporary cache was used.
- `npm test`: 90 tests passed.
- `npm run build`: passed.
- Python unittest discovery: 32 tests passed using the repository requirements in a temporary virtual environment.
- `scripts/build_replay.py --check`: all three replay files match 27 archived raw files, 16,436 days per farm.
- `tests/visual-browser.cjs`: all farms, one-click demo, play/pause, scrubbing, cover comparison, season comparison, unknown cover, Advanced Details, failed load/retry, reduced-motion setup, desktop and 320/390px widths; no runtime errors or live NASA/USDA requests.
- All five existing browser suites passed: browser-smoke, m3-browser, m4-browser, m42-browser and sim-browser. They open Advanced Details explicitly, including after reload. Climate/dashboard, rotation/calendar, print/PDF and detailed M5 workflows remain functional. The new disclosure required a print-CSS ancestor fix, which passed both plan and simulation report checks.
- Desktop and mobile screenshots inspected in `work/visual-desktop.png` and `work/visual-mobile-390.png` (ignored local verification artifacts). Mobile stacks Soil Status below the scene without horizontal scrolling.

## Limitations

The scene is illustrative: no growth, damage, yield, soil-water balance or soil-health model. Calendar-only crop presence and explicit exposure assumptions drive the artwork. Rain strokes represent nonzero monthly precipitation, not daily timing. Growing-season plans cannot supply soil protection without a field calendar. Historical screens are provisional and overlapping runs are not independent probabilities. Original scientific limitations and source citations remain accessible in Advanced Details.

Deployment targets a Vercel preview only. No main merge, production promotion, or protection-setting change is authorized or performed.
