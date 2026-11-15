# M1 climate methods

## Source and provenance
NASA POWER daily point API: https://power.larc.nasa.gov/api/temporal/daily/point
Community AG; local solar time (LST); January 1, 1981–December 31, 2025 inclusive.
Coordinates and thresholds have one source of truth: `src/config/config.json`.
These are representative regional demonstration locations supplied by the team,
not verified measurements of individual private farms. POWER is gridded environmental
data; the returned location does not imply field-scale precision.

Five-year requests retrieve T2M_MAX, T2M_MIN, PRECTOTCORR, RH2M,
ALLSKY_SFC_SW_DWN and GWETROOT. Each compressed raw archive retains the original
NASA response, request URL, exact configured farm, retrieval timestamp, metadata
and messages. Compact climate files list archive SHA-256 hashes. Raw archives
retain NASA's -999 sentinel for auditability; calculations replace it with NaN.
Aggregated JSON uses null for unavailable statistics and never emits NaN.

The API's AG community returns solar radiation in **MJ/m²/day**. Temperature is
°C, precipitation mm/day, relative humidity %, and GWETROOT unitless 0–1.
The live 1981 probe reports that radiation begins January 1, 1984. Requests
spanning that boundary return -999 before 1984. No solar values are imputed.
GWETROOT is a model-based root-zone soil wetness estimate, not SMAP and not a
field measurement. Per-variable coverage is calculated from the actual responses.

## Completeness and calculations
Use a conservative 100% completeness requirement for rainfall totals and temperature
event counts. This avoids undercounting from missing days; no scaling or imputation
is applied. Full dates are required in each response; sentinels represent missing
values. Missing dates/parameters outside the documented early solar exception fail
validation. Expected period: 16,436 calendar days, including leap days.

- **Frost days:** count T2M_MIN ≤ 0°C in each complete year.
- **Last spring frost:** last day with T2M_MIN ≤ 0°C from January 1–June 30,
  only if all minimum temperatures in that half-year are present.
- **First fall frost:** first such day from July 1–December 31, under the same rule.
- **Frost-free days:** (first fall frost − last spring frost).days − 1. Both
  boundaries must exist; otherwise null. This is the specified boundary-based
  calendar indicator. It does not guarantee that intervening days have no frost.
  Display the arithmetic mean over valid years and report its denominator.
- **Hot days:** count T2M_MAX ≥ configured 32°C per complete year, then the
  arithmetic mean over valid years. The 32°C threshold is provisional.
- **Mean annual rain:** mean of complete calendar-year precipitation sums.
- **Monthly rainfall normals:** for each calendar month, sum daily precipitation
  within each complete year-month, then average those totals. Report valid years
  per month. These are 1981–2025 historical averages, not a standard 30-year normal.
- **Monthly rain share:** monthly normal / sum of all 12 normals × 100. All normals
  must exist and their sum must be positive; otherwise all shares are null.
  Monthly normals can use different year subsets if data are incomplete; their sum
  need not equal the complete-year annual rainfall mean in that case.
- **Monthly wetness:** arithmetic mean of all valid daily GWETROOT values for that
  calendar month over the available period. February includes leap days. Record
  valid/expected days and first/last valid date, rather than implying full coverage.
- **Coverage:** valid days, missing days, percentage, first/last valid date and
  entirely missing months for every variable. Nonzero missingness is flagged.

## Quality controls and failure behavior
Validate GeoJSON structure, response range, time standard, sentinel, units, exact
parameter dates/lengths, numeric finite values, unique dates, complete calendar,
and minimum ≤ maximum temperature. Broad sanity limits: temperatures −90 to 65°C,
rainfall 0–2000 mm/day, humidity 0–100%, radiation 0–50 MJ/m²/day, wetness 0–1.
These are error screens, not a climatological validation model. Invalid values
fail the run rather than being silently discarded. Annual rainfall above the
configured 3000 mm review threshold is reported, not deleted. Review regional
contrasts and annual ranges in `docs/M1_VERIFICATION.md`.

