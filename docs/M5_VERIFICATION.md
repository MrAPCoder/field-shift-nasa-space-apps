# M5 — Historical Farm Simulator

Base: `e43b36c` (main, NASA simulation data audit merged).
Branch: built on the coding session's assigned branch `claude/farm-simulator-implementation-pi98a3`; the plan's name was `fable/m5-simulator`.
Deadline supplied by the team: Sunday November 15, 2026, 8 PM Pacific.
Not merged to main. No production deployment and no change to deployment protection.

## What was delivered

User flow: Set Up Farm → Simulate My Farm → Top Concerns (0–3) → Try an
Improvement → Before/After → Print report. The simulator replays a 36-month plan
through 43 overlapping three-year windows of the archived daily NASA POWER
weather (start years 1981–2023) and reports how often provisional screening
conditions occurred. It is not a forecast, and not a yield, water-savings,
profit or erosion model. Formulas and thresholds: `docs/METHODS.md`,
“M5 historical replay simulator”.

- `scripts/build_replay.py` and three `replay.json` files (16,436 days each).
- `config.simulation` block, `status: "provisional"`.
- Pure modules `replay.js`, `simulate.js`, `concerns.js`, `compare.js`.
- Simulator UI above the existing page: region tiles, Palouse rotation and
  calendar status, climate-only growing window, one primary Simulate button,
  concern cards with a 43-tick frequency strip and provenance chips, demo button
  with a persistent HYPOTHETICAL banner, three levers, paired before/after, and
  a printable report.
- Illustrative demo calendars in `data/demo-scenarios.json`.

## Ground rules checked

- `git diff e43b36c` shows no change to any `climate.json`, `raw/*.json.gz`,
  `comparison.json`, `src/lib/score.js`, `management.js`, `plan.js`, calendar or
  plan components, `data/crops.json`, `data/rotations.json`, package files or
  `requirements.txt`. No `verified` or `sequence_approval` flag changed.
- `src/App.jsx`: two added lines (import and `<Simulator>` above the intro).
  `src/style.css`: 137 added lines, none removed. `src/config/config.json`: the
  new `simulation` key only; `fetch_nasa.py --offline` output is identical.
- No new npm or pip dependency. No NASA or USDA request at runtime (asserted in
  the browser test). `#farm` remains the only element with that id.
- Demo calendars are rejected by `managementIssues`, are never written to
  `management`, and cannot produce a rotation score (unit and browser tests).
- `compare()` throws on a different replay fingerprint or start-year list.

## Values awaiting team approval (Rehan and Nakul)

### Provisional thresholds (`src/config/config.json` → `simulation`)

| Key | Value |
|---|---|
| `status` | provisional |
| `dryDayMm` | 1.0 |
| `drySpellDays` | 21 |
| `hotDayC` | 32 |
| `hotDaysPerYear` | 5 |
| `frostDayC` | 0 |
| `frostShoulderMonths` | 4, 5, 6, 9, 10 |
| `frostDaysPerYear` | 1 |
| `exposedFraction` | 0.25 |
| `concernMinFrequency` | 0.20 |
| `minValidRuns` | 20 |
| `wetnessBaseline` | 1991, 2020 |
| `familyOrder` | exposed, dry, heat, frost |

### Illustrative demo calendar (`data/demo-scenarios.json`, rotation `palouse-current`)

Three numbers and one rule. They are hypothetical, not sourced agronomic values.

- Crop months, status cash, **20%** exposed: year 1 Apr–Aug (spring pea), year 1
  Oct – year 2 Jul (winter wheat), year 3 Apr–Aug (spring wheat). 20 months.
- Baseline: the other 16 months are bare, **100%**: year 1 Jan–Mar and Sep;
  year 2 Aug–Dec; year 3 Jan–Mar and Sep–Dec.
- Improved: identical except those 16 months are cover at **30%**.

| | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Baseline Y1 | bare 100 | bare 100 | bare 100 | cash 20 | cash 20 | cash 20 | cash 20 | cash 20 | bare 100 | cash 20 | cash 20 | cash 20 |
| Baseline Y2 | cash 20 | cash 20 | cash 20 | cash 20 | cash 20 | cash 20 | cash 20 | bare 100 | bare 100 | bare 100 | bare 100 | bare 100 |
| Baseline Y3 | bare 100 | bare 100 | bare 100 | cash 20 | cash 20 | cash 20 | cash 20 | cash 20 | bare 100 | bare 100 | bare 100 | bare 100 |
| Improved Y1 | cover 30 | cover 30 | cover 30 | cash 20 | cash 20 | cash 20 | cash 20 | cash 20 | cover 30 | cash 20 | cash 20 | cash 20 |
| Improved Y2 | cash 20 | cash 20 | cash 20 | cash 20 | cash 20 | cash 20 | cash 20 | cover 30 | cover 30 | cover 30 | cover 30 | cover 30 |
| Improved Y3 | cover 30 | cover 30 | cover 30 | cash 20 | cash 20 | cash 20 | cash 20 | cash 20 | cover 30 | cover 30 | cover 30 | cover 30 |

## Findings the team should know

1. **The provisional screens saturate.** With the specified thresholds the demo
   baseline gives exposed 43/43, heat 43/43, frost 43/43 and dry 42/43 replays.
   Yakima with an Apr→Sep window gives dry, heat and frost 43/43. A screen met
   in every replay cannot separate plans. The paired per-replay metric still
   moves and is what the comparison leads with.
2. **Demo before/after, exactly as shown:** exposed 43 → 42 of 43 replays;
   median precipitation on assumed-exposed soil per replay 1,273 → 537 mm; less
   in 43 of 43 replays. Because the improved calendar turns 16 bare months into
   cover months, they become crop months: the dry screen goes 42 → 43, the
   median longest in-crop dry spell 31 → 36 days, median in-crop hot days 16 →
   18 and median shoulder-month frost days 27 → 31. The values were not tuned to
   cross a threshold.
3. The frost screen (one shoulder-month frost in any plan year) is met in every
   Palouse replay for any plan with crop months in April or October.
4. `tests/browser-smoke.cjs` failed on unmodified main in this environment
   (“overflow at 390”): a hidden Recharts tooltip kept its desktop position
   after the viewport shrank. One added CSS rule (`.chart-panel { overflow-x:
   clip; }`) fixes it. No existing rule was changed.

## Differences from the plan

- Work was committed on the coding session's assigned branch rather than
  `fable/m5-simulator`. The session had read-only GitHub access, so the push
  was refused (HTTP 403) and the commits were handed to the team as a git
  bundle to push themselves.
- “▼ Explore the details” is a divider heading, not a collapsible wrapper.
  Wrapping the existing sections would break the existing print rule
  `main > :not(.rotation-section)` and the existing browser tests.
- Only a confirmed farmer calendar is offered to the simulator. An unconfirmed
  or partly entered calendar falls back to the growing window, with the exposed
  family “Not evaluated”. The engine itself still handles incomplete calendars
  as specified (unit-tested).
- Skagit and Yakima are always climate-only, as specified, even if a calendar
  was entered for one of their rotation slots.
- Demo “post-harvest fall months” was read as every month without a growing
  crop, including January–March before spring planting (16 months), so that a
  cover present in fall does not vanish in December. If the team wants fall
  months only, change the six January–March rows of years 1 and 3 in
  `data/demo-scenarios.json`.
- “Appeared / disappeared” compares which families meet the concern bar, not
  which three cards are displayed, so a family does not “appear” merely because
  another dropped out of the top three.
- The comparison also reports paired medians for dry, heat and frost, in
  addition to the exposed-soil median the plan asked for.
