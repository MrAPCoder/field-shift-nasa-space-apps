# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Field Shift is a NASA Space Apps 2026 prototype for farm planning in Washington. It is a static React/Vite dashboard with no backend. It shows 1981–2025 NASA POWER climate data for three representative farms (Skagit, Yakima, Palouse) and compares three-year crop rotations (3 slots per farm, 9 total) using deterministic, evidence-gated heuristics. Work is organized into milestones (M1, M2, M3, M4, M4.2, M5). M1–M4.2 were each built on a `codex/m*` branch and merged into `main`. M5 adds a historical replay simulator at the top of the page: it replays a 36-month plan through every complete three-year window of the archived daily weather and reports how often provisional screening conditions occurred. It is not a forecast, yield, water-savings, profit or erosion model.

## Commands

Requires Node.js 20.19+ or 22.12+ and Python 3.12+.

```sh
npm ci
python -m venv .venv && .venv/bin/pip install -r requirements.txt

npm run dev -- --host 0.0.0.0        # dev server
npm run build                        # → dist/
npm run preview -- --host 127.0.0.1  # serves dist/ on :4173 (browser tests target this)

npm test                                                        # all JS unit tests (node:test, tests/*.test.js)
node --test tests/score.test.js                                 # one JS test file
node --test --test-name-pattern="weighted average" tests/score.test.js   # one JS test

.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v   # Python tests (run from repo root; they import scripts.*)
.venv/bin/python -m unittest tests.test_climate -v                 # one Python test module
```

Browser checks (`tests/*.cjs`) need a running `npm run preview` and an existing Playwright install. Playwright is deliberately **not** a project dependency. They default to `/usr/bin/chromium` and `http://127.0.0.1:4173/`, so on macOS set `CHROMIUM_PATH` (and `PREVIEW_URL` if needed). Run them one at a time: `node tests/browser-smoke.cjs`, `m3-browser.cjs`, `m4-browser.cjs`, `m42-browser.cjs`, `sim-browser.cjs`. Screenshots and sample PDFs go to the ignored `work/` directory.

Data pipelines (network calls only happen here, never during app use):

```sh
.venv/bin/python scripts/fetch_nasa.py            # reuses existing raw chunks; delete chunks to force re-download
.venv/bin/python scripts/fetch_nasa.py --offline  # recompute from archived raw responses only
python scripts/fetch_soils.py [--offline]         # USDA NRCS SDA; exit 1 = acquisition/validation incomplete
.venv/bin/python scripts/build_replay.py          # offline: raw archives → public/data/<farm>/replay.json (M5)
.venv/bin/python scripts/build_replay.py --check  # verify committed replay files; writes nothing; exit 1 on mismatch
```

## Architecture

**Data flow:** `src/config/config.json` → Python pipeline → committed JSON under `public/data/` → frontend.

- `src/config/config.json` is the single source of truth for farm coordinates, the study period, hot/frost thresholds, chunk size, and **all scoring coefficients** (`scoring.summerMonths`, `waterDemandIndex`, `soilWeights`). Both `scripts/fetch_nasa.py` and the frontend read it.
- `scripts/fetch_nasa.py` downloads NASA POWER daily data in 5-year chunks, archived gzipped as `public/data/<farm>/raw/*.json.gz`. It validates fail-closed and aggregates to `public/data/<farm>/climate.json` (`schema_version: 1`). This compact file is the frontend contract. `src/lib/climate.js#validateClimate` enforces the schema at load time, so if you change the pipeline output, update the validator too.
- `scripts/fetch_soils.py` writes `soil.json` and `soil-source.json` per farm. USDA acquisition is currently blocked (HTTP 403), so these hold explicit "unavailable" records with provenance. A failed refresh keeps any existing successful data. `SoilProfile.jsx` imports these files statically.
- `data/crops.json` (`sources`, `crops`) and `data/rotations.json` (`rotations`) hold the agricultural records. `RotationComparison.jsx` imports them at build time.
- `scripts/build_replay.py` (offline only) flattens the raw archives into `public/data/<farm>/replay.json` (schema `field-shift-replay` v1: columnar daily `PRECTOTCORR`, `T2M_MAX`, `T2M_MIN`, `GWETROOT`; −999 → `null`; 16,436 days; raw SHA-256 provenance). It never modifies the raw archives or `climate.json`. `src/lib/replay.js#validateReplay` enforces the schema, so if you change the builder output, update the validator too. Rebuild after any change to the raw archives.
- `data/demo-scenarios.json` holds two **illustrative** Palouse calendars (`source_kind: 'illustrative_demo'`, `values_status: 'illustrative_pending_review'`) used only by the simulator's demo button.

**Frontend** (`src/App.jsx` holds all state: selected farm, priority sliders, per-rotation management calendars). State is tab-local and is cleared on refresh by design. Logic is kept in pure modules in `src/lib/`, which `node:test` tests directly. Components only present it.

