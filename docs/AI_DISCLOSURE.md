# AI assistance disclosure

For M1, OpenAI Codex read the team-provided engineering master prompt, inspected
the connected repository, wrote the React/Vite foundation, centralized the exact
team-provided farm coordinates, and implemented the Python NASA POWER pipeline,
validation, tests and documentation. Codex executed real API requests and local
verification commands. Climate outputs are computed from archived NASA responses;
synthetic data appear only in labeled unit tests. No agricultural traits,
rotations or citations were generated, and no M2 features were implemented.

Rehan and Nakul should review the formulas, limitations and verification report
before presenting results. AI assistance does not constitute independent scientific
validation or approval by NASA. NASA POWER is the data provider, not an endorser.

## M2 assistance
Codex continued from merged M1 on `origin/main` and implemented the React climate
dashboard, farm selection, four priority sliders, Recharts rainfall and modeled
wetness charts, accessible monthly tables, coverage notes, responsive CSS, and
loading/error/retry handling. It added frontend validation and Node tests, and
used the environment's existing Playwright and Chromium for browser verification.
No dependencies were added. No NASA requests were made or M1 data regenerated.
All displayed climate values come from the existing M1 JSON. Sliders express
preferences only; no crop scoring, recommendations, or M3 features were added.

## M3 assistance
Codex researched and opened authoritative USDA NRCS/ARS, WSU and Washington
agency/soil-health sources; created source-linked proposed crop/rotation JSON;
implemented deterministic scoring, comparison cards, tests and documentation.
It preserved `verified: false` for all agricultural proposals pending team review.
Unsupported traits, sequences and calendars remain TODO/null/unknown. No scientific
values, citations, current farm histories, or profitability estimates were invented.
Numeric test fixtures are explicitly synthetic and never rendered as real results.
Existing NASA caches and dependencies were not changed or regenerated. No M4
calendar, print plan or deployment changes were made.


## Approved M3 completion
Codex implemented the user-approved Palouse-first demonstration and farmer-editable
management inputs. It recorded narrow published-sequence approvals separately from
broad verification flags; no unsupported crop trait or schedule was verified. It
added monthly explicit exposure assumptions, provenance/confirmation validation,
rainfall-weighted scenario calculations, responsive controls, unit/browser tests
and updated documentation. Percentages are supplied by users, not invented by AI.
All numeric calendar fixtures in automated tests are labeled synthetic. NASA data,
dependencies and M1/M2 climate behavior remain unchanged. The simple input calendar
was explicitly authorized for M3; no M4 risk visualization or print plan was added.
The precise files modified in this completion are listed in M3_VERIFICATION.md.

## M4 assistance
Codex continued from merged main `6c40195` and implemented the month-by-month
rainfall/exposure visualization, print view, display helpers, responsive/print CSS,
unit tests and browser interaction tests. It reused M3's farmer inputs and scoring
without changing agricultural evidence, NASA caches or scoring coefficients.
The wettest-month highlighting rule is explicitly a display convention; numerical
exposure results remain M3 calculations. Browser fixtures are labeled synthetic.
Codex ran tests and inspected browser-generated print output; no PDF dependency
was introduced. Modified files and results are listed in M4_VERIFICATION.md.
No Sunday AI features or trend analysis were implemented.

## M4.2

AI assisted with USDA query/normalization code, failure receipts, crop-source
research and transcription, comparison explanations, bulk calendar editing,
score presentation, print content, tests and documentation. The complete file
inventory and verification outcomes are in `docs/M42_VERIFICATION.md`.

All source-backed crop additions remain pending team review; AI research does not
approve agronomic suitability. USDA access failed, so no soil measurements were
created. Test soil rows and calendar percentages are explicitly synthetic and
are confined to tests/ignored work artifacts. Actual scientific calculations,
coefficients and NASA archives were preserved. The team remains responsible for
reviewing claims, applicability, submission content and future deployment.

## M5 — historical replay simulator

An AI coding agent (Claude Code) implemented the M5 simulator from a written
plan supplied by the team: the offline replay builder and replay files, the
`simulation` config block, the pure replay/simulate/concerns/compare modules,
the simulator components and styles, the printable report, unit and browser
tests, and documentation. The complete file inventory and verification results
are in `docs/M5_VERIFICATION.md`.

The screening thresholds came from the team's plan and are stored as
provisional; the AI did not derive or validate them agronomically. The demo
calendar months and exposure percentages (20%, 100%, 30%) were chosen by the AI
as plainly illustrative values because the plan asked for a hypothetical demo;
they are labeled illustrative everywhere, are not sourced agronomic values, and
await team review. No crop trait, citation, farm history, soil value, approval
flag, NASA archive, climate cache or scoring coefficient was created or changed.
Unit-test weather and calendars are labeled SYNTHETIC and are confined to tests.
The team remains responsible for approving thresholds and demo values, reviewing
wording and claims, and for submission and deployment decisions.