- Missing weather on a day outside the crop months does not invalidate the dry,
  heat or frost result for that run. The archive has no missing values in these
  series, so this does not affect any current result.
- Not built: the optional extras (demo calendars for all three Palouse
  rotations, wet-event indicator, shift-crop-months lever).

## Verification (2026-11-15, this environment: Node 22.23.4, Python 3.13.18)

`.venv/bin/python scripts/build_replay.py` (first run):

```
skagit: wrote public/data/skagit/replay.json (16436 days, 9 raw archives, nulls {'PRECTOTCORR': 0, 'T2M_MAX': 0, 'T2M_MIN': 0, 'GWETROOT': 0})
yakima: wrote public/data/yakima/replay.json (16436 days, 9 raw archives, nulls {'PRECTOTCORR': 0, 'T2M_MAX': 0, 'T2M_MIN': 0, 'GWETROOT': 0})
palouse: wrote public/data/palouse/replay.json (16436 days, 9 raw archives, nulls {'PRECTOTCORR': 0, 'T2M_MAX': 0, 'T2M_MIN': 0, 'GWETROOT': 0})
```

Later runs print `unchanged` for each farm and leave the files byte-identical.
`.venv/bin/python scripts/build_replay.py --check` prints
`OK — replay.json matches the archive` for each farm and exits 0.

- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v`:
  **32 tests, OK** (18 existing + 14 in `tests/test_replay.py`).
- `npm test`: **86 tests, 86 pass, 0 fail** (49 existing + 37 new: 6 replay,
  17 simulate, 6 concerns, 8 compare).
- `npm run build`: 444 modules, built without warnings or errors.
- Browser tests against `npm run preview`, with
  `CHROMIUM_PATH=/opt/pw-browsers/chromium`: `sim-browser.cjs`,
  `browser-smoke.cjs`, `m3-browser.cjs`, `m4-browser.cjs` and
  `m42-browser.cjs` each print their PASS line and exit 0.

`tests/sim-browser.cjs` covers: lazy replay fetch; demo click → 1–3 cards,
43-tick strips, provenance chips and the HYPOTHETICAL banner; illustrative
improvement → before/after; print view, print CSS and a PDF in `work/`; demo
isolation from farmer management and scoring; climate-only Palouse and Yakima
with exposed “Not evaluated”; a farmer-confirmed calendar (synthetic test
values) with the unsaved what-if lever and stale-result notice; growing-window
lever; 320/390/768 px layouts; replay 503, corrupted-file rejection and Retry;
zero `power.larc.nasa.gov` or USDA requests; no runtime errors.

## Preview deployment

Not deployed from the coding session: the branch could not be pushed (GitHub
write access refused), and the environment has no Vercel CLI, token or project
link. If the repository's Vercel Git integration is enabled, pushing the branch
creates a preview deployment automatically. Production and deployment protection
were not touched.

## Files

Created: `scripts/build_replay.py`, `tests/test_replay.py`,
`public/data/{palouse,skagit,yakima}/replay.json`, `src/lib/replay.js`,
`src/lib/simulate.js`, `src/lib/concerns.js`, `src/lib/compare.js`,
`data/demo-scenarios.json`, `src/components/Simulator.jsx`, `SimSetup.jsx`,
`ConcernCard.jsx`, `SimComparison.jsx`, `SimulationReport.jsx`,
`tests/synthetic-replay.js`, `tests/replay.test.js`, `tests/simulate.test.js`,
`tests/concerns.test.js`, `tests/compare.test.js`, `tests/sim-browser.cjs`,
`docs/M5_VERIFICATION.md`.

Modified (additive): `src/App.jsx`, `src/style.css`, `src/config/config.json`,
`docs/METHODS.md`, `docs/AI_DISCLOSURE.md`, `README.md`, `AGENTS.md`,
`CLAUDE.md`.

All of the above were written or modified with AI assistance; see
`docs/AI_DISCLOSURE.md`.
