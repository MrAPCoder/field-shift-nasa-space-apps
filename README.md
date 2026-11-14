# Field Shift — NASA Space Apps 2026

Washington farm-planning prototype. **M4 rainfall visualization and printable plans implemented.**
The dashboard uses unchanged M1 NASA POWER caches and retains all nine rotation
slots across three regions. Three published Palouse sequences are approved only
as research scenarios. Complete, explicitly confirmed farmer calendars enable a
rainfall-exposure estimate; water, soil and income remain unavailable. No farm
history, local suitability or unsupported scientific trait is asserted.

## Setup and run
Requires Node.js 20.19+ or 22.12+ and Python 3.12+.

```sh
npm ci
python -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run dev -- --host 0.0.0.0
```

The dashboard reads cached climate JSON. No NASA requests are made during use.
Priority values persist across farm switches within the page session.
Dependencies are limited to the specified React, Vite, Recharts, requests and
pandas (and their transitive dependencies). No backend or extra test framework.

## Generate and verify data

```sh
.venv/bin/python scripts/fetch_nasa.py
.venv/bin/python scripts/fetch_nasa.py --offline
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
npm test
npm run build
npm run preview -- --host 0.0.0.0
```

The pipeline reads `src/config/config.json`. Existing raw chunks are reused;
remove selected archives before requesting a fresh NASA download. The offline
command recomputes from archived responses without any network access.
`public/data/<farm>/climate.json` is the compact frontend contract, with annual
and monthly statistics, coverage, thresholds and provenance. `raw/*.json.gz`
contains original responses; `public/data/comparison.json` is the M1 comparison.
Normal app use must read cached aggregates, never query NASA POWER.

## Documentation
- `docs/METHODS.md`: formulas, missing data, units and scientific limitations.
- `docs/M1_VERIFICATION.md`: pipeline verification results and comparison.
- `docs/M2_VERIFICATION.md`: dashboard tests, browser checks and changed files.
- `docs/AI_DISCLOSURE.md`: AI assistance and team review responsibilities.
- `docs/AGRICULTURAL_REVIEW.md`: source URLs, proposed claims and exact data gaps.
- `docs/M3_VERIFICATION.md`: M3 tests, scope and completion limits.
- `docs/M4_VERIFICATION.md`: visual calendars, print checks and M4 scope.

## Preview deployment
Vercel static hosting: build command `npm run build`, output `dist`, Vite preset.
M4 targets a preview in the existing Field Shift project, never production.
The task completion report records the actual deployment URL/status and any access
limitations. Deployment protection must not be changed without approval.

Optional browser checks use an existing Playwright installation (no new project
dependency): start `npm run preview`, then `node tests/browser-smoke.cjs`.

## M3 comparison checks

`npm test` includes the pure scoring tests. With the existing optional Playwright
installation and a running production preview, use `node tests/m3-browser.cjs`.

`data/crops.json` and `data/rotations.json` contain proposed agricultural records.
Do not change `verified` flags merely to make scores appear. Follow the review
procedure in `docs/AGRICULTURAL_REVIEW.md`. `src/config/config.json` holds all
provisional category mappings, summer months and soil component weights.


### Enter a live M3 demonstration

Select Palouse and open each card's “Enter three-year management calendar.” Leave
mode as Proposed scenario for hypothetical inputs. Describe the scenario and
meaning of years 1–3, enter the confirmer name, then set all 36 monthly statuses.
For planted/cover months, explicitly enter average exposed-soil percentages;
Unknown is never bare and a planted crop is never assumed fully protective.
Retained residue can still protect soil after harvest. Bare soil explicitly means
100% exposed. Confirm each complete calendar to calculate using cached NASA rain.

The display identifies farmer assumptions and shows rainfall-weighted exposure
and its inverse 0–100 index. Higher index means less assumed exposure, not measured
erosion reduction. Edit any entry to withdraw confirmation; confirm again after
review. Entries survive farm changes in the current tab, but refresh clears them.
Keep erosion importance above zero for an overall total; the other sliders cannot
change an erosion-only total. Never present hypothetical inputs as farm observations.


## M4 end-to-end demonstration and print

1. Select any Washington farm and inspect its cached climate charts.
2. Select a comparison baseline and adjust the four importance sliders.
3. For a scored demonstration, select Palouse and enter/confirm each scenario's
   M3 calendar as described above. Do not represent hypothetical inputs as observations.
4. Read each card's visual calendar: management status, NASA monthly rain, entered
   exposure, high-rain labels and outlines. Unknown is never treated as bare soil.
5. Select **View printable plan** on the desired rotation, review its information,
   then **Print this plan**. Browser printing can save a PDF. Missing planting dates
   and other evidence remain explicitly unknown, including on paper.

No NASA API requests occur during normal use. No PDF library or new dependency was
added. Calendar inputs remain tab-local and are lost on refresh. The visible
exposure percentage describes rainfall-weighted assumptions, not measured erosion.

M4 tests (existing Playwright/Chromium required for browser tests):

```sh
npm test
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
npm run build
npm run preview -- --host 127.0.0.1
# In a second terminal:
node tests/browser-smoke.cjs
node tests/m3-browser.cjs
node tests/m4-browser.cjs
```

Optional browser overrides: `PREVIEW_URL` and `CHROMIUM_PATH`. Test screenshots and
browser-generated sample PDF go to ignored `work/`; all sample calendar inputs
are synthetic. This completes M4 only; Sunday AI features and trends are out of scope.

## M4.2 — scientific and usability improvements

Use **Start Palouse demonstration** to inspect three sourced research sequences,
a concise benefits/risks comparison, and expandable crop reference ranges. Trait
review remains pending; the new information does not unlock water or soil scores.
Score wording distinguishes practice/demand proxies from measurements.

In a calendar, choose a range and explicitly enter its status and exposure, or
copy one year's entries into another. **Preview** shows every replacement.
Check the review box and apply, then review and **Confirm complete calendar**.
Edits withdraw confirmation. Unknown remains unknown; copies are assumptions,
not evidence of identical conditions. No inputs are uploaded or retained on reload.
The printable plan now reflects current eligibility and includes crop/soil sources.

USDA soil acquisition was blocked by a network-proxy HTTP 403 for all three
locations. The app displays unavailable characteristics with exact provenance,
not fabricated soil values. To retry from an environment with USDA access:

```sh
python scripts/fetch_soils.py
python scripts/fetch_soils.py --offline
```

Exit 1 means acquisition/validation is incomplete; inspect `soil-source.json` and
`soil.json` in each `public/data/<farm>/` directory. Rebuild after successful
acquisition. Existing successful data are retained on a failed refresh.
Live successful soil retrieval is not verified in this environment.

Additional checks: `node tests/m42-browser.cjs` against the existing local preview.
See `docs/M42_VERIFICATION.md` for results, limitations and AI-modified files.
M4.2 does not merge to main, change production, redesign visuals, add dependencies,
or modify NASA data, scoring formulas or coefficients.
