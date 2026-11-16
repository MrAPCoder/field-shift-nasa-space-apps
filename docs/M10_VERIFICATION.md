# M10 design overhaul, scoring corrections and farmer priorities: verification

Branch `claude/farm-score`, continuing from `e7c62d8`. No merge to `main`, no production
deployment.

## Scoring issues found and fixed

| Issue | Finding | Fix |
| --- | --- | --- |
| Score rose while stress days rose | In a 720-scenario sample, 298 suggestions added ≥ 7 stress days. Worst: "Stop irrigating", stress 0 → 60, score 53 → 58 | Crop-water guardrail; such options are only shown as labelled tradeoffs. 0 remain |
| Unequal weighting | Zero irrigation was rescaled to 70 points (crop water ≈ 71% vs 50%) | Fixed 100-point scale; no irrigation = full irrigation-efficiency credit |
| "Eight factors" | Seven scored measures; drainage is reported | Docs corrected |
| "Irrigation used by the crop" | It is added crop-season ET from a paired run | Renamed "Irrigation efficiency (modeled)"; wording in UI and docs |
| Drainage wording | Could read as field drainage | "Modeled drainage below 0.6 m" everywhere |

## Rotation comparison

Evaluated and not built: there are no sourced water parameters for the alternative crops,
winter phases are unmodeled, and there are no local planting dates. Documented in METHODS
M10 and in How It Works §5, with a challenge-coverage table.

## Commands and results (run in this environment)

| Command | Result |
| --- | --- |
| `npm test` | 137 passed, 0 failed |
| `npm run build` | passed, no new dependencies |
| `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'` | 35 passed |
| `.venv/bin/python scripts/build_soil_weather.py --check` · `build_replay.py --check` | exit 0 · exit 0 |
| `node tests/visual-browser.cjs` (updated for the new layout) | PASS |
| `browser-smoke`, `m3-browser`, `m4-browser`, `m42-browser`, `sim-browser` on `research.html` | all PASS |

New and updated tests:
- The fixed scale: every total is the plain sum, and no irrigation gives full efficiency credit.
- The guardrail: across a grid, the balanced option is never a material worsening, every
  option's reported shortage change equals a rerun, the avoid-shortage option never worsens
  shortage, extra stress days are always listed, and the reported Skagit case is checked.
- Priority options, and the browser checks: the options table, the save-water warning, the
  demo story numbers equal to a Node analysis, and the auto-run.

## Visual checks

Screenshots were reviewed at 1366, 1440, 768 and 390 px:
- the default view, the demo view, the results card and options table, and the mobile
  settings, score and readout;
- no horizontal overflow or console errors.

Overlaps found and fixed:
- the drainage arrow over the below-layer tag;
- the ghost label over the "100% full" gauge caption;
- a truncated soil option.

## Remaining

- The weights, targets, guardrail thresholds and the demo amount are provisional and need
  team and agronomist review.
- Rotation comparison needs sourced crop parameters, a winter model and local dates.
- Local soil data is still unavailable.

## M11 visual redesign: verification addendum

The olive and cream redesign changes presentation only. The browser suite was updated for
the shorter labels. `npm test` (137), Python (35), both data checks and all six browser
suites pass. Screenshots were reviewed at 1440 and 390 px (default and demo views) with no
horizontal overflow.
