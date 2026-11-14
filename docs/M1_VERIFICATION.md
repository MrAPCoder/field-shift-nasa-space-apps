# M1 verification — COMPLETE

## Live access and retrieval
NASA POWER initial connectivity probe returned HTTP 200 with valid daily JSON for
Skagit, January 1–3, 2025. A six-parameter 1981 probe returned HTTP 200 and explicitly
reported the pre-1984 solar limitation. The completed pipeline downloaded 27
five-year responses (nine per farm), covering 1981-01-01 through 2025-12-31.
Retrieval timestamps and exact URLs are retained in the archives and climate files.

## Actual comparison
Values below are arithmetic means; parentheses identify valid years.

| Farm | Mean annual rain (mm) | Mean frost-free days | Mean hot days/year | GWETROOT coverage |
|---|---:|---:|---:|---|
| Skagit Valley | 1323.25 (45) | 247.44 (43) | 0.64 (45) | 16,436/16,436 days, 100% |
| Yakima Valley | 321.49 (45) | 195.82 (45) | 37.87 (45) | 16,436/16,436 days, 100% |
| Palouse | 731.68 (45) | 152.18 (45) | 14.00 (45) | 16,436/16,436 days, 100% |

GWETROOT spans the full 1981–2025 period for all three farms. All 12 monthly rainfall
normals use 45 complete years. The four other non-solar variables also have 100%
daily coverage. There are no duplicate or absent dates, invalid values, or
inconsistent variable lengths in the validated data.

## Suspicious-statistic review
Skagit's long frost-free mean was checked against raw temperatures. In 1999 and
2004 there is no qualifying July–December frost: minimum temperatures over those
half-years are 0.63°C and 0.09°C respectively. These two boundary-based season
lengths remain null. They are not interpreted as 365-day seasons and do not enter
the mean. This valid-year selection can affect interpretation of the average.

Annual ranges from the archives:

| Farm | Annual rain range (mm) | Valid frost-free range (days) | Hot-day range |
|---|---:|---:|---:|
| Skagit | 933.82–1694.11 | 214–325 | 0–3 |
| Yakima | 218.84–534.60 | 158–243 | 14–68 |
| Palouse | 518.58–1124.42 | 113–181 | 0–33 |

The wet/mild Skagit and drier/hotter Yakima contrast is consistent with the supplied
regional contexts. No annual rainfall exceeds the configured review threshold.
These checks establish internal consistency, not independent field validation.

Solar missingness is not concealed:
- Skagit: 1,098 missing days; 93.3195% coverage. In addition to 1981–1983,
  missing on 1989-01-08, 1990-01-05 and 1991-12-08.
- Yakima: 1,095 missing days; 93.3378% coverage, all in 1981–1983.
- Palouse: 1,096 missing days; 93.3317% coverage, including 1989-01-09.

Solar data are retained but do not enter the requested rainfall/frost/hot/wetness
indicators. All sentinels are excluded from calculations.

## Executed verification
- `.venv/bin/python scripts/fetch_nasa.py`: PASS, all 27 live chunks validated.
- `.venv/bin/python scripts/fetch_nasa.py --offline`: PASS, all aggregates rebuilt
  exclusively from cached responses.
- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v`:
  **14 tests passed, 0 failed**. Includes independent standard-library recalculation
  for all farms, 135 annual records, monthly rainfall and wetness, and archive hashes.
  Synthetic unit cases cover thresholds, leap years, incomplete periods, absent
  frost boundaries, zero rain, sentinel handling, malformed data, units, duplicate
  dates, early solar coverage, transient retry/backoff and permanent HTTP errors.
- `npm test`: **3 tests passed, 0 failed**, one frontend cache-contract test per farm.
- `npm run build`: PASS, Vite 7.3.8, 24 modules transformed.
- `npm run dev -- --host 127.0.0.1`: initialized successfully; HTTP GET `/` and
  transformed `/src/App.jsx` succeeded. No interactive browser flow was tested.
- `git diff --check`: PASS.
- Generated compact JSON exists for all farms; each is approximately 25 KB.
  Compressed raw archives and compact outputs total approximately 1.4 MB.

No deployment was attempted: deployment and interactive dashboard are M2 scope.
No known failing tests. Limits: grid-to-field mismatch, provisional 32°C threshold,
solar missingness, and unavailable Skagit frost boundaries described above.
The M2 deadline cannot be guaranteed without its approval/start time; there is no
remaining M1 technical blocker. Work stops here for review.

## Files generated or changed
See the complete list below. The raw archive names encode inclusive year ranges.
- `.gitignore`
- `README.md`
- `docs/AI_DISCLOSURE.md`
- `docs/M1_VERIFICATION.md`
- `docs/METHODS.md`
- `index.html`
- `package-lock.json`
- `package.json`
- `public/data/comparison.json`
- `public/data/palouse/climate.json`
- `public/data/palouse/raw/1981-1985.json.gz`
- `public/data/palouse/raw/1986-1990.json.gz`
- `public/data/palouse/raw/1991-1995.json.gz`
- `public/data/palouse/raw/1996-2000.json.gz`
- `public/data/palouse/raw/2001-2005.json.gz`
- `public/data/palouse/raw/2006-2010.json.gz`
- `public/data/palouse/raw/2011-2015.json.gz`
- `public/data/palouse/raw/2016-2020.json.gz`
- `public/data/palouse/raw/2021-2025.json.gz`
- `public/data/skagit/climate.json`
- `public/data/skagit/raw/1981-1985.json.gz`
- `public/data/skagit/raw/1986-1990.json.gz`
- `public/data/skagit/raw/1991-1995.json.gz`
- `public/data/skagit/raw/1996-2000.json.gz`
- `public/data/skagit/raw/2001-2005.json.gz`
- `public/data/skagit/raw/2006-2010.json.gz`
- `public/data/skagit/raw/2011-2015.json.gz`
- `public/data/skagit/raw/2016-2020.json.gz`
- `public/data/skagit/raw/2021-2025.json.gz`
- `public/data/yakima/climate.json`
- `public/data/yakima/raw/1981-1985.json.gz`
- `public/data/yakima/raw/1986-1990.json.gz`
- `public/data/yakima/raw/1991-1995.json.gz`
- `public/data/yakima/raw/1996-2000.json.gz`
- `public/data/yakima/raw/2001-2005.json.gz`
- `public/data/yakima/raw/2006-2010.json.gz`
- `public/data/yakima/raw/2011-2015.json.gz`
- `public/data/yakima/raw/2016-2020.json.gz`
- `public/data/yakima/raw/2021-2025.json.gz`
- `requirements.txt`
- `scripts/fetch_nasa.py`
- `src/App.jsx`
- `src/config/config.js`
- `src/config/config.json`
- `src/main.jsx`
- `src/style.css`
- `tests/cache.test.js`
- `tests/test_archives.py`
- `tests/test_climate.py`