## M5 visual simplification

AI-assisted changes on `codex/visual-farm-simulator`, based on `fable/m5-simulator`:
- Added `src/components/VisualSimulator.jsx` and `src/lib/visual.js`; revised `index.html`, `src/App.jsx` and `src/style.css` for the four-step main flow and optional Advanced Details.
- Revised `src/lib/simulate.js` to exclude cover-only months from cash-crop weather exposure; revised `src/components/Simulator.jsx` to clarify saturated, overlapping historical screens.
- Added visual unit/browser checks; updated simulation/comparison expectations for the corrected crop scope and legacy browser checks to open Advanced Details.
- Updated METHODS, verification notes, AGENTS and CLAUDE. No dependencies, raw data, climate files, thresholds, demo values, approvals or crop citations changed.
- Illustrated crop symbols and colors are interface artwork, not plant growth, measured soil health or crop damage outputs. No new agricultural evidence was generated.

## M6 NASA-powered daily soil-water model

Continued on `codex/visual-farm-simulator`; no new project or main-based branch.
AI-assisted implementation added `src/lib/soilWater.js`, the offline
`scripts/build_soil_weather.py`, three `soil-weather.json` files and separately
archived POWER wind/pressure responses, `public/data/smap-status.json`, unit tests
and Python provenance tests. Revised `VisualSimulator.jsx`, `App.jsx`, styles,
config and the existing visual browser test connect six inputs to the calculated
daily trajectory. Documentation and guidance describe the sources, formulas,
hypothetical assumptions, verification and limitations.

NASA data were retrieved from POWER, not generated. Existing weather archives,
research citations, M5 thresholds, demo calendars and agricultural approval flags
were preserved. Generic soil values and crop coefficients cite primary FAO and
extension sources. Initial storage, fixed layer depth, timing fractions and ground
cover are explicitly hypothetical. SMAP was not retrieved and is unavailable.
The model does not estimate crop growth, damage, soil health, yield or profit.

## M7 watchable farm and soil simulation

AI-assisted changes on `claude/loving-ride-xv1d5o`, based on `codex/visual-farm-simulator`:
- Added `src/lib/scene.js`, `src/components/FarmScene.jsx` and `tests/scene.test.js`.
  Revised `src/components/VisualSimulator.jsx`, `src/App.jsx` and `src/style.css`.
  Rewrote `tests/visual-browser.cjs`.
- Added read-only diagnostics to `src/lib/soilWater.js`: `monthlyBalance`,
  `periodBalance`, `startupSensitivity`, a per-day `freezing` flag, `wrapsYear` and
  `summary.freezingPrecip`. These add tests to `tests/soil-water.test.js`.
- Updated METHODS and added M7_VERIFICATION. No formulas, coefficients, data,
  approvals, citations or dependencies changed.
- The crop, root, sky and soil artwork is schematic interface illustration of modeled
  values, not observed fields, predicted growth or soil health.

## M8 farm score and biggest weakness

AI-assisted changes on `claude/farm-score`, based on `claude/farm-scene`:
- Added `src/lib/grade.js`, `src/components/ScorePanel.jsx`, `tests/grade.test.js` and
  `docs/M8_VERIFICATION.md`.
- Revised `VisualSimulator.jsx`, `FarmScene.jsx`, `App.jsx`, `style.css`,
  `tests/visual-browser.cjs` and METHODS.
- Added `soilSimulation.grading` and `soilSimulation.demo` to `config.json`. These are
  provisional scoring targets and an illustrative demo amount (40 mm/week). They are not
  sourced agronomic thresholds or recommendations.
- No model formulas, coefficients, NASA data, approvals, citations or dependencies
  changed. Scores and suggestions come only from reruns of the existing model.

## M9 simplified simulator and multi-factor farm score

AI-assisted changes on `claude/farm-score`:
- Rewrote `src/lib/grade.js` (farm-score-v2) and `src/components/ScorePanel.jsx`, and
  `tests/grade.test.js`.
- Revised `VisualSimulator.jsx`, `FarmScene.jsx`, `App.jsx`, `style.css`, `index.html`, and
  `config.soilSimulation.grading`.
- Added `src/research.jsx`, `research.html`, `vite.config.js`, `public/docs/*`,
  `docs/M9_VERIFICATION.md` and METHODS "M9".
- Updated `tests/visual-browser.cjs`, and pointed the five legacy browser suites at
  `research.html`.
- Weights, targets, thresholds and the 12.7 mm heavier-day convention are provisional
  teaching conventions, not sourced agronomic thresholds. No NASA data, model formulas,
  coefficients, approvals, citations or dependencies changed. Legacy components and data are
  preserved.
