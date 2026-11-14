# Field Shift — NASA Space Apps 2026

Washington farm-planning prototype. **Approved M3 Palouse-first demonstration implemented.**
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

## Preview deployment
Vercel static hosting: build command `npm run build`, output `dist`, Vite preset.
The connected Vercel team currently requires access authorization; no preview URL
has been created. See the M2 verification report. M3 was not deployed. Do not begin M4 without approval.

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