Transient connection errors, timeouts, HTTP 429 and 5xx responses retry up to five
attempts with exponential waits of 1, 2, 4 and 8 seconds. Other HTTP failures,
malformed JSON and validation errors stop with an error. Validated raw chunks
are reused, permitting restart without downloading completed requests. Remove
selected raw archives deliberately to refresh; `--offline` prohibits networking.
Aggregate writes are atomic per file. A failed run can leave completed farms from
a partial run; only a successful exit plus all cache tests establishes completion.

## Limits
Long-term averages do not predict next year's weather. Coarse gridded estimates
can differ from local rainfall, terrain and field temperatures. Frost boundaries
are threshold-based indicators, not crop-specific injury forecasts. No irrigation,
crop recommendations, soil-loss estimates, profitability or scoring are implemented
in M1. Agricultural sources and dashboard interactions belong to later milestones.

## M3: review gates and comparative scoring

`src/lib/score.js` is pure JavaScript, independent of React and networking. It
returns `SCORED` with a finite 0–100 value and calculation evidence, or
`NOT_SCORED` with `value: null` and specific reasons. The original scientific
integrity rule is preserved: `verified: false` means team review is pending,
even where a source was opened and read. Merely finding a source is not approval.

The rotation needs explicit crop IDs for years 1–3, source URLs and approval.
Each essential crop trait also needs its own supporting URLs and an approved
crop entry. Erosion uses the independently sourced/approved monthly cover
schedule; unrelated crop water traits do not affect its eligibility. Water and
erosion reject a climate dataset belonging to a different farm. Every monthly
rainfall normal used must be finite, nonnegative and based on at least one valid
year. Missing or zero annual rainfall denominators prevent a score.

### Water savings — provisional demand comparison

Configuration: `scoring.summerMonths = [6, 7, 8]` and demand indices
`low = 0`, `med = 0.5`, `high = 1`. These are transparent design coefficients,
not sourced irrigation requirements or validated estimates of water saved.

Let D be the mean category index of one documented crop in each of three years.
Let S be June–August rainfall / sum of all 12 monthly rainfall normals.

`water_score = 100 * (1 - D * (1 - S))`

At a given location, lower documented demand gives a higher comparative score.
The summer rainfall share reduces the categorical penalty. It does not model
crop evapotranspiration, soil water storage, crop timing, or irrigation supply;
locations with similar seasonal shares can receive identical scores despite
different rainfall amounts. Do not compare this index across farms as an
absolute water-sufficiency measure. The UI shows summer millimeters as context.
Double-cropped/intercropped years are not scored until defensible weighting is
established; no equal-share water-demand assumption is made. All real crop
water categories remain TODO in this release.

### Soil health — provisional practice comparison

Four components range from 0 to 1:
- Nitrogen-fixing crop presence: 1 if any approved crop has documented fixation
  capability, otherwise 0. All crops must have known boolean traits; unknown is
  not false. Presence does not quantify nitrogen supplied to the following crop.
- Cover-crop share: approved months labeled `cover` / 36.
- Root-depth diversity: 1 when both approved `shallow` and `deep` categories occur,
  otherwise 0. No category is derived from an unsupported numeric threshold.
- Non-bare share: 1 − approved months labeled `bare` / 36.

Default relative weights are 0.3, 0.3, 0.2, 0.2 respectively, stored in config.
Score = 100 × weighted sum of components / sum of component weights. Zero or
invalid coefficient sums prevent scoring. Cover-crop share and non-bare share
are intentionally related: the provisional design rewards both cover-crop
presence and avoiding bare soil. This is not an independently validated index
of soil health. Every month must have an approved known status and source URL.

### Erosion control — seasonal rainfall exposure only

`exposure = sum(monthly rainfall normal for every bare month in years 1–3)
            / (3 * sum(all 12 monthly rainfall normals))`

