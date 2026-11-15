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

## M6 daily NASA-powered soil-water scenario

### Data and provenance

This model is separate from M5 historical screening. Its forcing period is
**2021-01-01 through 2025-12-31**, with 1,826 daily LST records per farm. The
original 1981–2025 POWER archives, climate summaries and M5 replay remain intact.
`scripts/build_soil_weather.py` reuses the six variables in each original
2021–2025 archive and adds a separate POWER response for WS2M and PS. Default
execution is offline; `--fetch` acquires missing supplemental archives only;
`--check` verifies derived JSON without writing. Each source has its URL,
retrieval timestamp and raw SHA-256. Coordinates, units, dates, finite bounds,
fill values and temperature ordering are checked. Original `-999` becomes null;
no values are interpolated or replaced. Each derived file also has a SHA-256 of
its canonical weather content. There are no missing values in these 15 farm-years.

- PRECTOTCORR (mm/day): precipitation input and exposure weighting.
- T2M_MAX / T2M_MIN (°C): saturation vapor pressure and temperature terms.
- RH2M (%): vapor-pressure estimate from daily mean humidity.
- ALLSKY_SFC_SW_DWN (MJ/m²/day): incident solar energy, not sunshine duration.
- WS2M (m/s): 2 m wind for the aerodynamic term; no height conversion needed.
- PS (kPa): atmospheric pressure for the psychrometric constant.
- POWER response elevation (m) and configured latitude: clear-sky radiation.
- GWETROOT (dimensionless 0–1): regional **model-estimate context only**. It is
  not volumetric water content or plant-available fraction, and does not initialize,
  calibrate or validate this scenario model.

POWER combines gridded satellite and reanalysis products (archive headers identify
MERRA2, SYN1DEG and POWER); these are not observations at the user's field.
The browser requests only saved same-origin files, never the NASA APIs.

### Atmospheric demand: FAO-56 Penman–Monteith

