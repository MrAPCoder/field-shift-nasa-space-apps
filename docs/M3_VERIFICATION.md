# M3 — PARTIALLY COMPLETE (agricultural evidence/review gaps)

The working M3 code is implemented and tested. Content completion is limited by
specific agricultural data gaps, not hidden behind invented scores. Work stops
before M4. This branch starts from merged main commit `c354727`.

## Implemented
- Source-linked JSON library: 11 proposed crops, eight sources opened/read, nine
  comparison slots (current/baseline and two alternatives for each farm).
- Pure deterministic scoring with explicit review/source gates, configurable
  water and soil coefficients, three-year rainfall exposure and weighted totals.
- Three responsive cards with Why, Evidence, Benefits, Data gaps and Risks to
  check locally; selectable baseline and original slider integration.
- Income always unscored; incomplete/unapproved data remains unavailable; exact
  calculations and eligibility reasons are inspectable.
- Methodology, agricultural approval checklist, AI disclosure and tests.

## Content limitations
All 11 crop entries, nine rotations and 324 cover records are unapproved.
All nine overall scores and all 27 non-income subscores are unavailable. Income
is separately unavailable for all nine. Synthetic test scores are never shown
in the app.

Three Palouse sequences are sourced explicitly. Two Yakima entries represent
sourced annual patterns repeated over a proposed three-year window, subject to
local review. All three Skagit slots and the third Yakima slot lack explicit
year-by-year assignments. These four slots are labeled TODO in the UI and JSON.

`docs/AGRICULTURAL_REVIEW.md` lists every source, relevant section, scope limit,
missing field and required approval. No fabricated dates, cover months, water
categories, root-depth categories, farm histories or profitability estimates.
Some WSU pages could not be opened (403); their snippets were not accepted as
claim evidence. No authoritative three-year Skagit sequence was established from
the accessible material. This remains an explicit M3 content blocker.

## Verification executed
- `npm test`: 28 passed, 0 failed (8 existing tests and 20 scoring/catalog tests).
- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v`:
  14 passed, 0 failed. Existing archive and climate checks; no NASA downloads.
- `npm run build`: passed, 422 modules transformed; no large-chunk warning.
- `node tests/browser-smoke.cjs`: passed the M2 regression suite against local
  production preview: three farms, nine indicators, 72 monthly table values,
  rainfall/wetness charts, sliders, preference retention, loading failure/retry,
  cancellation and missing-value states.
- `node tests/m3-browser.cjs`: passed all farms, three comparison cards per farm,
  five required content sections per card, linked sources, current/baseline
  selection and reset on farm switching, slider importance updates, all-zero
  weights, pending-review behavior, retained climate charts and 320/390-pixel
  layouts without horizontal overflow. No console errors or NASA requests.
- `git diff --check`: passed.
- M1 NASA caches, pipeline, requirements, package.json and lockfile unchanged
  from merged main. No additional dependencies installed.

The numeric scoring tests cover weighted averages and slider changes, zero-weight
and missing-data cases, unscored income, full cover/bare extremes, unequal monthly
rainfall, all 36 months, unknown/duplicate/unapproved cover, source gates,
configuration failures, mismatched climate locations, determinism and bounds.
Fixtures are labeled synthetic. No agricultural claim is validated by those tests.

## Run
```sh
npm ci
npm run dev
npm test
npm run build
npm run preview -- --host 127.0.0.1
# Separate terminal, if Playwright is already available:
node tests/browser-smoke.cjs
node tests/m3-browser.cjs
```

No live Vercel deployment was attempted for M3; no project/protection changes.
Local Chromium checks do not constitute exhaustive browser or agronomic validation.
M4's visual bare-soil calendar, peak-rainfall highlights and print plan are not built.
The next deadline cannot be assessed without a start time and content approvals;
missing verified schedules remain a blocker to meaningful numeric comparisons.

## AI-generated/modified files
- `data/crops.json`
- `data/rotations.json`
- `src/lib/score.js`
- `src/components/RotationComparison.jsx`
- `src/components/PrioritySliders.jsx`
- `src/App.jsx`
- `src/config/config.json`
- `src/style.css`
- `tests/score.test.js`
- `tests/m3-browser.cjs`
- `docs/AGRICULTURAL_REVIEW.md`
- `docs/METHODS.md`
- `docs/AI_DISCLOSURE.md`
- `docs/M3_VERIFICATION.md`
- `README.md`
