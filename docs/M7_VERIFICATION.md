# M7 watchable farm and soil simulation: verification

Branch `claude/loving-ride-xv1d5o`, based on `codex/visual-farm-simulator` at
`6b31bb1`. No merge to `main`, no deployment.

## Delivered

- The main view is now an SVG farm and soil cross-section. It shows schematic crops,
  one uniform soil-water store with a gauge and crop stress line, flow arrows scaled
  in mm (NASA precipitation, user irrigation, calculated ET with its demand, and
  drainage), sky brightness from solar radiation, and frost and freezing-precipitation
  marks. The annual line graph moved to Advanced Details.
- Controls: Play/Pause, a day slider, previous/next day, and 12 month jump buttons.
  The scene, weather strip, slider date and panel all read the same daily record.
- The soil panel shows available water (mm and %), dryness status, today's flows and
  net change, a one-sentence cause, soil exposure, cautions (freezing, starting-water
  assumption, previous-autumn planting) and a month-to-date balance check.
- Compare: an After/Before toggle redraws the scene for either run. A ghost level
  shows the other run on the same date, and the cards show before → after with deltas.
- Advanced Details adds the yearly graph (before/after), a monthly water-balance table
  with residuals, a starting-water sensitivity note and the illustration mapping rules.

## Audit findings on the existing model

1. Calendar indexing is correct. Every daily record reads its own date's NASA values,
   all 1,826 archived days are used exactly once across 2021–2025, and 2024-02-29 exists.
2. Monthly conservation closes: residual < 1e-9 mm for 15 farm-years × 4 scenario
   families × 12 months.
3. **Starting-water assumption.** This was not reported in M6. Unirrigated Yakima loam
   runs still depend on the assumed Jan 1 storage until late July–August. Palouse
   clears by early March and Skagit by February. This is now shown in the UI and tested.
4. **Freezing precipitation is material.** For Palouse in 2021–2025, 19–38% of annual precipitation
   falls on days with mean temperature ≤ 0 °C and is infiltrated as liquid. It is now
   flagged per day and is never drawn as liquid infiltration.
5. Wrapped seasons such as Oct→Jul use the previous-autumn calendar for coefficients
   and irrigation, but start Jan 1 from assumed storage. This is now flagged in the
   result, the inputs, the panel and METHODS.

No formulas, coefficients, data files or published M6 numbers were changed.

## Commands and results (run in this environment)

| Command | Result |
| --- | --- |
| `npm test` | 118 passed, 0 failed (103 existing + 7 soil-water + 8 scene) |
| `npm run build` | passed, no new dependencies |
| `python -m unittest discover -s tests -p 'test_*.py'` | 35 passed |
| `python scripts/build_soil_weather.py --check` | exit 0, all three files match |
| `python scripts/build_replay.py --check` | exit 0, all three replays match |
| `node tests/visual-browser.cjs` (rewritten) | PASS |
| `browser-smoke`, `m3-browser`, `m4-browser`, `m42-browser`, `sim-browser` | all PASS |
| `git diff --check` | clean |

Browser suites ran against `npm run preview` with
`CHROMIUM_PATH=/opt/pw-browsers/chromium`.

`visual-browser.cjs` recomputes the model in Node from the same archived file. It
then checks the rendered frame against that run (date, available percent, every flow,
stress line, arrow presence, precipitation marks, panel percent) on 20+ days. Those
days cover month jumps, single-day steps, play/pause, before/after toggling, all three
farms, a wrapped season and the 2024 leap day. The suite also covers reduced motion
(no animation) versus motion (animation only while playing), and 320/390/768 px
layouts with no horizontal overflow.

## Remaining limitations

These are unchanged and documented: a single well-mixed bucket; generic soils and
standard-climate coefficients; a hypothetical 50% Jan 1 start, 0.6 m depth, stage
fractions and cover fractions; no snow, frozen ground, runoff, groundwater or soil
layers; no growth, yield, damage or soil-health outputs; and a 2021–2025 window only.
SMAP is unavailable.
