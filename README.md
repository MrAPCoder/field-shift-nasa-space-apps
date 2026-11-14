# Field Shift — NASA Space Apps 2026

Washington farm-planning prototype. **M2:** responsive climate dashboard using the
verified M1 NASA POWER caches. Choose a farm, inspect rainfall and modeled wetness,
and set four planning priorities. Crop scoring remains out of scope until M3.

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

## Preview deployment
Vercel static hosting: build command `npm run build`, output `dist`, Vite preset.
The connected Vercel team currently requires access authorization; no preview URL
has been created. See the M2 verification report. Do not begin M3 without approval.

Optional browser checks use an existing Playwright installation (no new project
dependency): start `npm run preview`, then `node tests/browser-smoke.cjs`.