`erosion_score = 100 * (1 - exposure)`

Exactly 36 unique year/month records are required. Allowed known statuses are
`cash`, `cover`, and `bare`; `unknown`, missing, duplicated, or unapproved months
prevent scoring. Do not assume planted means covered, or harvested means bare:
establishment, residue, tillage and termination matter. Status assignment is a
separate evidence/review task. This simplified binary exposure heuristic omits
slope, soil type, storm intensity and residue density. It predicts neither soil
loss nor runoff. M4 adds a visual calendar and printable plan using the same exposure result; see the M4 section below.

### Income and overall total

Income always returns “Not scored yet — crop prices and production costs are not
included.” Even an accidentally supplied income number is excluded by the total.

`total = sum(eligible score * positive selected weight)
         / sum(positive weights of eligible scores)`

Weights are finite numbers 0–10. Zero-weight, unavailable and income priorities
are excluded from both numerator and denominator. No positive eligible weight
means `NOT_SCORED`, never zero. A valid score of zero remains eligible. Results
are clamped to 0–100, and non-finite/out-of-range supplied scores cannot enter the
total. The engine reports included/excluded priorities. Totals with different
eligible priorities are not necessarily comparable; the app does not rank them.

### Current release eligibility

The three Palouse published sequences are approved only as research demonstration
scenarios through `sequence_approval`. The broad `verified` flags remain false:
local suitability, crop traits, dates and original published schedules are not
approved. Six regional candidates remain pending. All calendars initially remain
unscored; a complete confirmed farmer calendar can enable Palouse exposure only.
Water and soil remain unavailable because their independent evidence gates fail.
Income is always unavailable.


### Approved M3 farmer-calendar provenance extension

The user explicitly approved a simple management-input calendar for M3. It is not
M4's visual risk calendar, peak-rainfall highlighting or printable plan.

`src/lib/management.js` creates 36 Unknown months with null exposure, never sample
farm data. The farmer chooses Planted crop (`cash`), Cover crop (`cover`), Bare
soil (`bare`) or Unknown. Crop/cover statuses may include retained residue after
harvest; selecting Bare soil explicitly means fully exposed, not merely harvested.
Planted/cover status alone never implies soil protection.

Each crop/cover month additionally needs an explicit exposed-soil percentage
0–100: an approximate average across the soil surface and the month, accounting
for canopy, residue and transitions. Bare soil explicitly sets 100%; Unknown has
no value. Changing status to crop/cover clears exposure rather than carrying over
an assumption. Partial months need a farmer estimate or must remain unknown.
There are no default crop-specific percentages or cover-date inferences.

A separate in-memory management object records `source_kind: farmer_input`,
`method: monthly-exposed-soil-v1`, rotation ID, observed/proposed mode, a field/year
or scenario description, confirmer name, confirmation timestamp and all 36 rows.
These are self-attestations, not authenticated identities or independent verification.
They do not change the crop library or any published schedule's `verified` flag.
No fabricated citation URL is attached. Every edit clears confirmation. Farm and
baseline changes retain separate entries within the tab; refresh resets them.
Nothing is uploaded or persisted. This limitation is stated beside the controls.

For month m of year y, let R_m be the cached NASA rainfall normal and E_ym the
farmer-entered exposed percentage / 100. Then:

`rainfall_weighted_exposure = sum(R_m * E_ym) / (3 * sum(R_m))`

`exposure_index = 100 * (1 - rainfall_weighted_exposure)`

The UI reports both exposure percent (lower is less assumed exposure) and the
0–100 index (higher is less assumed exposure). The extension generalizes the
existing binary bare-month formula; it equals that formula for 0/100% inputs.
Legacy independently approved published schedules retain the existing validation
path; the UI always supplies the separate farmer-input path, which fails closed
on missing provenance, confirmation, months, statuses or percentages.