- `lib/score.js` computes water, soil and erosion subscores plus `weightedTotal`. Each score returns `{status: 'SCORED'|'NOT_SCORED', value, reasons, evidence}`. Scores are **gated**: anything that is unverified, unsourced (non-`https://` URLs), unknown, or misconfigured returns `NOT_SCORED` with human-readable reasons instead of a guessed number. Income is always excluded, even if it is given a numeric value. A rotation passes the gate if `verified === true` **or** `demonstrationApproved()` (`sequence_status: 'sourced'` + `sequence_approval.scope: 'research_demonstration_only'`). Today only the three Palouse sequences pass.
- `lib/management.js` handles farmer-entered 36-month calendars (`source_kind: 'farmer_input'`, `method: 'monthly-exposed-soil-v1'`). If a confirmed calendar exists, `scoreErosion` uses it in place of the rotation's published `schedule`. Any edit (`editManagement`, `rangeEdit`, `copyYear`) resets `confirmed`.
- `lib/plan.js` builds calendar and print-plan rows (high-rain months = top `HIGH_RAIN_RANK` normals, a display convention only). `lib/scorePresentation.js` holds labels and wording only.
- **M5 simulator** (`components/Simulator.jsx`, `SimSetup.jsx`, `ConcernCard.jsx`, `SimComparison.jsx`, `SimulationReport.jsx`) renders above the intro and keeps its own state. It shares `selected`/`setSelected` with `FarmSelector` (keep `#farm` the only element with that id) and reads `management` but never writes it. `lib/replay.js` lazily fetches and caches the replay and maps dates to day indexes (UTC math). `lib/simulate.js` builds 43 runs (start years 1981–2023) and computes the dry, heat, frost and exposed-soil precipitation indicators. `lib/concerns.js` qualifies, ranks (≤3) and words the concern cards. `lib/compare.js` pairs before/after results and throws unless both use the same replay fingerprint and start years. Thresholds come only from `config.simulation` (`status: 'provisional'`).

## Scientific-integrity rules (enforced by tests and docs)

These are core requirements of the project, not style preferences:

- **Never flip `verified` flags or add `sequence_approval`** just to make a score appear. Approval belongs to the team (Rehan and Nakul) and follows `docs/AGRICULTURAL_REVIEW.md`. Unsupported traits, sequences and dates stay `null`/TODO/unknown. Never invent crop traits, citations, farm histories, soil values or profitability.
- "Unknown" is never treated as bare soil. "Bare" means exactly 100% exposed. A planted crop is never assumed to be fully protective.
- Wording must keep proxies distinct from measurements. The exposure index is not measured erosion, water scores are demand proxies, and historical climate is not a forecast. Farmer "proposed" inputs must never be presented as observations.
- Normal app use must never call NASA POWER or USDA (the browser tests assert there are no `power.larc.nasa.gov` requests).
- Unit-test fixtures are labeled SYNTHETIC and must never be rendered as real results.
- Dependencies are deliberately limited to React, React-DOM, Recharts, Vite, requests and pandas. Do not add packages (including test frameworks or PDF libraries) without approval.
- Simulator rules: thresholds in `config.simulation` are provisional screening conventions pending team approval, never crop-damage thresholds; do not change them, or the demo calendar values, without approval. Every displayed simulator number carries one provenance label (Historical NASA weather · Model estimate (GWETROOT) · Farmer assumption / Illustrative demo assumption · Simulated indicator). Demo assumptions are never stored in `management` or passed to `scoreRotation`. Changing a plan never changes weather. Comparison wording never claims erosion reduced, water saved, yield, profit or soil loss. A screen that is not met is not evidence of low risk.
- Changing formulas or coefficients requires updating `docs/METHODS.md`. Each milestone records its scope, results and AI-modified files in `docs/M*_VERIFICATION.md` and `docs/AI_DISCLOSURE.md`.

## Deployment

Static hosting on Vercel (Vite preset, build `npm run build`, output `dist`). Milestone work targets preview deployments, never production. Do not change deployment protection without approval.

## Visual simulator

`VisualSimulator.jsx` is the four-step main experience; the original M5 setup, reports, climate dashboard, calendars and research live in the collapsed Advanced Details section. `lib/visual.js` aggregates complete months only and preserves unknowns. Cash-crop weather screens exclude cover-only months; cover still contributes to soil exposure. See `docs/M5_VISUAL_VERIFICATION.md` and the visual simulator section in `docs/METHODS.md`.

## M6 daily soil-water scenario

`VisualSimulator.jsx` now presents six inputs and the daily water balance in `lib/soilWater.js`; M5 and legacy tools remain in Advanced Details. All numeric soil/crop assumptions and primary citations are in `config.soilSimulation`. Do not imply local validation of generic parameters or present plant-available percentage as volumetric moisture or soil health. The new weather period is 2021–2025. `python scripts/build_soil_weather.py --check` verifies derived files offline; `--fetch` acquires only missing supplemental wind/pressure archives, never overwriting original raw data. Missing required weather fails closed. GWETROOT is separate regional model context; SMAP is explicitly unavailable. Run `tests/soil-water.test.js`, `tests/visual-browser.cjs` and Python provenance tests in addition to legacy checks. See M6 sections in METHODS and M6_VERIFICATION.

## M8 farm score and biggest weakness

`lib/grade.js` scores one simulated year out of 100: Irrigation Efficiency 35, Crop Water
Supply 35, Rain Exposure Protection 30. Targets are in `config.soilSimulation.grading`.
Any unscorable category makes the total "Not scored". The biggest weakness is the
category whose best single-setting rerun (irrigation, cover or a ±1 month season shift;
never soil) raises the total most, not the lowest raw score. `ScorePanel.jsx` shows the
score, weakness, improvement and apply/undo. The Palouse demo compares 0 vs. an
illustrative 40 mm/week (`config.soilSimulation.demo`). Do not change targets or the
demo amount without team approval. See METHODS "M8" and `tests/grade.test.js`.
