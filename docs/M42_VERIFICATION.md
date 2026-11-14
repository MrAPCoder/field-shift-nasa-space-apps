# M4.2 — Scientific and Usability Improvements

Base: `5233e485e0e53d6397e5ae166caa120ca2906be4` (merged M4).
Branch: `codex/m4.2-scientific-usability`.
Internal deadline supplied by the team: Sunday November 15, 2026, 8 PM Pacific.
Scope stops at M4.2; no merge, visual redesign or production deployment action.

## Delivered

- Reproducible USDA NRCS point-query acquisition and offline replay using only
  Python's standard library. Saved request/failure receipts, timestamps, exact
  configured coordinates, checksums and explicit unavailable records for all
  three locations. Soil context appears on the dashboard and printable plans.
- Six Palouse crop entries have separate, source-backed research traits: units,
  numeric ranges where supported, source locators, scope and limitations. All
  review flags remain pending. No scoring field was automatically populated.
- Palouse summary compares benefits, risks and current eligibility; cards explain
  the different studies and distinguish seed harvesting from green manure.
- Score labels distinguish provisional water-demand/practice comparisons from
  actual water savings and soil measurements. Exposure-only totals say so.
- Range edits and year copies require before/after preview and explicit review.
  Applying invalidates confirmation; final 36-month confirmation is still required.
  Unknowns remain unknown, no crop-specific exposure defaults are supplied, and
  manual edits cancel stale previews. A direct Palouse demonstration button is added.
- Plans show current scores/reasons, soil availability and evidence, expanded crop
  ranges and full source URLs. Obsolete release-specific wording was removed.

## Scientific limits and acquisition blocker

USDA retrieval is **incomplete**, not a successful soil-data import. Every
canonical point request returned:
`URLError: <urlopen error Tunnel connection failed: 403 Forbidden>`.
This is the environment proxy refusing the connection, not evidence of an outage
at USDA. An alternate USDA hostname and an outside-sandbox attempt also failed.
No soil names, map units or numerical characteristics were invented. Success-path
SQL has not been exercised live. Its parser is tested using clearly synthetic
fixtures. Restrictive depth is not queried; no unrestricted-rooting claim is made.
A successful cache can be refreshed later with `python scripts/fetch_soils.py`;
rebuild afterward because the UI bundles the saved JSON. Failed refreshes preserve
previous successful records and save a separate failure receipt.

No planting/harvest month or cover schedule was filled. The source's historical
trial events appear only as historical narrative. Water/root categories, local
crop suitability, frost thresholds, soil-health calibration, income and real field
management remain unresolved. General species references are not evidence of a
particular cultivar/treatment's local requirements. All nine published schedules
remain unknown, and all broad crop/rotation `verified` flags remain false.

All arithmetic and coefficients are unchanged. No new dependencies were added;
only existing lockfile/requirements dependencies were installed to run checks.
Existing climate caches, raw NASA archives, configuration, NASA pipeline,
`src/lib/score.js`, package files and requirements have no diff from the M4 base.

## Verification

- `npm test`: 49 passed. Includes range-boundary/replacement behavior, copied
  unknowns, immutability, confirmation withdrawal, source provenance/checksums,
  catalog evidence gates and dynamic total descriptions.
- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v`: 18 passed.
  Includes existing climate/archive checks and soil parser/failed-refresh tests.
- `npm run build`: passed using the existing lockfile. Initial JS approximately
  345 KB minified / 94 KB gzip; lazy chart bundle approximately 402 KB / 116 KB.
- `python scripts/fetch_soils.py`: attempted all three real configured points;
  exit 1, precise proxy failures recorded. `--offline`: reproduces their saved
  unavailable records and exits 1 as intended, without network access.
- M2 `tests/browser-smoke.cjs`: passed, including HTTP retry, stale requests,
  missing values, original charts, keyboard sliders and responsive layouts.
- M3 `tests/m3-browser.cjs`: passed; only its expected soil-score label was updated.
- M4 `tests/m4-browser.cjs`: passed; calendar values, independent exposure result,
  selected-plan printing, print CSS and responsive checks retained.
- M4.2 `tests/m42-browser.cjs`: passed; blocked-soil provenance, pending crop
  ranges, Palouse entry, required bulk review, copying, score invalidation,
  stale-preview cancellation, dynamic print/PDF and 320/390/768/1440 px layouts.
- Browser checks use preinstalled Playwright/Chromium, not new dependencies.
  No application runtime errors or external NASA/USDA requests during normal use.
- Browser-generated PDF text includes source ranges, pending review labels,
  missing soil data and scientific limitations. Mobile editor screenshot and a
  rendered PDF evidence page visually inspected; no clipping in checked views.
- `git diff --check`: passed. Screenshots, logs and synthetic PDFs are ignored in
  `work/`, never published as real agricultural observations.

## Sources

Exact source URLs, locators and claim boundaries are in `data/crops.json` and
`docs/AGRICULTURAL_REVIEW.md`. Sources used: FAO Crop Water Needs (Tables 4–5),
FAO-56 (Table 22), NRCS Pullman Pea Guide, Government of Saskatchewan's Soil
Improvements With Legumes, USDA ARS publication 427958, WSU STEEP winter-pea trials,
and NRCS SDA schema documentation. The inaccessible WSU garden page was not used.

## AI-generated or modified files

All M4.2 source/data/documentation/test changes were generated or edited with AI;
none grants agricultural expert approval. Complete inventory:

- `README.md`
- `data/crops.json`
- `data/rotations.json`
- `docs/AGRICULTURAL_REVIEW.md`
- `docs/AI_DISCLOSURE.md`
- `docs/METHODS.md`
- `docs/M42_VERIFICATION.md`
- `scripts/fetch_soils.py`
- `public/data/skagit/soil-source.json`, `public/data/skagit/soil.json`
- `public/data/yakima/soil-source.json`, `public/data/yakima/soil.json`
- `public/data/palouse/soil-source.json`, `public/data/palouse/soil.json`
- `src/App.jsx`
- `src/components/CalendarTools.jsx`
- `src/components/CropEvidence.jsx`
- `src/components/ManagementCalendar.jsx`
- `src/components/PrioritySliders.jsx`
- `src/components/RotationComparison.jsx`
- `src/components/RotationPlan.jsx`
- `src/components/SoilProfile.jsx`
- `src/lib/management.js`
- `src/lib/scorePresentation.js`
- `src/style.css`
- `tests/m3-browser.cjs`
- `tests/m42-browser.cjs`
- `tests/m42.test.js`
- `tests/test_soils.py`

Soil receipts record actual failed network attempts, not synthetic responses.
Agricultural research records are sourced transcriptions/contextual summaries,
not independently verified field measurements. The final handoff identifies the
pushed Git commit; no main merge or production promotion is part of M4.2.
