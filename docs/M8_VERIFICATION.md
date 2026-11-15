# M8 farm score, biggest weakness and model-supported improvement: verification

Branch `claude/farm-score`, based on `claude/farm-scene` (`923eb33`). No merge to
`main`, no production deployment.

## Scope note

The task brief's section 1 (the grading definition) was missing from the request. In
this session the user chose the proposed 35/35/30 structure: Irrigation Efficiency,
Crop Water Supply and Rain Exposure Protection (see METHODS, "M8"). The targets are
provisional scoring conventions in `config.soilSimulation.grading`, pending team review.

## Delivered

- `src/lib/grade.js`: 100-point score, "Not scored" gating, letter grade,
  biggest-weakness analysis with model-rerun improvements and tradeoffs.
- `src/components/ScorePanel.jsx`: score card, Your Biggest Weakness, How to Improve,
  Try this improvement (apply + undo), other categories collapsed, score methods in
  Advanced Details.
- `VisualSimulator.jsx`: one-click Palouse demo (no irrigation vs. labelled
  illustrative 40 mm/week, Apr–Aug). The weather strip shows only precipitation and drying
  demand, with other NASA inputs one click away. Exposure and month-to-date details are
  collapsed. Before/after cards show drainage and the farm score change.
- `FarmScene.jsx`: storage-overflow marker on drainage days.
- Animation, playback controls and the six inputs are unchanged.

## Example (Palouse 2023, spring wheat, loam, Apr–Aug, bare, 0 mm/week)

43/100 (F): Irrigation Efficiency 35/35, Crop Water Supply 0/35, Rain Exposure 8/30.
Biggest weakness: Rain Exposure Protection. 491 of 669 mm of NASA precipitation (73%)
fell on exposed soil, 446 mm of it off-season. Suggested change: crop residue, which
raises exposure 8 → 30 and the total 43 → 65 (D). Tradeoff: 42 mm more drainage.
Crop Water Supply loses more raw points, but its best tested change (season one month
earlier) gives only +9.

## Commands and results (run in this environment)

| Command | Result |
| --- | --- |
| `npm test` | 130 passed, 0 failed (118 existing + 12 new in `tests/grade.test.js`) |
| `npm run build` | passed, no new dependencies |
| `python3 scripts/build_soil_weather.py --check` | exit 0 |
| `python3 -m unittest discover -s tests -p 'test_*.py'` | 8 ran OK; `test_climate` and `test_replay` could not import pandas on this machine, identical without these changes |
| `node tests/visual-browser.cjs` (updated) | **not run**: Playwright/Chromium are not installed here |

`tests/grade.test.js` covers the following:
- Category bounds and 0–100 totals over 405 scenarios: 3 farms × 5 years × 3 crops ×
  3 irrigation amounts × 3 covers.
- Each metric matches the daily records.
- "Not scored" for failed runs, missing pairs, mismatched weather and missing forcing.
- Candidates never change soil, location, crop or year.
- The biggest weakness is the largest total gain, not the lowest raw score, and the
  analysis is deterministic.
- Every displayed before/after number equals an independent rerun on the same weather,
  and monthly balances close for suggested scenarios.
- Tradeoff reporting.
- "No supported change" and "meets targets" outcomes.
- Apply/undo scoring.
- The demo is labelled illustrative and seasonal, and its overflow days drain only at
  full storage.

Manual check in a browser at desktop, 375 px and 320 px:
- No horizontal overflow and no console errors.
- The score, weakness and improvement match Node.
- Try this improvement redraws the farm (cover → residue) and shows 43 → 65.
- Undo restores the previous runs and inputs.
- The demo label and overflow marker appear on 2023-05-11.

## Remaining

- Run `tests/visual-browser.cjs` and the other browser suites where Playwright exists.
- The team should review the provisional targets (10/60%, 90/50%, 30/90%) and the
  minimum gain and loss thresholds.
- Model limits are unchanged from M6/M7. No growth, yield, soil-health or erosion
  outputs.
