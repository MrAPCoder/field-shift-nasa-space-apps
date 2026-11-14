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
loss nor runoff. The M4 calendar and printable plan are not implemented.

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

All nine comparison slots are unscored: all proposals await review, all cover
months are unknown, all water and rooting categories are TODO, and some sequences
are incomplete. Only synthetic, clearly labeled unit tests exercise numeric
scores. They never appear as NASA measurements or agricultural recommendations.
