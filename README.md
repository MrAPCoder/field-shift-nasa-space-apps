# Field Shift — NASA Space Apps 2026

Washington farm-planning prototype. **M1 only:** React/Vite scaffold and cached
NASA POWER climate pipeline. M2 dashboard and deployment have not begun.

## Setup and run
Requires Node.js 20.19+ or 22.12+ and Python 3.12+.

```sh
npm ci
python -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run dev -- --host 0.0.0.0
```

The initial page is a milestone placeholder, not an interactive dashboard.
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
- `docs/M1_VERIFICATION.md`: actual verification results and comparison.
- `docs/AI_DISCLOSURE.md`: AI assistance and team review responsibilities.

## Later deployment
M2 will use Vercel static hosting: build command `npm run build`, output `dist`.
No deployment was created during M1. Do not start M2 without team authorization.
