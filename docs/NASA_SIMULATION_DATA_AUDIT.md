# Field Shift — NASA simulation data audit

Research date: **2026-11-14 (America/Los_Angeles)**. Repository baseline: [`460c31d`](https://github.com/MrAPCoder/field-shift-nasa-space-apps/commit/460c31dc377f5eadcb139e0023de1e247fedb5d2). Scope: research and integration planning only. No application, formulas, coefficients, approval flags, or cached production data changed.

## Executive summary

**Build the hackathon demonstration from the daily POWER estimates already archived.** There are 27 compressed source responses containing 1981–2025 data for three representative Washington locations. Temperature, precipitation, humidity, and modeled root-zone wetness each have all 16,436 days at each location. The application mostly reduces these records to long-term monthly and annual summaries; it does not yet replay individual seasons against management dates.

The defensible first product is a **historical environmental-exposure simulator**: apply a farmer's proposed calendar to actual historical weather sequences, summarize dry spells, temperature exposure, and precipitation overlapping exposed soil, and explain up to three concerns. These indicators cannot establish crop yield, soil loss, profitability, or irrigation savings. Local soil properties, irrigation supply, cultivar phenology, and approved crop thresholds are still missing.

Extend POWER with wind, pressure, and dew point before building a new ingestion stack. The best additional datasets are **IMERG Final precipitation, MOD13Q1 vegetation indices, SMAP Level 4 soil moisture, and HLS surface reflectance**. Start with one satellite addition; HLS is the later field-polygon option. GLDAS, VIIRS, ECOSTRESS, MOD16, and NEX-GDDP have legitimate uses but should not delay the working demo.

**Access evidence matters:** bounded POWER requests succeeded for all three coordinates. NASA documentation and product specifications were checked, but this execution environment blocked CMR, AppEEARS, and ORNL subset requests with a proxy tunnel 403. No authenticated Earthdata granule download was demonstrated. These failures do not establish that the NASA services are down. The implementation plan below has an explicit small-subset acceptance gate and an offline fallback.

## 1. Existing repository: what is available and underused

### Data and implementation inventory

| Asset | Actual contents / current use | Opportunity or constraint |
|---|---|---|
| [`src/config/config.json`](../src/config/config.json) | Three coordinates; 1981–2025; 0°C frost and provisional 32°C hot-day thresholds; scoring coefficients | Single source of truth. Coordinates describe demonstration locations, not verified private farms. |
| `public/data/{palouse,skagit,yakima}/raw/*.json.gz` | Nine five-year POWER responses per region; request URL, coordinates, retrieval date, original header and values | Daily replay is already possible offline. Preserve archives and their hashes. |
| [`scripts/fetch_nasa.py`](../scripts/fetch_nasa.py) | Requests six parameters, validates units/dates/sentinels, writes annual/monthly aggregates and coverage | Reuse validation and provenance patterns. The script is not a crop or water-balance model. |
| `public/data/<region>/climate.json`, [`comparison.json`](../public/data/comparison.json) | Annual rain, hot/frost counts and frost boundaries; monthly rain and `GWETROOT`; coverage and provenance | Annual variability is available but the primary dashboard emphasizes averages. Monthly means cannot reconstruct events or dry spells. |
| [`src/lib/climate.js`](../src/lib/climate.js), [`ClimateCharts.jsx`](../src/components/ClimateCharts.jsx), [`App.jsx`](../src/App.jsx) | Static cached-data loading and schema checks; regional summaries and monthly charts | Preserve the no-NASA-requests-during-app-use contract. Add a separate replay cache rather than silently changing schema version 1. |
| [`data/crops.json`](../data/crops.json) | 11 crop records, 11 source records; six Palouse crops have `research_traits` with FAO/NRCS reference ranges | These ranges are displayed, but are not approved local inputs. All 11 broad crop records remain `verified: false`; categorical water/root fields remain TODO. |
| [`data/rotations.json`](../data/rotations.json) | Nine scenario slots; three Palouse sequences approved only for research demonstration; two Yakima annual patterns; four slots lack crop assignments | All planting/harvest dates are missing. The published 324-month cover schedules remain unknown. No actual farm history is established. |
| [`src/lib/management.js`](../src/lib/management.js), [`plan.js`](../src/lib/plan.js) | Explicit 36-month farmer-entered status/exposure; edits invalidate confirmation; unknown is not bare | Reusable scenario input and provenance. Monthly exposure is an assumption constant within each month, not a daily measurement. |
| [`scripts/fetch_soils.py`](../scripts/fetch_soils.py), `public/data/<region>/soil*.json` | USDA NRCS SDA request receipts and unavailable records for all three regions | **No usable soil horizons are currently cached.** Saved failures say `Tunnel connection failed: 403 Forbidden`. Do not confuse schema support with acquired soil data. |
| [`docs/METHODS.md`](METHODS.md), [`AGRICULTURAL_REVIEW.md`](AGRICULTURAL_REVIEW.md), milestone verification docs and tests | Explicit completeness, scientific limitations, source/approval gates, and synthetic fixtures | Preserve these gates. More NASA data does not approve a crop trait or sequence. |

### Six archived NASA parameters

| Exact parameter | Archived unit | Current use | Legitimate further use |
|---|---|---|---|
| `T2M_MAX` | °C (`C`) | Annual days ≥32°C | Crop-window heat exposure, consecutive hot days, historical temperature distributions |
| `T2M_MIN` | °C (`C`) | Annual frost days and half-year frost boundaries | Frost events inside supplied planting/flowering/harvest windows; stage-specific screening only with sourced thresholds |
| `PRECTOTCORR` | mm/day | Annual totals and monthly historical averages; rainfall-exposure heuristic | Seasonal totals, consecutive dry days, rolling precipitation, wet-event exposure |
| `RH2M` | % | Retained and coverage-checked; not used by current scores/charts | Humidity context; approximate vapor-pressure calculations with documented limitations |
| `ALLSKY_SFC_SW_DWN` | MJ/m²/day in community `AG` | Retained and coverage-checked; not used by current scores/charts | Input to reference evapotranspiration after adding wind/humidity inputs and implementing radiation calculations |
| `GWETROOT` | Dimensionless 0–1 (`1`) | Long-term monthly mean wetness chart | Within-location, season-matched wetness anomalies and persistence; **not** volumetric soil moisture or measured plant-available water |

Read-only archive checks recomputed valid-value counts, checked the 27 stored SHA-256 hashes, duplicate dates and complete core-variable calendars, and checked minimum ≤ maximum temperature. Results:

| Region | Core variables: valid days each | Solar valid / expected | Additional solar gaps after 1983 |
|---|---:|---:|---|
| Palouse | 16,436 | 15,340 / 16,436 | 1989-01-09 |
| Skagit | 16,436 | 15,338 / 16,436 | 1989-01-08, 1990-01-05, 1991-12-08 |
| Yakima | 16,436 | 15,341 / 16,436 | None |

All three lack solar radiation for 1981–1983 (1,095 days). A replay requiring radiation must start in 1984 and still handle the extra missing days. Missing never becomes zero. Current “normals” cover **45 years**, not a standard 30-year normal.

### What the scoring code actually measures

[`src/lib/score.js`](../src/lib/score.js) contains deterministic comparison heuristics with evidence gates:

- Water compares categorical crop demand with the June–August fraction of annual rain. It has no soil storage, actual crop ET, irrigation, or rainfall timing. Two farms with different water supplies can share the same seasonal fraction. Real records currently fail the crop approval/trait gates.
- Soil combines nitrogen-fixing crop presence, cover months, root-category diversity, and non-bare months. It does not measure soil carbon, fertility, aggregation, or soil health. Required evidence remains incomplete.
- “Erosion” computes rainfall-weighted exposed-soil assumptions. For approved Palouse sequences, a complete confirmed farmer calendar can make this eligible. It uses the **same monthly historical averages in each of the three years**, not the weather in a particular year. It is not erosion or avoided soil loss.
- Income is always excluded. The total renormalizes over available eligible scores; when only exposure is available, the total is only that index. It cannot serve as a validated ranking of all farming concerns.

This audit proposes separate indicators, not alterations to those formulas.

## 2. Verified NASA dataset catalog

### Common access and interpretation rules

NASA data listed here have **no NASA data-purchase fee**. Earthdata account registration is free; authenticated downloads/subsetting often require a NASA Earthdata Login and application authorization. Storage, computing, cloud egress, and third-party platform terms can still cost money. Cite the dataset/version and processing service. NASA-hosted NEX-GDDP also has the license terms noted below.

“Documented” below means an official product page or specification was inspected; it does **not** mean a granule was downloaded. Published coverage is an envelope, not proof of valid pixels at every date/location. Read actual granule dates, nodata, scale/offset, CRS, QA, and time bounds before admitting values. Do not silently substitute versions or confuse a provider's renamed bands with native variable names.

### 2.1 NASA POWER — the operational foundation

Official sources: [daily API documentation][power-api], [data services and native resolution][power-services], [live AG daily parameter dictionary][power-dictionary].

**Product:** POWER Daily Point API, community `AG`, explicitly `time-standard=LST` to match the repository. Global meteorology from 1981 onward; historical radiation availability is parameter/source dependent, with the repository's solar record starting in 1984. Meteorology is derived primarily from MERRA-2 reanalysis (0.5° latitude × 0.625° longitude); solar products commonly have 1° × 1° support. Daily/monthly/hourly endpoints exist, but temporal availability must be checked separately. A requested point is not a weather station.

Keep the six archived variables above. Add these exact daily variables, whose names and units were confirmed in successful responses:

| Variable | Unit | Recommended purpose |
|---|---|---|
| `WS2M` | m/s | 2 m wind input to FAO-56 reference ET |
| `PS` | kPa | Psychrometric constant using grid-surface pressure; record grid/site elevation assumptions |
| `T2MDEW` | °C | Estimate actual vapor pressure; daily dew-point approximation must be documented |
| `T2M` | °C | Mean-air-temperature context; do not silently switch an ET method's prescribed mean-temperature convention |
| `GWETTOP` | Dimensionless 0–1 | Modeled surface wetness, approximately upper 5 cm; supplement `GWETROOT` (approximately upper 1 m) |
| `EVPTRNS` | **MJ/m²/day** | Optional modeled evapotranspiration **energy flux** diagnostic; not reference ET and not mm/day |

The live dictionary calls `EVPTRNS` “Evapotranspiration Energy Flux.” Dividing an energy flux by latent heat can produce a water-equivalent flux with explicit assumptions; it does not turn it into crop demand or FAO reference ET. Do not use the parameter name as proof of an irrigation requirement.

**Missing/quality:** response `header.fill_value=-999`; decode before arithmetic. Coarse terrain, precipitation bias, source changes, and unrepresented farm irrigation limit application. Wetness is modeled relative saturation, not a satellite root-zone observation. A `GWETROOT` value of 0.4 does not mean 40% plant-available water.

**Access and project fit:** unauthenticated HTTPS JSON, free, already supported with `requests`/`pandas`. Daily point requests allow up to 20 parameters; regional requests have different limits. Cache by source grid/request identity, throttle and back off. **Data access verified for all three regions**; only a tiny 2021 sample was fetched. New-variable full-history completeness is not yet verified.

### 2.2 GPM IMERG Final daily precipitation — first rainfall upgrade

Official sources: [NASA product record][imerg-record], [GPM IMERG documentation and run guidance][imerg-doc], [GES DISC collection][imerg-disc]. **Pin `GPM_3IMERGDF`, version `07`**; DOI `10.5067/GPM/IMERGDF/DAY/07`.

| Property | Verified specification / decision |
|---|---|
| Variables | `precipitation`, `precipitation_cnt`, `randomError`; retain counts and missing/quality metadata |
| Coverage | IMERG V07B now extends to January 1998; older records say June 2000. Verify the daily service exposes the early extension before requesting it; this demo can use 2001–2025. V07 grid extends 90°S–90°N, with weaker high-latitude information. Final delivery is months behind observation. |
| Resolution | 0.1° × 0.1°; daily UTC product derived from 30-minute estimates |
| Units | `precipitation`: mm/day; `precipitation_cnt`: number of valid half-hour samples (up to 48); `randomError`: mm/day |
| Missing/quality | Decode file `_FillValue`; zero precipitation is valid. V07 estimates the daily rate from available samples, so a nonmissing day need not have 48 observations. Require/count full coverage for strict event comparisons. Mountain, snow, coastal and small-storm errors remain. |
| Access / fit | GES DISC HTTPS and supported subset services, Earthdata Login; NetCDF4. A small point/time export can be converted to the current JSON cache. CMR lookup was proxy-blocked here; authenticated subset/download remains unverified. |
| Farming use | Seasonal precipitation, dry/wet spells, precipitation overlapping exposed soil; compare with POWER as a source-sensitivity check, not ground-truth validation |

The [November 2024 release notes, Appendix 4][imerg-release] document the January 1998–May 2000 extension and its additional missingness/input differences. Prefer reprocessed V07B granules and record the full file version. Use Final for historical research; do not splice Early/Late into Final without labeling a product break. Do not multiply a daily `mm/day` value by 24 again. If later using `GPM_3IMERGHH` V07, `precipitation` is mm/hour: integrate each valid half-hour over 0.5 hours. That does not supply field-scale rainfall intensity or a validated erosion erosivity factor.

### 2.3 SMAP Level 4 — regional root-zone moisture context

Official sources: [NSIDC NASA DAAC product][smap4], [V8 user guide][smap4-guide], [V8 product specification, geophysical fields][smap4-spec]. **Pin `SPL4SMGP`, version `008`**, DOI `10.5067/T5RUATAQREF8`.

- **Variables:** `Geophysical_Data/sm_surface` (0–5 cm) and `Geophysical_Data/sm_rootzone` (0–100 cm), m³/m³. Preserve geolocation/time and processing metadata. Relative-wetness and percentile fields also exist, but use a documented common anomaly method before comparing products.
- **Coverage/resolution:** 2015-03-31 onward, land approximately 85.044°S–85.044°N excluding permanent ice/inland water; 9 km EASE-Grid 2.0, three-hour means. This is a model grid; radiometer observations have much coarser native support.
- **Scientific identity:** land-surface-model output assimilating SMAP brightness temperatures. **Root-zone moisture is not directly sensed by the satellite.** Its fixed 1 m depth is not a crop-specific rooting depth.
- **Missing/quality:** read fill/valid-range attributes, land/freeze/snow context and version notices. Complete model output does not guarantee a satellite update at that time. Do not apply L3 retrieval QA bits to L4. NSIDC currently flags a **2026-05-14 through 2026-07-28 geolocation issue**, with L4 reprocessing; use completed pre-2026 years for this demo and track replacements.
- **Access/fit:** free Earthdata-authenticated HDF5; NSIDC/Earthdata discovery and documented Harmony subsetting. Feasible through an offline subset/export, but not with the frontend alone. CMR blocked here; actual download, subset support for the selected fields, and daily extraction need a small authenticated acceptance test.
- **Use:** season-matched regional moisture anomaly and persistence. Do not convert it directly to available water, irrigation deficit, or an observed change caused by a farmer's proposed rotation.

### 2.4 SMAP enhanced Level 3 — satellite-retrieved surface moisture

Official sources: [product][smap3] and [V6 user guide, Appendix data fields and QA][smap3-guide]. **`SPL3SMP_E`, version `006`**, DOI `10.5067/M20OXIZHY3RJ`.

**Exact native fields:** AM group `Soil_Moisture_Retrieval_Data_AM/soil_moisture`, `retrieval_qual_flag`, `surface_flag`; PM group uses `soil_moisture_pm` and corresponding `_pm` fields. These differ from some platforms' `soil_moisture_am` aliases. Confirm the returned HDF paths before extraction.

Global land retrievals from 2015-03-31; 9 km grid posting, daily AM/PM composites, upper approximately 5 cm, m³/m³. Global EASE grid covers approximately ±85.044°; the additional northern polar grid extends farther north. Daily files do not imply a valid observation every day at a point; native radiometer footprint is much coarser than 9 km.

Floating moisture fill is -9999; quality flags have separate fill values. V6 guide recommends `retrieval_qual_flag` 0 or 8; decode `surface_flag` for rejection reasons, including frozen ground, snow, water, RFI and terrain. Retrievals use algorithms and ancillary assumptions; they are not in-situ measurements.

Free Earthdata-authenticated HDF5/subsetting; access not demonstrated here. Useful for surface wetting/drying context and comparison with L4. **Secondary priority:** surface retrieval gaps and depth mismatch make it less useful than L4 for a continuous root-zone scenario display.

### 2.5 MODIS vegetation — simplest long historical vegetation extension

Official sources: [NASA `MOD13Q1.061` record][mod13], [MODIS VI specification][mod13-spec], [ORNL subset service][ornl], [AppEEARS API][appeears]. DOI `10.5067/MODIS/MOD13Q1.061`.

**Product:** Terra MODIS `MOD13Q1`, collection `061`; global terrestrial 250 m sinusoidal grid, 16-day composites from **2000-02-18** onward. A composite selects a suitable observation; it is not the 16-day mean or a daily measurement.

**Layers:** native `250m 16 days NDVI`, `250m 16 days EVI`, `250m 16 days VI Quality`, `250m 16 days pixel reliability`, and `250m 16 days composite day of the year`. Subset services commonly replace spaces with underscores; get exact layer IDs from their product metadata. NDVI/EVI are dimensionless, normally raw value ×0.0001; valid raw range -2000 to 10000 and fill -3000. Respect the service's scaling convention and avoid scaling already decoded values twice. Reliability -1 means no data, 0 good, 1 marginal, 2 snow/ice, 3 cloudy; use detailed QA as well.

**Access:** free Earthdata-authenticated LP DAAC HDF-EOS download or AppEEARS point/area export; ORNL REST documents small JSON/CSV subsets (maximum ten composite dates/request) without a login in its examples. Both subset routes were proxy-blocked in this environment. They remain candidates, not tested working integrations.

**Use/limits:** vegetation greenness and timing, season-matched anomalies. A 250 m pixel can mix crops/fields; cloud, snow, aerosols, crop switching and NDVI saturation matter. Low NDVI does not identify drought, disease, poor management, or bare-soil fraction uniquely. Do not treat NDVI as measured yield or overwrite the farmer cover calendar.

### 2.6 VIIRS vegetation — continuity option, not a second mandatory integration

Official sources: [NASA `VNP13A1.002` record][viirs], [Collection 2 user guide, Tables 13–14 and file structure][viirs-guide]. DOI `10.5067/VIIRS/VNP13A1.002`.

**Product/coverage:** Suomi-NPP `VNP13A1`, version `002`, global terrestrial 500 m sinusoidal grid; 16-day composites from **2012-01-17**. Native SDS labels include `500 m 16 days NDVI`, `500 m 16 days EVI`, `500 m 16 days EVI2`, `500 m 16 days VI Quality`, and `500 m 16 days pixel reliability`; the guide's descriptive tables sometimes omit the space between 500 and m. Use metadata-discovered names.

Indices are dimensionless, raw ×0.0001; valid -10000 to 10000. The guide distinguishes land/water fill codes (-13000/-15000); do not reuse MODIS's -3000 rule. Reliability ranks and QA differ from MODIS; cloud, shadow, snow and low-quality observations need explicit filtering.

Free LP DAAC Earthdata-authenticated HDF5/AppEEARS exports; metadata call blocked here. Feasible as the same offline vegetation-cache interface, with a distinct decoder. It supports greenness/phenology, with coarser farm mixing than MOD13Q1. Do not concatenate MODIS and VIIRS anomalies as one homogeneous series without overlap assessment, common spatial support and sensor-specific baselines.

### 2.7 GLDAS — a modeled land-water budget, not independent soil truth

Official sources: [NASA collection record][gldas], [GLDAS v2 README, Table 3][gldas-guide], [NASA model-output conventions][gldas-output]. **`GLDAS_NOAH025_3H`, version `2.1`**, DOI `10.5067/E7TYRXPJKWOQ`.

Coverage: land 60°S–90°N, 2000 onward; 0.25° × 0.25°, three-hour intervals. Version 2.1 is **open-loop land-model output** forced by meteorological estimates/observations; the GLDAS name does not mean this product assimilates observed soil moisture. Do not splice v2.0's longer history into v2.1 as a homogeneous record.

| Native variable | Unit / time meaning | Use |
|---|---|---|
| `SoilMoi0_10cm_inst`, `SoilMoi10_40cm_inst`, `SoilMoi40_100cm_inst`, `SoilMoi100_200cm_inst` | kg/m², instantaneous layer water storage | Modeled depth-resolved moisture; sum first three for 0–1 m storage, without calling it plant-available water |
| `Rainf_f_tavg`, `Evap_tavg` | kg/m²/s, interval mean flux | Multiply by interval seconds to obtain mm; do not sum rates directly |
| `Qs_acc`, `Qsb_acc` | kg/m² accumulated over interval | Modeled surface runoff/baseflow; sum accumulations without multiplying by seconds |
| `SWE_inst`, `SoilTMP0_10cm_inst` | kg/m² snow-water equivalent; K soil temperature | Snow storage and frozen-soil context |

Read `_FillValue`/valid ranges and time bounds; land masks, snow physics, forcing changes and unrepresented local management limit reliability. `PotEvap_tavg` is an **energy flux (W/m²)**, not FAO reference ET in mm/day. No single retrieval-quality flag validates the modeled water budget.

Free GES DISC Earthdata-authenticated NetCDF4/HTTPS and documented subset/OPeNDAP services; CMR blocked here, data retrieval unverified. Technically feasible via offline extraction, but raw NetCDF support would add dependencies beyond current pandas/requests. Defer unless a specific modeled budget requirement cannot be met by POWER plus SMAP.

### 2.8 HLS — preferred higher-resolution vegetation route

Official sources: [NASA HLS overview][hls], [product descriptions][hls-products], [L30 scale/format][hls-l30], [band matching and masks][hls-algorithms], [NASA extraction example][hls-example]. **`HLSL30` and `HLSS30`, v2.0 (`020` in CMR)**; service IDs may render this as `2.0`/`v002`, so verify the collection rather than copying a different platform's identifier.

- **Coverage:** global land acquisition coverage, Landsat component from 2013, Sentinel-2 from 2015; 30 m MGRS/UTM tiles. Combined nominal observation opportunity is roughly every 2–3 days, not a guarantee of cloud-free coverage.
- **Variables:** L30 `B04` red and `B05` NIR; S30 `B04` red and **`B8A`** narrow NIR; `Fmask` for both. Reflectance is dimensionless, typical raw ×0.0001; inspect nodata/saturation and masks before computing `(NIR-red)/(NIR+red)` and reject a near-zero denominator.
- **Quality:** remove cloud, adjacent cloud/shadow, shadow, snow/ice, water, and unsuitable aerosol pixels according to versioned Fmask bits. Read actual nodata (commonly -9999 for reflectance), not the POWER sentinel. Field boundaries, mixed edge pixels and valid-area coverage matter.
- **Access:** free Earthdata-authenticated LP DAAC COGs with CMR/STAC discovery and supported subset/export routes. A small polygon extraction is feasible offline, but raster libraries/geometry handling are additional work and require dependency approval under `AGENTS.md`. CMR was blocked; no COG read was demonstrated.
- **Use:** field-scale greenness/timing context once the farmer supplies a polygon. HLS combines NASA/USGS Landsat with **ESA Sentinel-2**; it is NASA-produced harmonized data, not exclusively NASA sensor input. A point alone does not identify the field or its crop. HLS brightness-temperature bands are not interchangeable with a land-surface-temperature product.

For thermal work, joint NASA/USGS **Landsat 8/9 Collection 2 Level-2** is another option: `ST_B10` (K = DN×0.00341802+149), `QA_PIXEL`, `QA_RADSAT`, `ST_QA`; global land coverage, 30 m output with coarser native thermal support, 16 days per satellite and approximately 8 days combined, 2013/2021 onward. USGS provides [official product and scaling documentation][landsat-st]. Fill DN=0, cloud/adjacency effects and missing emissivity inputs constrain availability. USGS EarthExplorer/M2M requires a USGS account for those download routes; free COG distribution routes also exist. No Landsat download was tested. This is a later thermal alternative, not an MVP dependency.

### 2.9 ECOSTRESS — useful snapshots, unsuitable as daily weather forcing

Official source: [NASA `ECO_L2T_LSTE.002` record and quality alerts][eco]. Product DOI `10.5067/ECOSTRESS/ECO_L2T_LSTE.002`; evaluated version **002**, not a claim that it is newest. [Version 003 is now cataloged][eco3]; migration requires its own field/QA checks.

`LST` is retrieved land-surface temperature in K; also retain `LST_err`, `QC`, `cloud_mask`, and `water_mask` as available in the selected tiled product's layer metadata. The 70 m COG record begins **2018-07-09**, approximately 52°S–52°N. ISS overpasses occur at varying times with irregular revisit and acquisition gaps; all three Washington points are within the nominal band, but usable scenes are not assured.

Decode each COG's nodata, error and QC. **V002 QC is not a cloud mask**: NASA specifically instructs users to use `cloud_mask`. Instrument interruptions, 3-/5-band changes, and ISS solar-array obstruction can affect scenes. Temperature of the surface is not daily maximum/minimum air temperature or a direct crop-injury measurement.

Free Earthdata-authenticated LP DAAC download/AppEEARS where supported; the layer metadata request was blocked here. Feasible for a few carefully selected thermal case studies after access/QA tests. Prefer HLS greenness for the first spatial extension. ECOSTRESS ET products require additional model/product verification and are not recommended as a hackathon irrigation-savings calculator.

### 2.10 MOD16 evapotranspiration — retrospective context only

Official sources: [NASA `MOD16A2GF.061` record][mod16], [Collection 6.1 file specification][mod16-spec], and [V6.1 guide][mod16-guide]. **`MOD16A2GF`, collection `061`**, DOI `10.5067/MODIS/MOD16A2GF.061`.

Global terrestrial 500 m, eight-day composites, record from 2000; year-end gap-filled production is not near-real-time. `ET_500m` and `PET_500m` are water mass per area accumulated over the composite, normally raw ×0.1 kg/m² (numerically mm); `ET_QC_500m` provides QA. Check exact service layer IDs and file metadata before coding; the guide could not be fully retrieved by the research tool because of its size. The final annual composite has five or six days, not eight.

These are model estimates using meteorological and satellite vegetation inputs. Retain QC and mask special raw codes 32761–32767 (unclassified, urban, wetland, ice, barren, water, fill) before scaling; gap filling is not a new observation. Free Earthdata-authenticated HDF/AppEEARS or supported ORNL subsets; CMR was blocked and no data values were tested. Offline integration is plausible but lower priority. Use for broad seasonal ET context; PET is not necessarily FAO grass-reference ET, and ET/PET is not automatically a calibrated crop-stress index or irrigation withdrawal.

### 2.11 NEX-GDDP-CMIP6 — future resilience scenarios, after the historical demo

Official sources: [NASA NCCS collection/access page][nex] and [v2.0 technical note][nex-guide]. **NEX-GDDP-CMIP6 v2.0**, daily 0.25° grid, 60°S–90°N, 1950–2100; historical model experiment 1950–2014 and SSP experiments from 2015. The v2 note covers four Tier 1 SSPs; select only models/scenarios with matching available variables.

Use `tasmax`, `tasmin`, `tas` (K), `pr` (kg/m²/s), optionally `hurs` (%), `sfcWind` (m/s), `rsds`/`rlds` (W/m²). Convert temperature to °C and daily precipitation rate ×86,400 to mm/day. Decode NetCDF fill and calendar attributes, model/member identifiers and corrected-file versions.

NASA documents open THREDDS/subset and cloud access; no Earthdata login is required for its public distribution route. Downloads are free, but **v2 terms require checking each file's `cmip6_license` and the originating CMIP6 model terms**, rather than assuming unrestricted reuse across the ensemble. No subset was executed in this audit. Model-year files are too large for naïve per-farm downloads: subset a few cells and cache summaries.

These are bias-corrected/downscaled climate-model scenarios, **not observed historical weather or farm forecasts**. Use multi-model distributions of future exposure versus each model's own baseline. They do not preserve the sequence of actual observed weather, and cannot establish the best rotation or future yield. Defer until the replay and source-quality contracts work.

### Sources intentionally not prioritized

GRACE/GRACE-FO basin water-storage anomalies are too coarse to determine an individual farm's groundwater or irrigation allocation. Satellite snow cover can contextualize a supplying watershed but does not establish usable irrigation supply. A DEM can describe terrain but cannot independently predict erosion. Adding these without a basin/terrain question would add work without resolving the simulator's missing agronomy and management inputs.

## 3. Supplemental evidence is not NASA data

| Source | Useful inputs | Limits and current status |
|---|---|---|
| USDA NRCS SSURGO / [Soil Data Access][sda] | Current script requests `mukey`, components/share, drainage, slope, horizon depths, `awc_l/r/h`, organic matter, pH and texture | U.S. soil-survey map units, not a global product, daily record, or confirmed soil at the coordinate. Free public REST SQL endpoint; all three repository receipts are unavailable. Do not infer the dominant component is the farm's actual soil. |
| FAO-56 [reference ET method][fao-et], [soil-water balance/rooting ranges][fao-soil] | Reference ET equations; sourced Kc/depletion/root-depth concepts | Agricultural methodology, not NASA observations. Regional crop stages, field constraints and cultivar calibration remain necessary. Generic root ranges do not establish actual rooting depth. |
| [USDA ARS Palouse study][ars], [WSU winter-pea trials][wsu-pea] | Published sequences and management tradeoffs | Reopened and confirmed sequence context. Historical studies are not measured outcomes for the configured points. No transfer of trial yields, profit, or N credits into scores. |
| Existing WSU silage, WaSHI Skagit, NRCS pea and other citations in [`AGRICULTURAL_REVIEW.md`](AGRICULTURAL_REVIEW.md) | Regional crop context and trait references | Existing source review was inspected; not every linked publication was independently reopened in this audit. The report does not expand their approval scope. |
| Farmer records; future NOAA/WSU stations and irrigation-district records | Planting/stage dates, irrigation applied and availability, measured rain/temperature, actual field boundaries | Needed to assess local representativeness and management. Not currently acquired by this report; separate provenance from NASA and proposed scenarios. |

For a soil-storage model, add restrictive-layer depth and soil/field evidence before using root-depth potential. Given valid horizon AWC (cm/cm) and effective root-zone overlaps (cm), `TAW_mm = 10 × Σ(AWC_h × overlap_depth_cm_h)`. Preserve low/representative/high AWC and alternative map-unit components as sensitivity cases; do not collapse them to false point certainty. AWC alone does not establish initial water content, infiltration, drainage or irrigation supply.

## 4. Scientifically defensible proposed indicators

These are proposed calculations for a future implementation. Each result should carry units, analysis window, source/version, valid/expected observations, threshold provenance, spatial support, and a plain-language limitation. Use “unavailable” when required inputs are absent.

| Question | Calculation | What it can legitimately measure | What it cannot establish |
|---|---|---|---|
| Seasonal precipitation supply | `Σ P_d` over supplied crop/management dates; compare with the same dates in complete historical years | Precipitation reaching the grid during the chosen window | Effective crop water supply, infiltration, irrigation reliability |
| Dry-spell exposure | Maximum consecutive days with `P_d < 1 mm`; threshold labeled as a screening convention | Duration of low precipitation; report days and dates | Root-zone drought or crop loss; irrigation may offset it |
| Wet-event exposure | Window maximum 1-day and 5-day precipitation; count days above a stated threshold or historical percentile | Heavy-precipitation exposure at source resolution | Flooding, waterlogging, runoff, erosion, trafficability |
| Rainfall overlapping exposed soil | `E_mm = Σ(P_d × exposed_fraction_d)`; `E_fraction = E_mm / ΣP_d` for positive denominator | Scenario overlap between gridded precipitation and explicit cover assumptions | Actual soil loss, runoff, sediment export or “erosion reduction %” |
| Relative wet/dry soil context | Season-matched percentile/anomaly of `GWETROOT` or SMAP `sm_rootzone`, within the same cell/product | Whether modeled regional moisture is unusually low/high for that season | Field capacity, wilting point, farm-specific water deficit or saturation |
| Heat/frost exposure | Counts and longest runs of `Tmax ≥ threshold`, `Tmin ≤ threshold` inside supplied stage windows | Weather exposure under an explicit threshold; 32°C and 0°C are generic project screens | Crop damage probability, canopy temperature or duration below threshold from daily extrema |
| Thermal accumulation | `Σ max(0, (Tmax+Tmin)/2 − Tbase)` with crop-specific caps/method where supported | Approximate growing-degree accumulation | Maturity without cultivar/stage calibration; winter crops also need vernalization/photoperiod context |
| Atmospheric water demand | Daily FAO-56 Penman–Monteith `ET0` from temperature, humidity/dew point, radiation, wind and pressure | Reference-grass evaporative demand estimated from gridded weather | Actual crop ET, irrigation requirement or water savings |
| Climatic water balance | `Σ(P − ET0)` over a named window | Precipitation relative to atmospheric reference demand | A closed soil-water balance; excludes stored water, runoff, drainage and irrigation |
| Vegetation conditions | QA-filtered NDVI/EVI and departure from the same seasonal composite baseline; preserve acquisition dates | Greenness and seasonal timing context | Stress cause, crop identity, measured residue/soil cover or yield |
| Rotation climate exposure | Replay the same weather windows against each explicitly dated rotation; compare each exposure indicator separately | How proposed timing overlaps historical environmental conditions | A universal rotation-suitability score, disease suppression, soil-health gain or profitability |

**Precipitation is not necessarily liquid rain.** POWER corrected precipitation and IMERG can include the water equivalent of frozen precipitation. Without a validated phase/snowmelt treatment, exposed-soil overlap is precipitation exposure, not immediate rain-impact or runoff exposure. This matters particularly for Palouse winters.

**Completeness and baselines.** Follow the repository's strict complete-window policy for event counts and precipitation sums initially. A missing day breaks/invalidates a dry-spell assessment; it is not a dry or wet day. For vegetation, report valid observations and valid pixel fraction rather than requiring daily completeness. Never fill a cloudy gap with zero greenness. A practical baseline is 1991–2020 for complete POWER weather indicators, 2001–2020 for MODIS, and 2016–2025 for SMAP; these are different reference populations and must be labeled. SMAP's short record is not a 30-year climate normal. Match calendar season and crop/land-cover context; avoid comparing July to January or crop-change effects to drought.

Use an explicitly defined empirical percentile, for example `(number below + 0.5 × number equal) / N`, report N, and leave it unavailable when the reference sample is insufficient. Choose a minimum sample policy before implementation; 20 complete years for POWER and eight complete years for a short SMAP context are pragmatic software choices, not statistical guarantees. Do not interpret serially correlated daily samples as independent years. Leave the evaluated year out of an anomaly reference when evaluating historical discrimination.

### Water-demand and soil-water modeling boundaries

FAO-56 daily reference ET has the form:

`ET0 = [0.408 Δ(Rn−G) + γ(900/(T+273))u2(es−ea)] / [Δ + γ(1+0.34u2)]`.

Use MJ/m²/day for net radiation, m/s for 2 m wind, kPa for vapor pressures and °C for T. Incoming shortwave radiation is **not net radiation**: calculate net shortwave, clear-sky radiation and net longwave with the FAO method, latitude/day and stated elevation. Daily `G≈0` is a method assumption. Use the FAO temperature convention and documented humidity approximation; daily mean RH alone is less satisfactory than appropriate vapor-pressure inputs. Current caches lack wind and dew point; new sample success does not establish 45-year availability. Do not ship an unvalidated hand-written ET calculation without comparison to worked FAO examples and local reference data. [FAO-56][fao-et]

A later crop water-balance scenario needs sourced stage-specific `Kc`, effective/dynamic rooting depth, `TAW`, depletion fraction `p`, initial depletion and irrigation/runoff/drainage/capillary-rise assumptions. A bounded FAO-style depletion calculation can use `ETc = Kc×ET0`, `RAW=p×TAW` and a documented stress coefficient; treat the results as **modeled scenario stress**, not observed stress. Close the daily mass balance and expose each unmeasured flux. Do not initialize by multiplying POWER `GWETROOT` by TAW; the quantities are not interchangeable. SMAP can provide regional context, not an uncalibrated field-state reset. [FAO soil-water method][fao-soil]

### How to identify up to three concerns

Keep concerns separate from the existing weighted score. A deterministic first version can:

1. Check input and source eligibility, and state missing inputs prominently. An unknown concern is not low risk.
2. Evaluate three distinct families: **low precipitation / regional dryness**, **temperature exposure**, and **precipitation during exposed-soil periods**. Combine correlated dry-spell and wetness signals in one family rather than counting the same dry episode twice.
3. List qualifying families using farmer-stated priorities, then within-family historical extremeness and affected stage/window, with a stable tie rule. Show the actual values and rule that selected each concern. Cross-family ordering is a planning convention, not a scientifically calibrated measure of expected harm.
4. Return fewer than three if evidence supports fewer. Label generic thresholds as screens; require crop/stage evidence before wording a concern as crop-specific stress.
5. Explain a testable scenario adjustment: change an entered sowing window or cover/exposure calendar and replay the **identical weather**. Show the indicator difference and assumptions. Do not assign a generic irrigation-saving or yield benefit to a practice.

Changing a proposed rotation must not change historical POWER/SMAP/vegetation values. Those records describe the environmental context under historical conditions; they are not predictions of the counterfactual crop's response. A future bucket model can respond to scenario parameters only within its stated assumptions.

## 5. Feasibility in the three Washington regions

Values below are **cached POWER estimates for the configured points**, not local station measurements. Annual/JJA totals and hot days average 45 complete years; frost-free statistics use the project's half-year boundary definition.

| Region and WGS84 coordinate | Mean annual precipitation | Mean Jun–Aug precipitation | Mean days/year Tmax ≥32°C | Mean frost-free interval (valid years) |
|---|---:|---:|---:|---:|
| Palouse, 46.760917, -117.185694 | 731.7 mm | 88.8 mm | 14.0 | 152.2 days (45) |
| Skagit Valley, 48.439586, -122.386062 | 1,323.3 mm | 124.8 mm | 0.6 | 247.4 days (43) |
| Yakima Valley, 46.25474339, -119.7284636 | 321.5 mm | 32.4 mm | 37.9 | 195.8 days (45) |

**Palouse:** best first rotation demo because its three published sequences already have narrowly scoped approval. Investigate seasonal dryness, spring/overwinter temperature exposure, and wet-season exposed-soil assumptions. Rolling terrain makes coarse precipitation and temperature imperfect; precipitation/cover overlap alone cannot quantify hillslope erosion. Generic annual-crop root ranges and winter-pea trial outcomes are not local calibration.

**Skagit:** wetter annual conditions do not rule out summer water constraints. Wet-season exposure is worth examining, but drainage, flooding, soil bearing strength and field waterlogging need local soil/topography/hydrology. Coastal water/land mixing affects coarse grids; clouds and small fields make vegetation sampling harder. Two years lack one of the frost boundaries, so the 247.4-day mean is conditional, not evidence of missing temperatures. Crop sequences still need completion/approval.

**Yakima:** low summer precipitation and many hot days make weather exposure informative, but precipitation is especially inadequate as a water-supply measure for an irrigated scenario. Irrigation timing, allocations, delivery constraints and actual field management are essential. SMAP can mix irrigated land with surrounding dry land and cannot establish irrigation availability. Orchard/perennial management would need a different crop model; the repository currently represents annual forage-system contexts.

All cataloged datasets nominally cover these latitudes, except where local masks/clouds remove observations. **Only POWER pixel values were actually checked here**; do not claim usable SMAP/IMERG/HLS scenes for these coordinates until extraction succeeds.

### Extending to arbitrary farm coordinates

- Validate latitude/longitude and geographic land coverage; retain entered coordinates, selected grid cell/footprint, pixel center, source resolution and extraction method. A six-decimal input does not create six-decimal environmental precision.
- POWER is tens of kilometres across at Washington latitudes; 0.1° IMERG is roughly 11 km north–south and 7–8 km east–west; a 9 km SMAP grid is regional. Interpolation cannot create field-scale truth. Do not “downscale” coarse weather by merely resampling to 30 m.
- Field vegetation needs a polygon, crop history, valid pixel fraction and edge handling. Until provided, label results as the surrounding pixel/neighborhood.
- Global crop seasons cross calendar years and can be double-cropped. Replace hard-coded northern-hemisphere spring/fall and June–August logic **in a future separately scoped change**, not by assuming the Washington conventions apply everywhere.
- USDA SSURGO does not provide global soils. Unsupported locations remain unavailable until an explicitly selected supplemental soil source or farmer measurement is supplied.
- The current static app cannot acquire uncached coordinates. For the deadline, support the three cached regions and an offline preprocessing workflow. Arbitrary coordinate ingestion needs an asynchronous service/job or a precomputed grid cache; keep credentials and NASA requests out of the browser.

## 6. Priorities and implementation effort

These are engineering judgments about this repository and deadline, not numerical scientific-confidence ratings. Effort assumes access is available; authentication/network issues can dominate.

| Order | Source/work | Scientific value for this question | Accessibility here | Effort | Farmer usefulness / decision |
|---|---|---|---|---|---|
| 0 | Replay existing daily POWER | High for historical exposure | Already cached and checked | Low | Highest immediate value; ship first |
| 1 | Extend POWER: `WS2M`, `PS`, `T2MDEW`, optionally `T2M`/`GWETTOP` | High for reference demand and surface context | Tiny requests succeeded | Low ingestion; medium ET validation | Next step for water-demand discussion; not a new independent dataset |
| 2 | **IMERG Final `GPM_3IMERGDF.07`** | High for rainfall timing/detail and sensitivity | Documented; proxy/auth gate unresolved | Medium | Best first additional weather source |
| 3 | **MOD13Q1.061** | High for an additional vegetation signal | Subset APIs documented; blocked here | Low–medium if point CSV works | Tangible greenness/history context; mixed pixels |
| 4 | **SMAP `SPL4SMGP.008`** | High for regional root-zone dynamics | Documented; authenticated subset untested | Medium | Helps explain moisture persistence; still modeled/regional |
| 5 | **HLSL30/HLSS30 v2.0** | High with field polygons | Raster access untested | Medium–high | Better spatial relevance; defer until polygons and QA exist |
| Later | SMAP L3 surface retrieval | Useful complementary observation | Untested | Medium | Surface wetting context, gaps and depth limits |
| Later | VIIRS VNP13A1.002 | Useful continuity | Untested | Medium | Choose as an alternative to MODIS, not duplicate deadline scope |
| Later | GLDAS Noah 2.1 | Useful model budget context | Untested | Medium–high | Limited additional independence; not farm water accounting |
| Later | MOD16A2GF.061 | Useful retrospective ET context | Untested | Medium | Not real-time irrigation management |
| Later | ECOSTRESS / Landsat thermal | Useful clear-sky surface snapshots | Untested | High | Case-study diagnostic; irregular/cloud-limited |
| Post-demo | NEX-GDDP-CMIP6 v2 | High for future climate scenarios | Public route documented, not sampled | High | Adaptation context after historical replay is reliable |

**Recommended additional set: IMERG + MOD13Q1 + SMAP L4, with HLS as the fourth, later field option.** If Earthdata access cannot be established promptly, the honest fallback is a complete POWER-only demonstration with unavailable satellite panels omitted, not synthetic NASA results.

## 7. A realistic minimum viable simulation

1. Use the three existing points and the cached daily temperature, precipitation and wetness. Present the existing Palouse sequences as research scenarios; require explicit management dates/assumptions before attributing exposure to a crop stage.
2. Derive small per-region/per-year replay files offline, leaving the original raw data and `climate.json` intact. Keep the original LST convention. A specific historical season, or consecutive three-year block, is the forcing sequence.
3. Calculate precipitation totals/dry spells, generic heat/frost exposure, season-matched modeled-wetness context, and rainfall-weighted exposure from the entered calendar. RH and solar can remain contextual until the ET extension is validated.
4. Compare baseline and alternative on the same complete historical windows; show median and range/quantiles across years and the paired indicator differences. Do not shuffle individual days: that destroys event persistence and cross-variable relationships. Overlapping three-year windows are not independent trials.
5. A concrete replay check is the June 2021 heat episode. Do not label it the “worst” year without ranking a stated indicator over the full archive. Select dry/wet examples by a reproducible window statistic, not narrative convenience.
6. Show up to three evidence-backed concerns and one or more explicit scenario changes. Report sources, missing inputs and proxy limitations with each result. No yield, income, erosion quantity, optimized irrigation or savings claim.

Winter crops need weather beginning before the nominal harvest year; exclude a replay if preceding-fall weather is outside coverage. A three-year rotation ending in 2025 must not silently request 2026 weather. All app behavior remains based on prebuilt local files.

## 8. Advanced version after the demo

Add validated FAO-56 ET0 first. Then introduce one authenticated satellite subset at a time: IMERG precipitation, SMAP regional root-zone moisture, and QA-filtered vegetation. Compare agreement/disagreement without treating any gridded product as ground truth. Correlated forcing and shared satellite/model inputs mean agreement is not independent confirmation.

With field polygons, add HLS and assess spatial coverage. With actual irrigation records, local soils, crop-stage coefficients and initial-water assumptions, build a transparent daily soil-water scenario model with sensitivity ranges and mass-balance checks. Validate against withheld local sensor/station seasons before discussing operational use. Keep modeled water deficit separate from irrigation applied or allocated.

Finally, NEX-GDDP ensembles can stress-test exposure under future climate scenarios. Separate that mode and baseline from historical replay. Model spread is not a probability distribution of farm outcomes, and future crop physiology, pests, management and markets remain outside this environmental simulator.

## 9. Instructions for the coding agent

### A. Preserve the current contracts

- Read [`AGENTS.md`](../AGENTS.md), `METHODS.md`, and `AGRICULTURAL_REVIEW.md`. Keep the current scoring code/coefficients and approval flags unchanged until separately authorized. This audit is not approval to implement any of its proposals.
- Use Python preprocessing → versioned static JSON → pure JavaScript indicators. Do not call NASA/USDA from normal app use or embed Earthdata credentials in public files, logs, query strings or client code.
- Add a new replay schema rather than adding required fields to existing schema version 1 without a migration. Suggested future paths: `scripts/build_replay.py`, `src/lib/indicators.js`, and `public/data/<region>/replay/<year>.json`; these files are **not created by this audit**.
- Stay within current dependencies for the first step. AppEEARS/ORNL CSV or JSON exports can avoid adding raster libraries. `earthaccess`, `xarray`, `h5py`, `rasterio` and geometry libraries are optional future tooling requiring dependency approval; they are not installed or assumed here.

### B. Define provenance before adding sources

A suggested normalized observation record (field names are project proposals, not NASA variables):

```json
{
  "source_id": "power_daily_ag",
  "product_version": "response-header-version",
  "variable": "PRECTOTCORR",
  "requested_location": {"latitude": 46.760917, "longitude": -117.185694},
  "spatial_support": {"crs": "source CRS", "cell_id": "metadata-derived", "resolution": "native resolution"},
  "time_start": "source interval start",
  "time_end": "source interval end",
  "time_standard": "LST",
  "value": null,
  "unit": "mm/day",
  "qa_status": "missing",
  "valid_count": 0,
  "expected_count": 1,
  "provenance": {"request_url": "credential-free URL", "retrieved_at": "UTC timestamp", "sha256": "raw-response hash"}
}
```

Keep raw and normalized values, scale/offset, missing codes, QA method version, extraction method and original granule identifiers in the source manifest. `null` is missing; zero remains a valid physical measurement. Keep observation/retrieval/reanalysis/model/scenario classifications explicit.

### C. Integrate the recommended sources in bounded stages

| Stage | Exact acquisition and transformation | Acceptance gate |
|---|---|---|
| POWER replay | Read gzip envelopes; verify hashes; flatten dates and six variables; convert -999 to null; preserve LST | Exactly 16,436 calendar days/region for core variables, zero duplicates; agree with current aggregates; radiation gaps preserved |
| POWER extension | New versioned requests with `WS2M,PS,T2MDEW` and optional `T2M,GWETTOP`; first three days, then only the demonstration period | Units match this report; no timestamp/coordinate mismatch; full window coverage before ET; current cache not overwritten |
| IMERG | Discover `GPM_3IMERGDF` / `07`; request a tiny bounding box around one point and a few days through an available GES DISC subset route; extract `precipitation`, `precipitation_cnt`, `randomError` | Read a real file's units/fill/time bounds and cell coordinates; check counts; independently verify one daily rate. No declaration of working API from catalog success alone |
| MODIS | Query AppEEARS `/product/MOD13Q1.061` or ORNL product/band/date metadata; export one point, a few composites, NDVI/EVI + QA + composite DOY | Record returned collection, exact bands, scaling and quality fields; prove fill masking and one valid value; never assume a product alias pins collection 061 |
| SMAP L4 | Discover `SPL4SMGP` / `008`; use a supported Harmony or NSIDC spatial/variable subset; extract `sm_surface`, `sm_rootzone` for one day | Confirm EASE-grid cell and units; eight three-hour means for a complete UTC day; preserve actual interval bounds; apply land/freeze/version context |
| HLS | Discover L30/S30 v2, one field polygon and short date range; fetch only red/NIR/Fmask subset or bounded COG windows | Correct band mapping and CRS, no cloud/snow/water leakage, valid-area fraction recorded; no field claim from a point |

For AppEEARS, the documented sequence is product/layer discovery → Earthdata-backed login/token → small point task → poll task → download bundle. **No authenticated task was submitted in this audit.** Use its current API documentation for the exact request schema. ORNL's `/subset` is a possible anonymous fallback, but its access was also blocked here. A coding agent must first prove one small response on its own network.

CMR metadata search is public, but downloaded assets and cloud credentials may be protected. Discover HTTPS download links from granule metadata instead of hard-coding aging DAAC hosts. Do not assume a CMR collection has every transformation service, that an S3 URI is anonymous, or that a successful metadata call proves scientific-data access.

**Time alignment:** existing POWER days are LST; IMERG daily is UTC. Do not join them by date and call the comparison exact. For an event comparison, obtain POWER in UTC for the small comparison period, or aggregate subdaily products to a deliberately chosen common day boundary. Keep the original LST archive. Monthly/seasonal comparisons still need documented boundary handling. SMAP means must be weighted by actual interval overlap if a target day does not align with three-hour boundaries. MODIS composite values must remain observations over composite periods, not fabricated daily values.

### D. Calculate and verify before presentation

- Add focused tests for leap days, crop windows crossing years, dry spells spanning month/year boundaries, null versus zero, absent frost boundaries, zero-precipitation denominators, and incomplete windows.
- Test source-specific unit conversions and sentinels, IMERG sample counts, SMAP depth labels, MODIS/VIIRS QA differences, HLS red/NIR mapping and double-scaling prevention.
- Compare replay totals to existing cached annual/monthly values. Validate ET against published worked examples and soil-water mass balance against conservation identities, not only mirrored implementation arithmetic.
- Prevent cross-farm/source/version joins. Cache identity must include location/cell, period, time standard, product/version and variable set. Missing source access produces an explicit unavailable result, not fallback fabricated values.
- Keep tests' synthetic fixtures distinct from real cached observations. Verify no external data calls during application use. Run the repository's relevant JS/Python checks when implementation actually changes.

## 10. Access verification ledger and reproducibility

### Successful bounded requests

The following official endpoints returned HTTP 200 and parseable scientific JSON during this audit:

- [POWER AG daily parameter metadata][power-dictionary]: verified the names/units/definitions of the proposed additional variables.
- [Palouse, 2021-06-27 through 2021-06-29, 12 parameters][power-sample]: 36 scalar parameter/day values, header API `v2.10.3`, `LST`, fill -999, no messages.
- [Skagit, 2021-06-29, seven parameters][power-skagit] and [Yakima, same day/variables][power-yakima]: seven scalar values each. New values were retained only in research scratch files, not production caches.

| Point, date 2021-06-29 | `T2M_MAX` °C | `PRECTOTCORR` mm/day | `GWETROOT` | `WS2M` m/s | `PS` kPa | `T2MDEW` °C |
|---|---:|---:|---:|---:|---:|---:|
| Palouse | 41.13 | 0.00 | 0.45 | 0.67 | 91.05 | 12.87 |
| Skagit | 27.19 | 0.00 | 0.54 | 0.48 | 99.29 | 17.28 |
| Yakima | 45.36 | 0.00 | 0.33 | 1.84 | 95.98 | 11.33 |

The overlapping temperature/precipitation/wetness values agree with the repository's archived date. This verifies access and consistency for the samples, not farm accuracy or full-history availability of the new variables. The POWER returned elevations (approximately 886, 131 and 397 m respectively) are grid/source metadata, not verified field elevations.

### Blocked or not exercised

| Request | Observed result | Consequence |
|---|---|---|
| `https://cmr.earthdata.nasa.gov/search/collections.json?short_name=<product>&page_size=10` for IMERG, SMAP, MODIS/VIIRS, GLDAS, HLS, ECOSTRESS and two additional candidate products | Local HTTPS proxy: `Tunnel connection failed: 403 Forbidden` | No live catalog response/granule proof from this route |
| AppEEARS `/api/product/MOD13Q1.061`, `/VNP13A1.002`, `/ECO_L2T_LSTE.002`, `/ECO_L3T_JET.002` | Same proxy tunnel 403 | No live layer metadata or authenticated extraction |
| ORNL `/rst/api/v1/MOD13Q1/bands` and one point/composite `/subset` request | Same proxy tunnel 403 | Anonymous subset route documented, not proven operational here |
| Several Earthdata/LP DAAC landing pages | Web retrieval returned 403 or dynamic shell | Used readable NASA Open Data records and NASA/NSIDC specifications instead; retain the official canonical links |
| MOD16 V6.1 user-guide PDF | Web tool rejected large content | Product identity/behavior verified from NASA record; exact export decoder needs metadata acceptance test |
| Landsat, NEX-GDDP scientific downloads; authenticated Earthdata login/tasks | Not attempted | Documented routes only; no working-access claim |
| USDA SDA | Existing repository receipts contain proxy 403; not rerun | Soil data remain unavailable |

No bulk data, full satellite granules, credentials, subscriptions, deployments, or website changes were involved. Official pages were read through web research separately from executable requests; web-readable documentation is not evidence that the local download path works.

To reproduce the successful POWER check without installing packages, run this **small optional request** from a network that permits the endpoint:

```python
import json
from urllib.parse import urlencode
from urllib.request import urlopen

params = {
    "parameters": "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,ALLSKY_SFC_SW_DWN,GWETROOT,GWETTOP,WS2M,PS,T2MDEW,EVPTRNS",
    "community": "AG", "latitude": 46.760917, "longitude": -117.185694,
    "start": "20210627", "end": "20210629", "format": "JSON",
    "time-standard": "LST",
}
url = "https://power.larc.nasa.gov/api/temporal/daily/point?" + urlencode(params)
with urlopen(url, timeout=45) as response:
    assert response.status == 200
    data = json.load(response)
assert data["header"]["time_standard"] == "LST"
assert data["parameters"]["WS2M"]["units"] == "m/s"
assert data["parameters"]["EVPTRNS"]["units"] == "MJ/m^2/day"
assert len(data["properties"]["parameter"]["T2M_MAX"]) == 3
print(data["parameters"], data["properties"]["parameter"])
```

Read-only repository checks used Python's standard-library `gzip`, `json`, `hashlib` and `datetime` to reopen every envelope, recompute archive hashes, check unique calendars and count non--999 values against `climate.json.coverage`. No pipeline regeneration was needed. This research-only change needs Markdown/link/scope review, not a website rebuild or new unit-test suite.

## 11. Official sources and documentation

Links below identify the inspected official records or documentation. Product/access status and any retrieval limits are explicitly recorded above; a canonical link is not a guarantee that every client's network permits it.

- POWER: [API][power-api], [resolution][power-services], [live parameter metadata][power-dictionary].
- IMERG: [product][imerg-record], [documentation][imerg-doc], [V07 release notes/1998 extension][imerg-release].
- SMAP: [L4 product][smap4], [L4 specification][smap4-spec], [L3 product][smap3], [L3 guide][smap3-guide].
- Vegetation: [MOD13Q1][mod13], [MODIS specification][mod13-spec], [VIIRS product][viirs], [VIIRS guide][viirs-guide].
- Land water/ET: [GLDAS][gldas], [GLDAS variable guide][gldas-guide], [MOD16][mod16], [MOD16 specification][mod16-spec].
- Field imagery: [HLS][hls], [HLS methods][hls-algorithms], [Landsat temperature][landsat-st], [ECOSTRESS V002][eco], [V003 notice/product][eco3].
- Future climate: [NEX-GDDP access][nex], [v2 technical note and terms][nex-guide].
- Subsetting: [AppEEARS API][appeears], [ORNL REST service][ornl].
- Supplemental: [USDA SDA][sda], [FAO reference ET][fao-et], [FAO soil-water balance][fao-soil], [USDA ARS Palouse][ars], [WSU winter-pea trials][wsu-pea].

[power-api]: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
[power-services]: https://power.larc.nasa.gov/docs/services/
[power-dictionary]: https://power.larc.nasa.gov/api/system/manager/parameters?community=AG&temporal=daily
[power-sample]: https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,ALLSKY_SFC_SW_DWN,GWETROOT,GWETTOP,WS2M,PS,T2MDEW,EVPTRNS&community=AG&latitude=46.760917&longitude=-117.185694&start=20210627&end=20210629&format=JSON&time-standard=LST
[power-skagit]: https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,GWETROOT,WS2M,PS,T2MDEW&community=AG&latitude=48.439586&longitude=-122.386062&start=20210629&end=20210629&format=JSON&time-standard=LST
[power-yakima]: https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,GWETROOT,WS2M,PS,T2MDEW&community=AG&latitude=46.25474339&longitude=-119.7284636&start=20210629&end=20210629&format=JSON&time-standard=LST
[imerg-record]: https://data.nasa.gov/dataset/gpm-imerg-final-precipitation-l3-1-day-0-1-degree-x-0-1-degree-v07-gpm-3imergdf-at-ges-dis-13ed8
[imerg-doc]: https://gpm.nasa.gov/data/imerg
[imerg-disc]: https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary
[imerg-release]: https://gpm.nasa.gov/sites/default/files/2024-12/IMERG_V07_ReleaseNotes_241126.pdf
[smap4]: https://nsidc.org/data/spl4smgp/versions/8
[smap4-guide]: https://nsidc.org/sites/default/files/documents/user-guide/multi_spl4smau-v008-userguide.pdf
[smap4-spec]: https://nsidc.org/sites/default/files/documents/technical-reference/smap_l4_sm_psd_v17_for_l4sm_version_8.pdf
[smap3]: https://nsidc.org/data/spl3smp_e/versions/6
[smap3-guide]: https://nsidc.org/sites/default/files/documents/user-guide/spl3smp_e-v006-userguide.pdf
[mod13]: https://data.nasa.gov/dataset/modis-terra-vegetation-indices-16-day-l3-global-250m-sin-grid-v061-2eb0d
[mod13-spec]: https://ladsweb.modaps.eosdis.nasa.gov/filespec/MODIS/61/MOD13Q1
[ornl]: https://modis.ornl.gov/data/modis_webservice.html
[appeears]: https://appeears.earthdatacloud.nasa.gov/api/
[viirs]: https://data.nasa.gov/dataset/viirs-npp-vegetation-indices-16-day-l3-global-500m-sin-grid-v002-c6f12
[viirs-guide]: https://landweb.modaps.eosdis.nasa.gov/data/userguide/VIIRS_VegIndices_UserGuide_C2.pdf
[gldas]: https://data.nasa.gov/dataset/gldas-noah-land-surface-model-l4-3-hourly-0-25-x-0-25-degree-v2-1-gldas-noah025-3h-at-ges--cfbea
[gldas-guide]: https://hydro1.gesdisc.eosdis.nasa.gov/data/GLDAS/GLDAS_NOAH025_3H.2.1/doc/README_GLDAS2.pdf
[gldas-output]: https://ldas.gsfc.nasa.gov/gldas/model-output
[hls]: https://hls.gsfc.nasa.gov/
[hls-products]: https://hls.gsfc.nasa.gov/products-description/
[hls-l30]: https://hls.gsfc.nasa.gov/products-description/l30/
[hls-algorithms]: https://hls.gsfc.nasa.gov/algorithms/
[hls-example]: https://github.com/nasa/HLS-Data-Resources/blob/main/r/HLS_Tutorial.Rmd
[landsat-st]: https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature
[eco]: https://data.nasa.gov/dataset/ecostress-tiled-land-surface-temperature-and-emissivity-instantaneous-l2-global-70-m-v002-09540
[eco3]: https://data.nasa.gov/dataset/ecostress-tiled-land-surface-temperature-and-emissivity-instantaneous-l2-global-70-m-v003
[mod16]: https://data.nasa.gov/dataset/modis-terra-net-evapotranspiration-gap-filled-8-day-l4-global-500m-sin-grid-v061-06143
[mod16-guide]: https://lpdaac.usgs.gov/documents/931/MOD16_User_Guide_V61.pdf
[mod16-spec]: https://ladsweb.modaps.eosdis.nasa.gov/filespec/MODIS/61/MOD16A2GF_c61
[nex]: https://www.nccs.nasa.gov/data-collections/nex-gddp-cmip6/
[nex-guide]: https://www.nccs.nasa.gov/wp-content/uploads/2025/06/NEX-GDDP-CMIP6-v2-Tech_Note.pdf
[sda]: https://sdmdataaccess.sc.egov.usda.gov/
[fao-et]: https://www.fao.org/4/x0490e/x0490e06.htm
[fao-soil]: https://www.fao.org/4/x0490e/x0490e0e.htm
[ars]: https://www.ars.usda.gov/research/publications/publication/?seqNo115=427958
[wsu-pea]: https://pnwsteep.wsu.edu/pnw-conservation-tillage-handbook/austrian-winter-pea-a-good-alternative-to-fallow/

## Prioritized implementation checklist

- [ ] **P0:** Build offline daily POWER replay for the three existing regions; preserve nulls, provenance and LST.
- [ ] **P0:** Collect explicit scenario dates/cover assumptions; calculate separate precipitation, temperature and exposure indicators; return up to three explained concerns.
- [ ] **P0:** Demonstrate paired scenarios under identical historical weather; preserve crop approval gates and all existing scoring formulas.
- [ ] **P1:** Acquire a small POWER wind/pressure/dew-point extension; validate FAO-56 ET0 before expanding the period.
- [ ] **P1:** Prove one tiny Earthdata/ORNL subset on the implementation network; if blocked, deliver the complete POWER-only demo.
- [ ] **P1:** Integrate IMERG Final and one vegetation source with versioned QA/time handling; add SMAP L4 regional moisture next.
- [ ] **P2:** Add field polygons/HLS, verified local soil and irrigation inputs, then a tested water-balance scenario model.
- [ ] **P3:** Add future-climate ensembles only after historical validation; keep yield, profit, erosion and irrigation-savings claims out of environmental indicators.
