# M9 simplified simulator and multi-factor farm score: verification

Branch `claude/farm-score`, continuing from `d9cb839`. No merge to `main`, no production
deployment.

## Delivered

- **Main page simplified:** welcome with Try Demo, six inputs plus a compact NASA weather-year
  selector, farm simulation, score card, before and after, and a footer with three docs links.
- **Advanced Details removed from the main page.** The earlier tools are preserved unchanged
  at `research.html`.
- **Docs pages:** `public/docs/nasa-data.html`, `how-it-works.html` and `limitations.html`.
- **`farm-score-v2`:** eight factors in three groups with unequal weights (50/30/20).
  Drainage caused by irrigation is the reported complement of irrigation use, not scored
  twice. "Not scored" gates for unrealistic seasons, missing data, freezing-precipitation
  seasons and starting-water sensitivity. See METHODS "M9".
- **Score card:** overall score, biggest problem (always named when ≥ 3 points are lost) and
  the best tested improvement, with the new score, tradeoffs, Try this improvement and Undo.
  It shows no bars, weights or letter grades.
- **Recommendations:** real reruns of irrigation × cover, including limited combinations. They
  must hold for 0/50/100% starting water and a dry-winter bound. They never change planting
  dates, soil, crop, location or year.
- **Demo:** opens on planting day. The before and after shows soil water, stress days,
  drainage and the score (Palouse 2023: 14 → 58, with "Excessive irrigation" and a
  suggestion to reduce to 25 mm/week, which scores 66).
- **Scene:** the ET arrow label now reads "Water used". The legend is simplified to colour
  keys plus one sentence. The panel's exposure and month-to-date extras are removed (monthly
  balances stay in the unit tests).

## Scientific audit

- **Daily NASA values per date, month boundaries, leap years and carryover:** checked by
  existing tests, plus a new audit test. In it, January start = assumed initial storage, each
  month's start = the previous month's end, December end = final storage, and February has
  28 or 29 days, across all three farms in 2021 and 2024.
- **Winter:** precipitation on freezing days is excluded from exposure scoring. Seasons with
  > 25% of crop-season precipitation on freezing days are not scored. Suggestions must pass
  the dry-winter bound.
- **Initial water:** the score is rerun at 0/50/100%. The largest spread was 10 points across
  3,240 scenarios, 67 show a note, and none hit the 15-point withhold.
- **Historical weather:** the simulator uses 2021–2025 only, and this is stated in the UI and
  docs.
- **GWETROOT:** never used by the score (tested) and described as regional modeled context.
- **Irrigation decomposition** closes to 1e-6 mm.

## Commands and results (run in this environment)

| Command | Result |
| --- | --- |
| `npm test` | 136 passed, 0 failed (118 earlier + 18 in `tests/grade.test.js`) |
| `npm run build` | passed, two HTML entries, no new dependencies |
| `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'` | 35 passed |
| `.venv/bin/python scripts/build_soil_weather.py --check` | exit 0 |
| `.venv/bin/python scripts/build_replay.py --check` | exit 0 |
| `node tests/visual-browser.cjs` (updated) | PASS |
| `browser-smoke`, `m3-browser`, `m4-browser`, `m42-browser`, `sim-browser` (now on `research.html`) | all PASS |

The browser suites ran against `npm run preview`, using local Google Chrome via `CHROMIUM_PATH`
and `playwright` installed in a temporary folder (not a project dependency).

`visual-browser.cjs` covers:
- frame-by-frame equality with an independent Node model run;
- score, problem and improvement equal to a Node `analyzeFarm`;
- apply and undo, "Not scored" for a New-Year season, and the demo score story;
- the year selector and leap day, keyboard slider and button activation;
- 320/390/768 px with no overflow, and reduced motion;
- the docs links (HTTP 200) and the research archive;
- error and retry, stale-request cancellation, and no live NASA requests.

## Remaining

- The weights, targets and "Not scored" thresholds are provisional teaching conventions that
  need team and agronomist review.
- Irrigation timing and local planting windows cannot be tested with the current model and
  data.
- Model limits are unchanged: one bucket, generic parameters, no snow, frozen ground, runoff
  or calibration.