Sources: [FAO-56 chapter 2](https://www.fao.org/4/x0490e/x0490e06.htm),
[chapter 3](https://www.fao.org/4/x0490e/x0490e07.htm), and the independent
[worked daily example 18](https://www.fao.org/4/x0490e/x0490e08.htm).

Daily reference evapotranspiration (ET0, mm/day) is:

`ET0 = max(0, [0.408 Δ Rn + γ (900/(T+273)) u2 (es−ea)] / [Δ + γ (1+0.34 u2)])`

Here T=(Tmax+Tmin)/2; G=0 for the daily reference surface; γ=0.000665 PS;
`e°(T)=0.6108 exp(17.27T/(T+237.3))`; es is the mean saturation pressure at
Tmin and Tmax; ea=es RH2M/100; and Δ=4098 e°(T)/(T+237.3)².
The use of daily mean RH2M is an approximation to FAO equation 19, whose ideal
RHmean is the average of RHmin and RHmax. This is less accurate than measured
dewpoint or separate humidity extremes and is explicitly retained as a limitation.

Extraterrestrial radiation Ra uses latitude and day-of-year (FAO equations
21, 23–25); clear-sky radiation Rso=(0.75+0.00002 elevation)Ra.
Net radiation Rn=0.77 Rs−Rnl with grass albedo 0.23. Longwave loss uses FAO
Stefan–Boltzmann constant 4.903×10⁻⁹, the mean of Kelvin Tmin⁴/Tmax⁴, atmospheric
emissivity `(0.34−0.14 sqrt(ea))` and cloud term `(1.35 Rs/Rso−0.35)`.
Rs/Rso is capped at 1; emissivity and cloud terms are bounded at zero to avoid
unphysical negative longwave loss. Net ET0 is bounded at zero (no dew model).
These numeric bounds are documented implementation conventions, not imputed weather.
No Hargreaves fallback or assumed wind is used. Missing required forcing makes
the entire selected year's water trajectory unavailable, rather than silently
restarting storage after a gap. Missing GWETROOT alone does not block the balance.

### Published parameters versus hypothetical choices

All parameter values and citations live in `config.soilSimulation`, separate
from the existing crop evidence/approval flags. No old verification flag changed.
[Virginia Tech BSE-194P table 1](https://www.pubs.ext.vt.edu/BSE/BSE-194/BSE-194.html)
provides generic volumetric field-capacity / wilting-point pairs:

| Soil choice | Field capacity | Wilting point | Available capacity in assumed 0.6 m layer |
| --- | ---: | ---: | ---: |
| Sandy (sand) | 0.12 | 0.05 | 42 mm |
| Loamy (loam) | 0.36 | 0.16 | 120 mm |
| Clay | 0.39 | 0.27 | 72 mm |

Clay has more tightly held water than sand, but not the largest plant-available
store. These are generic textural examples, not a soil survey or measured field.
A fixed **0.6 m** layer and initial **50% of available capacity** are hypothetical,
not NASA-derived moisture or predicted root depth. Holding depth fixed across
crops isolates their demand coefficients and is a major simplification, especially
for mature wheat. Changing soil changes initial water in mm because capacity changes.

Supported crops are existing repository crop IDs with published FAO-56 demand
parameters. Other crop/rotation options remain unavailable for this model:

| Crop | Kc initial / mid / end | Kcb initial / mid / end | p at ETc≈5 mm/day |
| --- | --- | --- | ---: |
| Spring wheat, dry harvest endpoint | 0.30 / 1.15 / 0.25 | 0.15 / 1.10 / 0.15 | 0.55 |
| Spring pea, dry seed | 0.50 / 1.15 / 0.30 | 0.15 / 1.10 / 0.20 | 0.40 |
| Potato | 0.50 / 1.15 / 0.75 | 0.15 / 1.10 / 0.65 | 0.35 |

Sources: FAO-56 [table 12](https://www.fao.org/4/x0490e/x0490e0b.htm),
[table 17](https://www.fao.org/4/x0490e/x0490e0c.htm) and
[table 22](https://www.fao.org/4/x0490e/x0490e0e.htm). The values represent
standard-climate coefficients, without local calibration or RHmin/height adjustment.
Kcb is used only for the published organic-mulch adjustment, not a full dual-Kc model.

User planting begins on the first day of its month, harvest ends on the last day
of its month. Wrapped seasons are supported and repeated at the calendar-year
boundary. A hypothetical 20/30/30/20% allocation divides the chosen period into
initial/development/mid/late coefficient stages: constant initial, linear rise,
constant mid, linear decline to the end coefficient. This is an **assumed demand
schedule**, not simulated growth, observed phenology or recommended planting dates.

Ground cover has two transparent effects:

1. Precipitation exposure: cash-season exposed fraction is assumed 0.20; bare
   off-season fraction is 1; live-cover off-season fraction is 0.30. Residue is
   assumed to cover 70% of otherwise exposed ground, so its multiplier is 0.30.
   Daily exposure = NASA precipitation × exposed fraction. Fractions are
   hypothetical, not crop-derived canopy observations or measured erosion.
2. Demand: residue uses the approximate [FAO-56 organic-mulch rule](https://www.fao.org/4/x0490e/x0490e0g.htm):
   reduction factor = 0.5 × residue cover fraction = 0.35. Initial Kc is reduced
   by that fraction; mid/end Kc by that fraction of (Kc−Kcb). The coefficient
   schedule is interpolated after this adjustment. Off-season bare evaporation
   uses a **hypothetical Kc=0.3**; residue reduces that by 35%. Live cover uses
   **hypothetical reference-grass demand Kc=1** outside the cash season, is terminated
   at planting, and does not add a second crop demand during the cash season.
   It can lower soil water while lowering precipitation exposure. This is not a
   calibrated cover-crop species model or a promise of water savings.

Irrigation is user-entered **net water entering the soil**, 0–200 mm/week,
distributed uniformly as mm/week ÷ 7 on cash-season days only. The range is an
interface input limit, not a recommendation. Efficiency, sprinkler losses,
delivery timing and pumping costs are not inferred.

### Daily water balance and comparison

Following the storage and depletion concepts in
[FAO-56 chapter 8](https://www.fao.org/4/x0490e/x0490e0e.htm):

- Capacity C=1000(θFC−θWP)×0.6; initial available water S0=0.5C.
- Input W=precipitation+net irrigation. Excess drainage D=max(0,Sprevious+W−C).
- Wet storage B=min(C,Sprevious+W).
- Potential loss ETc=Kc×ET0.
- Adjusted depletion p=clamp(pbase+0.04(5−ETc),0.1,0.8).
- Availability factor Ks=min(1,B/((1−p)C)).
- Actual loss ETa=min(B,Ks ETc); next available water S=B−ETa.

Off-season pbase=0.5 is hypothetical. This single-coefficient approximation applies
Ks to total loss, including evaporation. FAO notes that separate evaporation and
transpiration is more valid; this model deliberately does **not** claim full FAO dual-Kc
or precise daily field predictions. Water below wilting point is not extracted.
Snow accumulation/melt, frozen ground, runoff routing, capillary rise, soil layering,
interception, salinity, lateral flows and delayed drainage are omitted. All precipitation
is liquid input, so cold-season results need particular caution. Cold-day counts and
an on-day note expose that limitation. Excess is labeled modeled drainage, never measured runoff.

Each day checks the identity `Sprevious+P+I−D−ETa−S=0`. Annual residual is exposed
in Advanced Details. The displayed water percentage is `100S/C`, **not** volumetric
moisture percentage: 0% corresponds to wilting-point storage, not oven-dry soil;
100% corresponds to field capacity, not saturation or "perfect soil health".
A dryness indicator counts **cash-season end-of-day storage below (1−p)C**;
it is not crop damage. Annual mean water and cumulative precipitation exposure
are shown alongside irrigation and drainage in before/after comparisons.

A new baseline is explicit. Edits preserve and label old results until recalculated.
Location/year changes clear comparisons. `compareSoil` requires the same model
version, year, location, archive fingerprint and serialized actual weather values;
changing a fingerprint alone cannot disguise altered weather. No random inputs or
visual presets affect calculations. The chart and soil-column fill derive only
from the computed daily trajectory. Model output does not alter original M5 calendars.

### SMAP access investigation

The official [SPL3SMP v9 product](https://nsidc.org/data/spl3smp/versions/9)
is a daily, 36 km surface-moisture retrieval beginning in 2015 and requires
Earthdata Login. The attempt to query CMR for 2023-07-01 failed with an environment
tunnel HTTP 403. No authenticated HDF5 granule was retrieved or validated.
`public/data/smap-status.json` records the exact request, limitation and integration
criteria. No SMAP values are displayed or substituted. Future integration must
check EASE-Grid geolocation, units, fill values, acquisition times, retrieval-quality,
snow/frozen-ground flags and spatial representativeness. It would be independent
regional surface context, not a direct measurement of the user's field or this
hypothetical 0.6 m layer. This limitation does not block verified POWER calculations.

## M7 farm and soil illustration (no formula changes)

The `daily-bucket-v1` equations, coefficients and published M6 example values are
unchanged. M7 adds read-only diagnostics and a schematic illustration driven by
the daily model records.

### Monthly and period balances

`periodBalance(result, first, last)` and `monthlyBalance(result)` aggregate only the
daily records. Storage is a **state**: start = storage before the first day (the
assumed initial storage on Jan 1), end = storage after the last day. Precipitation,
irrigation, actual ET and drainage are **summed**. Residual = start + rain +
irrigation − actual ET − drainage − end. Across all 15 farm-years and four
scenario families, every monthly residual is below 1e-9 mm. Months chain exactly,
February has 29 days in 2024, and the twelve months reproduce the annual totals.
The panel's month-to-date readout uses the same function.

### Starting-water sensitivity

`startupSensitivity()` re-runs the selected scenario from an empty (0%) and a full
(100%) store. The first day both trajectories agree within 0.01 mm marks the end of
the starting assumption's influence; every later day is independent of it. The
result is a diagnostic only. The model still starts at 50%. Loam, spring wheat,
Apr–Aug, no irrigation, results by region:
- Skagit: 2021–2025 converge in January–February.
- Palouse: converges by February–March.
- Yakima (semi-arid): stays dependent until late July–August in all five years, so
  dryland Yakima in-season results are largely set by the assumed Jan 1 storage.
The illustration shades this period on the timeline, and comparisons warn when it
overlaps the crop season.

### Seasons crossing New Year

When the planting month is after the harvest month, January through the harvest
month are crop days of a crop planted in the previous autumn. Its coefficients and
irrigation follow that assumed calendar, but the autumn itself is not simulated.
Jan 1 storage is the assumed fraction, not carried over. Results are flagged
`wrapsYear` and the UI says so.

### Freezing days

Each day is flagged `freezing` when NASA POWER T2M_MIN ≤ 0 °C. Precipitation phase,
snowpack and frozen ground are not modeled. All precipitation still enters the store
as liquid, exactly as in M6. At Palouse in 2021–2025, 143–283 mm a year
(19–38% of precipitation) falls on days with mean temperature ≤ 0 °C. The
illustration draws such precipitation grey and dashed, never as liquid infiltration,
and the panel marks the day unreliable.

### How the illustration maps model output to drawing (`src/lib/scene.js`)

- **Soil-water store:** one uniform colour for the whole 0.6 m layer, a linear blend
  from a dry to a moist tone of the generic texture by that day's plant-available
  percent. No depth-resolved wetting is drawn because none is computed. The gauge
  shows the same percent. The crop stress line is drawn at (1 − p) × capacity on
  crop days only, the threshold the model uses for "below depletion" days.
- **Flow arrows:** width = 3 drawing units per mm of that day's precipitation,
  irrigation, actual ET or drainage. Any non-zero flow is drawn at least 3 units wide.
  Widths are capped at 20 mm, with the true value labelled. Zero flow draws nothing.
  When demand exceeds actual ET by ≥ 0.05 mm, a dashed outline shows demand around
  the solid actual-ET arrow.
- **Precipitation marks:** shown only on days with NASA precipitation, in five classes:
  0, <1, 1–5, 5–15 and ≥15 mm. They fall only while playing and only when the
  viewer allows motion. Sky brightness follows NASA solar radiation (0–30 MJ/m²).
- **Plants:** the selected crop's schematic. Size and colour follow the assumed
  20/30/30/20% stage calendar, the same schedule that sets Kc, not simulated growth.
  Roots are a fixed schematic and do not grow. No tubers, yield or damage are drawn.
- **Ground cover:** residue segments cover the configured 70% of the surface length.
  Live cover appears only outside the crop season. Bare is drawn fully exposed.

## M8 farm score, biggest weakness and model-supported improvement

> **Superseded by M9.** The three-category M8 score below is kept as a historical record only.

The `daily-bucket-v1` model is unchanged. M8 adds `src/lib/grade.js`, which scores one
simulated historical year out of 100. Settings live in `config.soilSimulation.grading`
(`status: provisional_model_scoring_convention`). The score is a model scoring
convention. **100/100 means the scenario met every model target. It is not a perfect
real farm, measured soil health, yield or erosion outcome.**

### Categories

Each category is linear between a zero point and a target, clamped, and rounded to whole
points. The total is the sum of the rounded category points, so displayed parts always
add up. If any category cannot be calculated, the total is "Not scored". No points are
estimated.

| Category | Max | Metric, from the daily records | Full | Zero |
| --- | --- | --- | --- | --- |
| Irrigation Efficiency | 35 | (annual drainage − drainage of the same scenario with irrigation 0) ÷ applied net irrigation | ≤ 10% | ≥ 60% |
| Crop Water Supply | 35 | Σ actual ET ÷ Σ demand over crop-season days | ≥ 90% | ≤ 50% |
| Rain Exposure Protection | 30 | Σ exposed precipitation ÷ Σ NASA precipitation over the year | ≤ 30% | ≥ 90% |

- Irrigation Efficiency uses a paired zero-irrigation run on identical weather, so it
  counts only drainage that irrigation caused. Without that pair it is "Not scored".
  With no irrigation, nothing applied drained away, so it earns full points. Crop Water
  Supply still loses points if the crop runs short.
- Rain Exposure uses the assumed cover fractions. It is an exposure proxy, not erosion.
- Grades: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, otherwise F.

### Biggest weakness and how to improve

1. Candidate changes alter one practical setting: net irrigation (0–80 mm/week in
   `irrigationOptions`), ground cover, or the whole season shifted ±1 month at the same
   length. Seasons that cross New Year are not shifted. Soil type, location, crop and
   year never change. Each candidate is a full rerun with its own paired zero-irrigation
   run, on the same NASA weather, location, year and model.
2. A candidate counts for a category only if it uses that category's lever and raises
   that category's points. The levers are less irrigation or a season shift for
   efficiency, more irrigation or a season shift for crop water, and cover for exposure.
   It must also raise the **total** by at least `minMeaningfulGain` (1) point.
3. Among categories that lost at least `minMeaningfulLoss` (2) points, the biggest
   weakness is the one whose best candidate gives the largest total gain. Tradeoffs in
   other categories are already netted out. Ties go to more points lost. This is
   deliberately not the lowest raw score: Palouse 2023 unirrigated wheat loses 35
   points on crop water but only 22 on exposure, yet residue gives +22 total while the
   best crop-water change gives +9.
4. If no category qualifies, the tool says there is no meaningful weakness (all targets
   within one point) or that no tested single change helped. It invents nothing.
5. Tradeoffs listed: categories that drop, more crop-stress days, more irrigation, more
   drainage, extra off-season water use by live cover, and the fact that planting-date
   effects on frost, development and yield are not modeled.

"Try this improvement" runs the suggested scenario through the same simulation path. It
becomes the "after" run against the scenario that was showing, and Undo restores the
previous runs and inputs. Tests check that the applied score equals the predicted
`totalAfter`.

### Palouse demonstration

`config.soilSimulation.demo` runs Palouse spring wheat on loam, April–August, bare
between crops. It compares **no irrigation** with **40 mm/week**. The 40 mm/week is an
*illustrative* amount, chosen to show storage filling and draining. It is not a
schedule or recommendation and is labelled that way in the UI. In 2023 both runs score
43/100. Irrigation fixes crop water (0 → 35) but most of it drains (efficiency 35 → 0).

### Storage overflow in the illustration

On any day with model drainage (stored water + precipitation + irrigation exceeded
capacity), the scene draws a blue band on the soil surface and gauge, labelled "Soil
store full · extra water drains". The panel states how many mm came in and drained.
Nothing is drawn when drainage is zero.

## M9 multi-factor farm score, biggest problem and simplified site

The `daily-bucket-v1` water balance is unchanged. M9 replaces the M8 score with `farm-score-v2`
in `src/lib/grade.js`, configured in `config.soilSimulation.grading`
(`status: provisional_educational_model_rating`). **It is a provisional, educational rating of
one simulated historical season. It is not a validated assessment of a real farm and does not
measure soil health, erosion, yield, profit or crop damage.**

### Factors, groups and weights

Credit for each factor is linear between a zero point and a target, clamped to 0–1. Group
points = Σ weight × credit. Total = round(100 × Σ group points ÷ Σ applicable group maxima).
Weights are deliberately unequal. Correlated crop-water signals share one capped group.

| Group (pts) | Factor (brief no.) | Metric from daily records | Wt | Full | Zero |
| --- | --- | --- | --- | --- | --- |
| Crop water supply (50) | Demand met (1) | Σ actual ET ÷ Σ demand, crop-season days | 25 | ≥ 0.95 | ≤ 0.50 |
| | Shortage severity (3) | lowest Σ actual ET ÷ Σ demand in any 14 consecutive crop days | 12 | ≥ 0.80 | ≤ 0.30 |
| | Availability through season (6) | share of crop days with storage ≥ stress line | 7 | ≥ 0.90 | ≤ 0.40 |
| | Stress duration (2) | longest run of consecutive crop days below the stress line | 6 | ≤ 7 d | ≥ 45 d |
| Irrigation use (30) | Irrigation meeting crop demand (4) | (Σ actual ET − Σ actual ET without irrigation) ÷ irrigation, crop days | 30 | ≥ 0.80 | ≤ 0.30 |
| | Excess drainage from irrigation (5) | reported, not scored: see below | – | – | – |
| Rain on exposed soil (20) | Exposure (7) | Σ exposed precipitation ÷ Σ precipitation, non-freezing days, whole year | 12 | ≤ 0.30 | ≥ 0.90 |
| | Heavier-day exposure (8) | same, non-freezing days with ≥ 12.7 mm | 8 | ≤ 0.30 | ≥ 0.90 |

- **Irrigation decomposition.** The scenario is paired with the identical scenario at 0
  mm/week, on the same weather. The two runs are identical before planting, so over the crop
  season irrigation I = ΔET + Δdrainage + Δstorage at the last crop day, exactly. This is
  tested to 1e-6 mm. Factor 5 (Δdrainage ÷ I) is the main complement of factor 4. It is used
  to explain the irrigation result ("Excessive irrigation") and is not scored a second time.
- **No irrigation.** The irrigation group does not apply, so the total is rescaled from 70
  points. Crop water then carries 50/70 ≈ 71%, so an unirrigated crop with a severe shortage
  scores low (Palouse 2023 wheat: 14; Yakima potato: 7).
- **Excessive irrigation** keeps crop water full but loses most of the irrigation group. For
  example, Yakima at 200 mm/week scores below the best moderate amount, and no excessive
  case reaches 100. These are tested.
- **Heavier days.** 12.7 mm (0.5 in) per day is a provisional convention. Daily totals do not
  measure rainfall intensity. If a year has no heavier non-freezing day, only factor 7 is used.
- **GWETROOT** is never read by the score (tested by blanking it).

### When the score is withheld ("Not scored")

The score is withheld when any of these holds:
- the run fails or required NASA data is missing;
- an irrigated run lacks its valid paired zero-irrigation run;
- the season crosses New Year (the autumn part is not simulated);
- the season is shorter than 3 months;
- more than 25% of crop-season precipitation fell on days with NASA T2M_MIN ≤ 0 °C (snow and
  frozen ground are not modeled). Palouse March–July seasons are excluded in 4 of 5 years
  (23–47% of crop-season precipitation on such days);
- the total would change by ≥ 15 points between 0% and 100% assumed Jan 1 storage.

At ≥ 5 points a note shows the range. Across 3,240 scorable test scenarios the largest
starting-water effect was 10 points, and 67 showed the note.

### Biggest problem and improvement

- **Biggest problem:** the applicable group with the most points lost on the 100-point basis
  (≥ 3), worded from that scenario's model results: "Crop water shortage", "Excessive
  irrigation" (drainage ≥ water left in soil), "Irrigation the crop did not use", or "Rain on
  exposed soil". It is named even when no improvement is found.
- **Candidates:** irrigation ∈ {0, 5, …, 40, 50, 60, 80} mm/week × cover ∈ {bare, residue,
  cover}, including two-setting combinations. Location, year, crop, soil and season never
  change. Planting dates are not suggested because the project has no sourced local planting
  windows (`data/crops.json`: "Does not establish local planting/harvest dates").
- **Choice order:** single-setting changes that reduce the biggest problem's lost points,
  then combinations that do, then any single change, then any combination. A change must
  raise the total by at least 1 point. Within each tier: largest gain, then the smallest
  irrigation change. If the chosen change does not help the named problem, the UI says so.
- **Robustness:** the gain must hold with 0%, 50% and 100% Jan 1 storage, and under a
  dry-winter bound: a copy of the archive in which precipitation on days with T2M_MIN ≤ 0 °C
  is set to 0. This bound is used only for this check and is never displayed.
- If nothing qualifies, the problem is still shown, with what could be investigated (irrigation
  timing, local planting dates, local cover practices). No positive result is invented.

### Ground cover is not free

A live cover crop uses off-season water (Kc 1). Across 405 paired test scenarios it lowered
crop-water points in 51 but never lowered the total, because the model refills the soil
before planting. That refill depends partly on winter precipitation of unmodeled phase. That
is why cover suggestions must pass the dry-winter bound, and the extra off-season water use
is always listed as a tradeoff.

### Site structure

The main page has six parts: the welcome with Try Demo, the six inputs plus a year selector,
the farm simulation, the score card (score, biggest problem, how to improve), before and
after, and a footer. The footer links to `public/docs/` (NASA Data & Sources, How It Works,
Scientific Limitations). The earlier climate dashboard, M5 replay, rotation scoring and
calendars are unchanged and reachable at `research.html` (`src/research.jsx`). The legacy
browser suites target that page. The demo opens on planting day and compares 0 vs. an
illustrative 40 mm/week.
