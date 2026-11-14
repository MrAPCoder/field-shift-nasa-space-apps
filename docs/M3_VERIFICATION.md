# M3 — approved Palouse-first demonstration complete

This completion implements the user's narrowed M3 approval: research-based Palouse
sequences and a farmer-confirmed exposure scenario, not complete scientific scoring
for all nine rotations. The branch remains unmerged; M4 has not begun.

## What works
- Three Palouse sequences have explicit demonstration-only team approval. Broad
  verification flags, unsupported traits and published schedules remain false/unknown.
- All three regions and all nine candidates remain available. Skagit and Yakima
  cannot acquire sequence approval merely by completing a calendar.
- Editable three-year calendars start with 36 Unknown months. Observed and proposed
  modes, context, confirmer and timestamp distinguish farmer statements from research.
- Planting does not imply protection: crop/cover months require explicit exposed-soil
  percentages. Bare soil means 100% exposure. Any edit revokes confirmation.
- Complete confirmed Palouse calendars enable a rainfall-exposure index from cached
  NASA normals. Water/soil/income remain unavailable. Erosion-only totals explicitly
  explain that other sliders cannot affect them. A zero erosion weight removes total.

Entries persist only within the active tab and across farm switches, not refresh.
No sample agricultural calendar is installed. See README.md for demo entry steps
and METHODS.md for formulas, provenance and scientific limitations.

## Verification executed
- `npm test`: **39 passed, 0 failed**, including 11 new calendar/provenance tests.
- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v`:
  **14 passed, 0 failed**, including archive/hash and climate regression checks.
- `npm run build`: **passed**, 424 modules transformed, no large-chunk warning.
- `node tests/browser-smoke.cjs`: **passed** against the local production preview.
  Three farms; indicators; 72 cached monthly table values; both charts; four sliders;
  responsive layouts; error/retry; stale-request cancellation and missing values.
- `node tests/m3-browser.cjs`: **passed** against the local production preview.
  All nine cards, source links, baseline selection, initial Unknown state, planted
  status without exposure blocked, three confirmed synthetic exposure comparisons,
  unavailable other metrics, erosion-only weighting, edit/Unknown invalidation,
  reconfirmation, observed/proposed labeling, farm retention and refresh reset.
  Open-calendar widths 320/390/768 px checked after responsive chart reflow.
- Browser suites reported **no console/runtime errors and no NASA API requests**.
- Mobile calendar screenshot visually inspected; labels and controls remain legible.
- `git diff --check`: passed. NASA caches, pipeline, dependencies and lockfile unchanged.

Synthetic browser inputs are ephemeral tests, never published as real farm records.
The initial responsive assertion ran during chart resize and failed; the test now
waits for layout reflow and then checks viewport overflow. No scientific assumptions
or eligibility checks were weakened to obtain passing tests.

## AI-generated or modified files in this completion
- `data/rotations.json`
- `src/App.jsx`
- `src/components/RotationComparison.jsx`
- `src/components/ManagementCalendar.jsx` (new)
- `src/lib/score.js`
- `src/lib/management.js` (new)
- `src/style.css`
- `tests/management.test.js` (new)
- `tests/m3-browser.cjs`
- `README.md`
- `docs/AGRICULTURAL_REVIEW.md`
- `docs/METHODS.md`
- `docs/AI_DISCLOSURE.md`
- `docs/M3_VERIFICATION.md`

Existing historical M3 work is disclosed in AI_DISCLOSURE.md and Git history.
No deployment/protection changes were made. Browser verification is local Chromium,
not a claim of live Vercel deployment or independent agronomic validation.
