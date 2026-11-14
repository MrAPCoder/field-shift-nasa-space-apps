# M4 — rainfall visualization and printable rotation plan

Implemented from merged main `6c40195` on `codex/m4-rainfall-plan`.
This milestone adds the approved M4 visualization/print flow only. It does not
add Sunday AI features, trend analysis, agricultural claims or new dependencies.

## Implemented and scientific scope
- Three-year, 36-month visual calendars on all nine existing rotation cards.
  Status, monthly NASA rainfall in mm and explicit exposed-soil percentage are
  shown separately. Unknown is never assumed bare or protected.
- Wettest-month labels use the documented third-highest monthly-normal rule,
  including ties. Outlines indicate high rain plus entered exposure above zero,
  not a validated erosion hazard. Draft assumptions remain clearly labeled.
- A prominent exposure percentage reuses M3's confirmed rainfall-weighted
  calculation. Proposed and farmer-observed management remain distinct, and neither
  becomes independently verified. Partial exposure is described accurately.
- Each rotation opens its own print view with crop sequence, actual known timing
  (currently unknown), climate indicators, priorities, result/formula, calendar,
  provenance, source URLs, gaps, local risks and disclaimer. Browser print and CSS
  only; no PDF dependency. Incomplete plans may be printed honestly.
- Palouse-only scoring eligibility is unchanged. Skagit/Yakima remain available
  with incomplete evidence. Water, soil and income remain unavailable.

## Actual verification
- `npm test`: 44 passed, zero failed (39 existing tests + 5 M4 tests).
- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v`:
  14 passed, zero failed; archived NASA hashes and calculations checked.
- `npm run build`: passed, 427 modules transformed; no large-chunk warning.
- `node tests/browser-smoke.cjs`: passed (M2 regression).
- `node tests/m3-browser.cjs`: passed (M3 calendar, scoring and provenance regression).
- `node tests/m4-browser.cjs`: passed. Checked all nine visual calendars and all
  324 displayed NASA monthly values, three-farm incomplete print plans, synthetic
  partial exposure independently calculated against real cached rainfall,
  highlighting, printing the selected card rather than the baseline, edit invalidation,
  unknown handling and farm changes. Print button invoked browser printing.
- Desktop 1440 px and mobile/tablet 320/390/768 px checked without overflow.
- Print-media CSS hides dashboard controls/other cards and retains the plan.
  Chromium generated a four-page A4 PDF; extracted text and a rendered page were
  inspected. Calendar cells, evidence URLs, uncertainties and disclaimer were present.
  Sample inputs are explicitly synthetic and reside only in ignored `work/`.
- Browser suites reported no runtime/console errors and no NASA API requests.
- `git diff --check`: passed. Agricultural JSON, M3 scoring/management engine,
  NASA caches/pipeline, config, package manifest and lockfile unchanged from main.

The final completion report records the preview deployment URL, remote commit
and live verification result after the commit is pushed. No production promotion
or protection change is authorized or part of this milestone.

## Run and demonstrate
See README.md for commands. Select Palouse, enter actual farmer-supplied scenario
assumptions in each card's management editor, and confirm all 36 months to display
exposure. Use View printable plan on the desired card, then Print this plan.
Do not present test assumptions as observations. Tab-local calendars reset on reload.

## AI-generated/modified files
- `README.md`
- `docs/AI_DISCLOSURE.md`
- `docs/METHODS.md`
- `docs/M4_VERIFICATION.md`
- `src/components/RotationComparison.jsx`
- `src/components/RainfallCalendar.jsx`
- `src/components/RotationPlan.jsx`
- `src/lib/plan.js`
- `src/style.css`
- `tests/plan.test.js`
- `tests/m4-browser.cjs`

## Remaining limitations
Monthly exposure is a farmer estimate paired with historical normals, not a soil-loss
model or observed erosion. Storm timing, slope, soil properties and residue effects
are not modeled. High-rain highlighting is a display rule, not an agronomic threshold.
No new evidence resolves planting/harvest dates, regional rotation gaps or water,
soil or income scoring. Research-sequence approval does not approve local suitability.
Browser verification uses Chromium; print pagination can vary by browser/printer.