This is a transparent scenario proxy, not a calibrated erosion model. Multiplying
monthly mean rainfall by average exposure assumes the average represents exposure
during rainfall. It cannot resolve storm timing, canopy interception, infiltration,
slope, residue effectiveness or soil erodibility. A 100 index means zero exposure
under entered assumptions, not zero erosion. Observed-mode entries remain farmer
reports: the rainfall is still 1981–2025 normals, not weather observed in those years.

Farmer inputs do not satisfy soil-scoring research gates or water-demand gates.
With erosion as the only eligible metric, a positive erosion slider gives a total
identical to that index, regardless of other sliders. Zero erosion importance means
no total. Compare totals only when their eligible metrics and assumption bases match.

## M4: rainfall visualization and printable plan

The visual calendar uses the same M3 management state and scoring result, not a
second exposure calculation. For every year, month m displays the cached NASA
`rainfall_normal_mm` for that calendar month. Repetition is historical context,
not a three-year weather forecast. Farmer statuses and exposed-soil percentages
remain separate: planted crops and cover crops do not imply zero exposure.
Unknown/invalid exposure is labeled Unknown, never converted to zero or bare soil.
Draft entries can be visualized but no overall exposure percentage is displayed
until the existing M3 provenance, confirmation, rainfall and sequence gates pass.

`src/lib/plan.js` defines `HIGH_RAIN_RANK = 3`: months at least as wet as the
third-highest positive monthly normal are labeled high rainfall (ties included).
A month is outlined only when high rainfall coincides with an explicitly entered
exposed-soil percentage greater than zero. Missing rainfall disables this ranking.
This is a display convention, not a validated agronomic threshold, erosion warning
model or change to scoring. Unknown exposure receives no highlight; absence of a
highlight is not evidence of protection. Text accompanies color for printing and
accessibility.

The prominent exposure percentage comes directly from M3's
`rainExposureFraction * 100`. Wording refers to historical rainfall overlapping
estimated exposed-soil conditions, including partial exposure. The complementary
index is not an erosion reduction percentage. Proposed versus observed management
and author confirmation remain visible. Observed management is still farmer-reported
and paired with historical normals, not observed rainfall from its actual years.

Each card can open a printable plan for that exact rotation, independent of the
comparison baseline. The plan uses live current state, so edits invalidate its
exposure estimate too. Browser `window.print()` and print CSS hide other cards and
controls; no PDF library, new dependency or print backend is used. Printing can
also preserve incomplete plans with explicit gaps. Planting/harvest months are
shown only when present in the catalog; all current entries are unknown and no
dates are inferred from monthly management. Evidence URLs, NASA cache path,
climate indicators, priorities, formula, provenance, gaps and disclaimer are printed.

## M4.2: evidence and usability, unchanged calculations

All scoring arithmetic in `src/lib/score.js`, all config coefficients, the NASA
pipeline and the original climate caches remain unchanged. Published numeric
crop references are stored in `research_traits` separately from the unresolved
scoring fields. They are pending review, not local observations or automatic
approval. General seasonal evapotranspiration ranges are not irrigation demand;
maximum effective rooting ranges are not measured rooting depths; broad growing
periods are not minimum frost-free requirements. Winter crop duration can include
winter dormancy. A green-manure termination period is not seed maturity.

The water score is labeled a provisional water-demand comparison, and the soil
score a provisional soil-management practice index. These are not calibrated
water savings or measured soil health. Low water-demand category still maps to
zero penalty, summer rain remains a fraction rather than absolute supply, and
cover/non-bare soil components remain related. New evidence does not resolve
these methodological limits. Exposure remains a rainfall-weighted assumption,
not an erosion forecast. The total and print plan state their actual eligible
components. No new coefficients or scoring categories were assigned.

### USDA soil acquisition

`scripts/fetch_soils.py` uses Python's standard library to POST a read-only SQL
query to USDA NRCS Soil Data Access. It intersects WGS84 longitude/latitude from
the existing config with map-unit polygons, then joins mapunit, legend,
sacatalog, component and chorizon. The representative texture description is
selected from chtexturegrp. All returned components/horizons are retained.
There is no dominant-component choice, depth aggregation, extrapolation or
assignment of a regional soil series to the point. Restrictive depth is not
queried; no inference of unrestricted rooting is made.

