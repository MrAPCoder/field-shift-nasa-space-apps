# M6 daily soil-water simulation verification

Branch: `codex/visual-farm-simulator`. Continued from the saved visual-simulator
work at `4e8cbd2`, itself based on `fable/m5-simulator`. No main merge or production
deployment.

## Delivered behavior

Six scenario choices: location, supported crop, net irrigation, soil texture,
planting/harvest months and ground cover. The main experience has customize,
run, watch, try-change and compare steps. The daily chart, water-storage column,
dryness text, precipitation exposure and daily inflow/outflow figures are derived
from model output. Play/pause and timeline change the selected calculated day.
No decorative crop/weather animation is used. Advanced Details holds methods,
historical-year selection, NASA wetness context and the preserved legacy tools.

Before/after uses an immutable baseline on identical archived weather. Input edits
are marked pending until run. Location or historical-year changes clear the baseline.
An explicit new-baseline action is available. Only three existing crop IDs have
new sourced water-demand parameters: spring wheat, dry-seed spring pea and potato.
Unsupported crop/rotation demand is unavailable, not inferred from legacy traits.

## Scientific checks

- FAO-56 Penman–Monteith implementation reproduces published example 18 (3.88
  mm/day) within 0.03 mm/day. Test inputs reproduce its published vapor pressure
  through the mean-RH interface; they are not rendered as NASA data.
- Real POWER data: 1,826 daily records per location, 2021–2025, with eight variables.
  Original six variables are reproduced exactly; WS2M/PS have separate archived
  responses. There are no missing values in the shipped period. Original 45-year
  archives and M5 replay files were not modified.
- Every day in all 15 farm-years stays within available-water capacity and closes
  the mass balance; annual residual is below 1e-7 mm.
- Increasing irrigation from 0 to 35 mm/week never decreases daily storage in
  the regression scenario; excess drains and irrigation is applied only in season.
- Generic sand, loam and clay capacities are respectively 42, 120 and 72 mm for
  the fixed hypothetical 0.6 m layer. Published FC/WP values are not field measurements.
- Crop selection changes demand only with sourced coefficients. Unknown crops,
  unsourced parameters, malformed data and missing required daily forcing fail closed.
- Altered precipitation, temperature, humidity, solar energy and wind change
  calculations. GWETROOT is separate context, not a hidden source of bucket water.
- Ground cover changes exposure. Residue changes the coefficient using the FAO
  approximate mulch rule; live cover adds off-season demand and can use more water.
- Identical inputs are deterministic and do not mutate inputs. Comparison rejects
  differing years, locations, model versions or actual weather values, even when
  a modified weather object retains an unchanged fingerprint.
- SMAP was not retrieved/validated. Access evidence and integration requirements
  are in `public/data/smap-status.json`; no synthetic SMAP series exists.

## Concrete archived example

Palouse 2023, spring wheat, loam, Apr–Aug, bare between crops:

| Scenario | Annual mean available water | Cash-season days below depletion threshold | Precipitation exposure |
| --- | ---: | ---: | ---: |
| No irrigation | 64.5% | 78 | 491.0 mm |
| 20 mm/week net irrigation | 84.3% | 36 | 491.0 mm |
| No irrigation; residue | 66.2% | 73 | 147.3 mm |
| No irrigation; live-cover scenario | 60.7% | 78 | 178.5 mm |

These are model scenarios under documented assumptions, not field validation,
yield predictions, measured soil health or recommendations. The shared annual
reference ET is 745.7 mm; changing management does not change atmospheric weather.

## Test results

- JavaScript: 103 tests passed, including 13 new soil-model tests covering numerical
  reference, weather sensitivity, irrigation, soils, crops, cover, determinism,
  unavailable data, leap/wrapped seasons, conservation and comparison integrity.
- Python: 35 tests passed, including three new offline soil-weather/provenance tests.
- `python scripts/build_soil_weather.py --check`: all three derived files match.
- `scripts/build_replay.py --check`: all three original M5 replay files still match
  their raw archives (16,436 days and nine archive chunks per location).
- `npm run build`: passed with no new dependencies.
- `tests/visual-browser.cjs`: passed. Checks all six controls, actual changed chart
  paths, invariant baseline, numeric irrigation/cover results, play/pause/scrubbing,
  all farms, one-click demo across locations, historical-year reset, failed load/retry,
  invalid-input handling, stale-request cancellation and no live NASA/USDA requests.
- All five legacy browser suites passed: browser-smoke, m3-browser, m4-browser,
  m42-browser and sim-browser. Includes calendar editing/confirmation, priorities,
  provenance, M5 comparisons, print layout and PDF output.
- Desktop 1440px and mobile 320/390/768px checked. Full-page screenshots inspected
  at `work/soil-desktop.png` and `work/soil-mobile.png` (ignored verification files).
  Chart labels now keep readable size on mobile and show alternating month labels.
- `git diff --check`: clean.

## Limits retained in the UI

Single well-mixed available-water bucket, generic soil and standard-climate crop
coefficients, hypothetical initial storage/depth/timing/cover, approximate mean-RH
vapor pressure and single-coefficient water limitation. No snow/frozen-ground,
runoff-routing, groundwater, interception, delayed drainage or soil layers. All
precipitation is treated as liquid input; cold periods are explicitly flagged.
The model is historical and uncalibrated, not a forecast or precise field predictor.