Each farm has `soil-source.json` (endpoint, exact query, configured coordinates,
attempt time, response or exact failure) and `soil.json` (normalized rows, units,
status, limitations and SHA-256 of the receipt). Nulls stay null; real zeros stay
zero. Invalid ranges, reversed horizons, missing headers and duplicate rows fail
validation. `--offline` reproduces summaries without network access. Exit 1 means
at least one location is unavailable. Refresh failures retain prior successful
records and save a separate failure receipt. The UI bundles these static records;
rebuild after a successful refresh. No USDA requests occur during app use.

M4.2 acquisition at all three points failed with:
`URLError: <urlopen error Tunnel connection failed: 403 Forbidden>`.
The proxy rejected the connection before USDA returned soil data. Both the
sc.egov.usda.gov endpoint and an nrcs.usda.gov hostname attempt were blocked;
a request outside the sandbox encountered the same proxy failure. This does not
prove that USDA itself is down. The committed receipts show the canonical endpoint
attempts. No soil numbers, map-unit IDs or soil names were obtained. Success-path
parsing is tested with synthetic records, but the live SQL response is unverified.

Schema reference: https://sdmdataaccess.sc.egov.usda.gov/QueryHelp.aspx
and the linked SDM Table Column Descriptions / Tables and Columns reports.

### Calendar edits and plans

Range edits and year copying stage explicit user values. A before/after preview
and a review checkbox are required before applying replacements. Applying clears
confirmation and timestamp; the complete 36-month calendar still needs its own
confirmation. Unknown remains null. Bare explicitly means 100% exposure; no crop
status supplies a default protective percentage. Year copies retain unknowns.
Changing a manual entry or bulk controls cancels a pending preview. Inputs remain
tab-local and are lost on reload. No agricultural verification is granted.

Printable plans render current scores, reasons and included metrics, rather than
hardcoding M4 eligibility. Soil provenance and crop evidence are expanded in the
plan. Historical trial events remain narrative evidence; no planting, harvest or
cover months have been invented. Existing all-unknown published schedules remain
unchanged. The Palouse comparison does not imply a single controlled trial of its
three options or rank totals with differing evidence bases.

## M5 historical replay simulator

The simulator replays a farmer's three-year plan through every complete
three-year window of the archived daily NASA POWER weather and reports how often
provisional screening conditions occurred. It is **not** a forecast, and not a
yield, water-savings, profit or erosion model. It does not use, change or feed
`src/lib/score.js`, the scoring coefficients, any `verified` or
`sequence_approval` flag, the calendar tools or the printable rotation plans.

### Data flow and replay contract

`public/data/<farm>/raw/*.json.gz` (unchanged) → `scripts/build_replay.py`
(offline; standard library plus pandas) → `public/data/<farm>/replay.json` →
`src/lib/replay.js` → `simulate.js` → `concerns.js` / `compare.js` → components.
The browser fetches `replay.json` on the first Simulate and keeps it in memory.
No NASA or USDA request is made during app use.

`replay.json` (schema `field-shift-replay`, version 1) is columnar: `farm`
(id and the configured coordinates), `start` 1981-01-01, `end` 2025-12-31,
`time_standard` LST, `days` 16,436, `units`, four `series` arrays and
`provenance` (source, every raw archive path with its SHA-256, build time,
builder). Index `i` is `start + i` days using UTC date arithmetic only. The
series are `PRECTOTCORR` (mm/day), `T2M_MAX` and `T2M_MIN` (°C) and `GWETROOT`
(unitless 0–1). The NASA sentinel −999 becomes `null`; a real zero stays zero;
values are rounded to two decimals (the archive's own precision). The file is
written atomically and left untouched when its content would not change.

The builder fails closed, exits non-zero and writes nothing for a farm when:
the archive does not hold exactly 16,436 consecutive days, a date is duplicated,
an archive's stored coordinates differ from `src/config/config.json`, a unit
differs, the time standard or sentinel is unexpected, a value is non-finite or
outside the M1 sanity bounds, or minimum exceeds maximum temperature.
`--check` rebuilds in memory, compares with the committed file and writes
nothing. `src/lib/replay.js#validateReplay` re-checks schema, location, period,
length, units, value ranges and provenance in the browser and freezes the
series; a failed load shows “Simulation data could not be loaded” with Retry and
leaves the dashboard working.

In the current archive all four series are complete (no nulls) at all three
locations. Monthly precipitation normals recomputed from `replay.json` match
`climate.json` within 0.1 mm (tested).

### Plans and runs

A plan is a 36-month calendar. Month `m ∈ 0..35` has a status in
{cash, cover, bare, unknown} and an exposed-soil percentage in [0, 100] or null.
The plan starts January 1 of plan year 1.

A run starting in year `Y` maps plan month `m` to calendar year
`Y + floor(m / 12)`, month `(m mod 12) + 1`. Valid `Y` = 1981 … 2023, giving
**43 runs**; the last ends 2025-12-31 and no run requests 2026 weather. October
of plan year 1 to July of plan year 2 are contiguous calendar months, so a
winter crop's fall weather comes from the correct preceding year. Overlapping
runs share years and are **not independent trials**.

**In-crop weather day:** a day in a month whose status is cash. Cover-crop
months contribute to the soil-exposure calculation but do not extend cash-crop
heat, frost or dry-spell exposure. Cash status may include retained residue in
legacy calendars; users must review these assumed crop months. Growth stage,
damage and cover-crop-specific weather tolerance are not modeled.

**Climate-only mode** (Skagit, Yakima, or Palouse without a confirmed calendar):
in-crop months are the farmer-chosen growing window, first month → last month,
wrapping allowed (for example Oct → Jul), repeated in every plan year and
labeled a farmer assumption. The exposed-soil family is not evaluated.

Plan sources are kept distinct and labeled: illustrative demo calendar,
farmer-confirmed field calendar (must pass `managementIssues` including
confirmation), an unsaved what-if edit of a confirmed calendar, or a growing
window. An unconfirmed or incomplete farmer calendar is not used by the UI.

### Indicators per run (k = plan year 1..3)

Let `P_d`, `Tmax_d`, `Tmin_d` be the day's archived values.

- **Dry.** `DS_max` = the longest run of consecutive in-crop days with
  `P_d < 1.0 mm` over the whole 36-month run. A spell may cross month and year
  boundaries. A non-in-crop day ends the spell. A missing (`null`) in-crop day
  ends the spell and invalidates the run for this family: missing is neither dry
  nor wet. Flag the run if `DS_max ≥ 21`.
- **Heat.** `H_k` = in-crop days in plan year `k` with `Tmax_d ≥ 32 °C`. A
  missing in-crop maximum invalidates the run. Flag if `max_k H_k ≥ 5`.
- **Frost.** `F_k` = in-crop days in plan year `k` with `Tmin_d ≤ 0 °C`, counted
  only in the shoulder months April, May, June, September and October. A missing
  minimum on such a day invalidates the run. Flag if `max_k F_k ≥ 1`.
- **Exposed-soil precipitation.** With `x_d` = the month's exposed percentage /
  100 (all months; bare = 100):
  `Efrac_k = Σ_{d∈k} P_d · x_d / Σ_{d∈k} P_d` and `E_mm_run = Σ_run P_d · x_d`.
  A zero denominator or any missing precipitation makes the run unavailable.
  Requires a complete calendar: an unknown month or missing percentage makes the
  whole family “Not evaluated”; unknown is never treated as bare. A bare month
  whose percentage is not 100 is treated as invalid input, not as 100. Flag if
  `max_k Efrac_k ≥ 0.25`.
- **Root-zone wetness context (never a trigger).** For the plan year in which
  the worst run's longest dry spell starts, take each in-crop calendar month's
  mean `GWETROOT` and its empirical percentile against the same calendar month
  in 1991–2020: `percentile = (n_below + 0.5 · n_equal) / N`. Report the mean of
  those percentiles and the smallest `N`. A month with any missing day, or fewer
  than `minValidRuns` reference years, makes the context unavailable. The
  evaluated year is not removed from the reference when it lies inside it.
  `GWETROOT` is a model estimate of relative wetness, not measured soil water.
  It appears as one evidence line on the Dry card only.

For each family, `frequency = flagged_runs / valid_runs`. Fewer than 20 valid
runs makes the family unavailable, not “low”. The worst example is the valid run
with the largest family metric (`DS_max`, `max_k H_k`, `max_k F_k`,
`max_k Efrac_k`); ties keep the earliest start year. It is shown with real
dates and values.

POWER precipitation includes the water equivalent of frozen precipitation, so
the wording is “precipitation”, not rain impact.

### Provisional thresholds

All thresholds live in `src/config/config.json` under the new `simulation` key
with `"status": "provisional"`. They are screening conventions pending approval
by the team (Rehan and Nakul), shown as provisional in the UI and the report.
They are **never crop-damage thresholds**. Values are duplicated rather than
shared with the root `hotDayThresholdC` / `frostThresholdC`, so changing one
cannot silently change the other. `scripts/fetch_nasa.py --offline` output is
unchanged by the new key (tested).

| Key | Value | Meaning |
|---|---|---|
| `dryDayMm` | 1.0 | A day is dry when precipitation is below this |
| `drySpellDays` | 21 | Dry screen: consecutive in-crop dry days |
| `hotDayC` | 32 | Hot day: daily maximum at or above |
| `hotDaysPerYear` | 5 | Heat screen: in-crop hot days in any plan year |
| `frostDayC` | 0 | Frost day: daily minimum at or below |
| `frostShoulderMonths` | 4, 5, 6, 9, 10 | Months in which frost days are counted |
| `frostDaysPerYear` | 1 | Frost screen: in-crop frost days in any plan year |
| `exposedFraction` | 0.25 | Exposed screen: share of a plan year's precipitation |
| `concernMinFrequency` | 0.20 | A concern needs its screen met in ≥ 1 in 5 valid runs |
| `minValidRuns` | 20 | Minimum valid runs (also minimum wetness reference years) |
| `wetnessBaseline` | 1991–2020 | Reference years for the wetness context |
| `familyOrder` | exposed, dry, heat, frost | Tie order between families |

### Concerns

1. Each family reports frequency, valid runs and its worst example. A family
   with missing inputs is listed as “Not evaluated” with the reason, never as a
   card.
2. A family qualifies when `frequency ≥ 0.20`.
3. Qualifying families are ranked by frequency, descending; ties follow
   `familyOrder`. That order is a stable planning convention, not a measure of
   expected harm.
4. At most three cards are shown. Further qualifying families and families below
   the bar are listed as plain lines. With none qualifying the app says: “No
   screening concern met the bar in these replays. This is not evidence of low
   risk.” Cards are never padded.
5. Card text comes from unit-tested templates in `src/lib/concerns.js`: title,
   how often, rule, one generic why-it-matters sentence with no crop-specific
   claim, the worst example, the uncertainty statement, and one allowed lever.
   The Dry card always notes that irrigation may offset low precipitation.

Every displayed number carries one label: Historical NASA weather, Model
estimate (GWETROOT), Farmer assumption or Illustrative demo assumption, or
Simulated indicator.

### Improvements and comparison

Only three levers exist: (A) keep cover or residue in selected months — the app
lists the three plan months with the most precipitation on assumed-exposed soil
and the farmer enters every status and percentage (nothing is prefilled; the
what-if is not saved to the field calendar and is not confirmed); (B) replay a
different Palouse research rotation, using its confirmed farmer calendar if one
exists and otherwise a growing window with the exposed family not evaluated;
(C) change the growing window of a climate-only plan.

`src/lib/compare.js#compare` pairs a before and an after simulation. It throws
unless both carry the same replay fingerprint and the same list of start years,
so changing a plan can never change the weather. Per family it reports flagged
runs before → after, the paired per-run metric (median before → after and the
number of runs in which it went down or up), and which families newly meet or no
longer meet the bar. For the exposed family the paired metric is `E_mm_run`.
Only months changed to cash status become in-crop weather months. Changing
bare months to cover leaves cash-crop dry, heat and frost exposure unchanged. A family that
is no longer evaluated is reported as such, not as an improvement.

Allowed wording: “less precipitation on assumed-exposed soil”, “fewer in-crop
hot days in these replays”. Comparison output never says erosion reduced, water
saved, yield, profit or soil loss (tested).

### Illustrative demo

`data/demo-scenarios.json` holds two complete 36-month calendars for
`palouse-current` with `source_kind: "illustrative_demo"`, `confirmed: false`
and `values_status: "illustrative_pending_review"`. The months and percentages
are hypothetical values chosen for demonstration; they are not sourced planting
dates, measured cover, farm data or recommendations, and they await team review.
Crop months (cash, 20% exposed): year 1 April–August, year 1 October – year 2
July, year 3 April–August. Baseline: the 16 other months are bare (100%).
Improved: identical except those 16 months are cover at 30%. Demo calendars are
rejected by `managementIssues`, are never stored in farmer `management` state,
and are never passed to `scoreRotation` (tested).

### Limits

Gridded data (roughly 50 km) is not a field measurement. Irrigation, soil
storage, crop growth stage, slope and storm intensity are not modeled. Daily
extremes do not give time below or above a threshold. A monthly exposure
percentage is an assumption held constant within the month. Screens met in a
replay are counts under stated assumptions, not probabilities of crop damage,
and a screen that is not met is not evidence of low risk.

With the provisional values, several screens are met in nearly every replay at
Palouse and Yakima (for example 21 dry days inside any summer crop window, one
shoulder-month frost, five hot days). A screen met in 43 of 43 replays does not
separate plans; in that case the paired per-run metric in the comparison is the
informative number. Choosing less saturated thresholds is a team decision and
was not made here.


## Visual simulator (M5 simplification)

The main scene replays one user-selected three-year historical window month by
month. Crop symbols show calendar presence only. Rain streaks indicate a month
with nonzero precipitation, not continuous rainfall; the sun emphasizes heat
when the monthly mean daily maximum reaches the existing hot-day threshold.
Neither visual is a damage model. Reduced-motion preference disables animation.

Monthly precipitation is the sum of archived PRECTOTCORR; mean daily high is
the mean of archived T2M_MAX. Any missing daily input makes its monthly value
unavailable. Assumed protection is `100 - exposed_percent`; monthly exposure is
`monthly precipitation * exposed_percent / 100`. Unknown cover stays unavailable.
The soil color indicates assumed cover only, never water content or health.

The compact demo comparison shows the arithmetic mean across valid runs of
`100 * exposedMm / totalMm` (each run covers three years). It is a continuous
precipitation-weighted exposure indicator, distinct from the existing worst-year
threshold frequency. With the unchanged archived Palouse demonstration calendars,
it rounds to 60% before and 25% with cover crops. Detailed screen counts remain
43/43 → 42/43 exposed, 42/43 → 42/43 dry, 43/43 → 43/43 heat and frost.
Saturated frequencies are valid outputs of the existing provisional screens,
not crop-damage probabilities. No thresholds or calendar values were tuned.
Sources remain NASA POWER archives, their provenance manifests, existing crop
citations and illustrative demo assumptions; no new agronomic inputs were added.
