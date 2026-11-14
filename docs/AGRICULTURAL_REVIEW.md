# Agricultural source review — M3

Status: Palouse published sequences approved for research demonstrations only; no team-approved farm recommendations. Every broad crop,
rotation and source record remains `verified: false`; narrowly scoped approval is
recorded separately in `sequence_approval`. `opened_and_read: true`
records research activity only. The original master prompt explicitly requires
this distinction. No actual farm's current rotation has been supplied; “current”
means a selectable demonstration baseline, not an assertion of farm history.

## What needs approval or completion

| Farm | Current/baseline slot | Alternative A | Alternative B |
|---|---|---|---|
| Skagit | Potato-based context; sequence TODO | Small-grain context; sequence TODO | Forage/cover context; sequence TODO |
| Yakima | Annual corn–triticale pattern | Corn + forage soybean, then triticale | Corn–triticale–wheat example; year allocation TODO |
| Palouse | Spring pea → winter wheat → spring wheat | Austrian winter pea seed → winter wheat → spring barley | Austrian winter pea green manure → winter wheat → spring barley |

Skagit evidence establishes regional crops and concerns, not exact sequences.
A crop list must not be silently turned into an ordered rotation. Four of the
nine slots (all Skagit plus Yakima B) therefore have empty crop assignments for
all three years. This is an explicit content gap, not a completed crop plan.

The two Yakima annual patterns are repeated over a proposed three-year planning
window. The source supports annual systems and a Prosser research context, not a
three-year trial at the user's coordinates. Field applicability and repetition
require review. Corn and soybean overlap in the intercrop; triticale is a separate
phase. The third Yakima source does not establish one crop per calendar year,
so its ordered example is kept in the title without invented year assignments.

The Palouse entries retain exact three-year source sequences. The winter-pea
alternatives come from historical 1981–1985 trials near Moscow, Idaho; modern
local suitability cannot be assumed. No crop-system profitability results are
transferred into the app's scores.

## Crop traits

The 11 entries are potato, winter wheat, spring wheat, spring barley, spring pea,
Austrian winter pea for seed, Austrian winter pea for green manure, silage corn,
forage triticale, forage soybean, and wheat with unspecified growth habit.

Source-supported proposed traits include pea legume status and biological
nitrogen fixation, cold adaptation of Austrian winter pea (no numeric injury
threshold), and soybean fixation/inoculation context. Each supported trait has
its own URL in `trait_sources`. A crop's use/type describes its role in these
proposals, not a claim that it can only have that role.

**Exact missing inputs:**
- Water-demand category (low/med/high) for all 11 crop entries, with a consistent
  regional definition and a source supporting each assignment.
- Shallow/deep rooting category for every entry, with contextual definitions.
- Nitrogen-fixation boolean evidence for the seven non-pea/non-soybean entries;
  null is retained instead of assigning an unsupported false.
- Numeric minimum season length for every crop; numeric frost tolerance where
  needed. These fields are not used by the present score formulas.
- Species/sequence and annual assignments for the four incomplete slots.
- Planting and harvest months for every proposed year, including preceding-fall
  planting for winter crops, and termination for green manure. No dates invented.
- All 324 monthly ground-cover statuses (9 × 36), accounting for establishment,
  residue, tillage and termination; crop presence alone is not proof of cover.
- An approved weighting approach for double crops/intercrops before water scoring.
- Prices, yields, operating costs and market assumptions before income scoring.

The WSU silage publication mentions a late-May/early-June planting window for its
intercrop method. It is not copied into a universal local calendar or used to
infer cover. The historical pea study's management dates likewise are not
presented as current recommendations.

## Approval procedure

Review each claim against the URL and locator below, and validate regional/field
applicability with extension or an agronomist. Fill unsupported fields only with
supporting evidence. Record exact URLs in each trait or monthly schedule entry.
Only after team approval should the corresponding crop, rotation and schedule
records be changed to `verified: true`. No UI action silently grants approval.
Approving an entry does not override missing values or other eligibility checks.

## Sources opened and read

### palouse_ars: USDA ARS: Soil health and ecological resilience of no-till, organic, and mixed-crop livestock systems in eastern Washington State

https://www.ars.usda.gov/research/publications/publication/?seqNo115=427958

Locator: Technical abstract, four systems (i) and (ii). Accessed 2026-11-14.

Supports: Three-year spring pea → winter wheat → spring wheat sequence in the Palouse.

Limit: Does not establish local planting/harvest dates or complete monthly cover.

### winter_pea: WSU STEEP: Austrian Winter Pea a Good Alternative to Fallow

https://pnwsteep.wsu.edu/pnw-conservation-tillage-handbook/austrian-winter-pea-a-good-alternative-to-fallow/

Locator: Research Focus; Trial I; Summer 1988. Accessed 2026-11-14.

Supports: Moscow trials included seed or green-manure Austrian winter pea → winter wheat → spring barley.

Limit: 1981–1985 trials; contemporary local suitability and management need review.

### pea_traits: USDA NRCS Pullman Plant Guide: Pea

https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_pisa6.pdf

Locator: Page 1: Uses and Description. Accessed 2026-11-14.

Supports: Peas are legumes; symbiotic root nodules fix atmospheric nitrogen. Austrian winter peas are adapted to cold temperatures.

Limit: Does not establish numeric frost tolerance, local water-need categories, or minimum season days.

### silage: WSU Extension FS358E: Increasing Value of Corn Silage in Corn-Triticale System by Intercropping with Forage Soybean

https://s3.wp.wsu.edu/uploads/sites/2676/2022/03/Increasing_the_value_of_corn_silage_FS358E.pdf

Locator: Pages 1–2: Background and Prosser trial; page 4: planting guidance. Accessed 2026-11-14.

Supports: Annual corn–triticale double cropping and forage-soybean intercropping; research near Prosser.

Limit: Regional evidence, not a confirmed rotation on the demonstration field; no complete monthly cover calendar.

### ecology: Washington Department of Ecology: Voluntary Clean Water Guidance, Crop Systems

https://apps.ecology.wa.gov/publications/parts/2010008part2.pdf

Locator: Printed page 9: Recommendations and Considerations. Accessed 2026-11-14.

Supports: Lists corn–triticale–wheat as a rotation example subject to regional and site-specific factors.

Limit: Does not assign one crop per calendar year, identify wheat growth habit, or give a Yakima field schedule.

### skagit: Washington Soil Health Initiative: Northwestern Washington Annual Cropping Systems

https://washingtonsoilhealthinitiative.com/northwestern-washington-annual-cropping-systems-rm/

Locator: Current Situation and soil physical properties. Accessed 2026-11-14.

Supports: Skagit-area potato-driven systems include small grains, silage corn and forages; growers consider cover crops and longer intervals.

Limit: No exact three-year sequences; do not infer crop order from the crop list.

### nwrec: Washington Soil Health Initiative: Six sites, six unique soils, and sixteen crops

https://washingtonsoilhealthinitiative.com/2024/09/six-sites-six-unique-soils-and-sixteen-crops/

Locator: Northwest Washington Potato-Based Annual Cropping Systems LTARE site. Accessed 2026-11-14.

Supports: Lists potato, spring barley, silage corn and winter wheat at Mount Vernon.

Limit: A crop list is not a rotation sequence.

### residue: WSU STEEP: New Minimum Tillage Systems for Legume-Winter Wheat Cropping Sequence

https://pnwsteep.wsu.edu/pnw-conservation-tillage-handbook/new-minimum-tillage-systems-for-legume-winter-wheat-cropping-sequence/

Locator: The Problem; Need for a 3-Year Rotation. Accessed 2026-11-14.

Supports: Highlights limited legume residue and erosion risks; crop presence alone does not establish protective ground cover.

Limit: Historical guidance; no field-specific cover fractions or erosion prediction.

## Research access limits

WSU Skagit Crops, Yakima Crop Production, Wheat Beat episode 100 and the CSANR long-term-experiment page returned 403 when opened. Search snippets from those pages were not treated as verified evidence. Accessible USDA, WSU-hosted PDF, STEEP and Washington Soil Health Initiative sources above were read instead. The WaSHI material describes regional systems, not an exact three-year Skagit rotation.


## Team approval: Palouse-first M3 demonstration

The user approved these published sequences, not actual histories, local
recommendations, planting/harvest dates, crop traits or ground-cover conditions:

| Approved scenario | Exact source | Locator | Remaining limitation |
|---|---|---|---|
| Spring pea → winter wheat → spring wheat | https://www.ars.usda.gov/research/publications/publication/?seqNo115=427958 | Technical Abstract, conventional no-till (NT) system | Regional research baseline; farm history and management unverified |
| Austrian winter pea for seed → winter wheat → spring barley | https://pnwsteep.wsu.edu/pnw-conservation-tillage-handbook/austrian-winter-pea-a-good-alternative-to-fallow/ | Research Focus, rotation (2) | Historical Moscow-area trials, 1981–1985; modern suitability unverified |
| Austrian winter pea green manure → winter wheat → spring barley | Same WSU URL above | Research Focus, rotation (1); Trial I | Termination/residue practices cannot be inferred for this field |

The farmer may supply a proposed or observed calendar separately. Confirmation
is an explicit assumption/report, never a published scientific finding. No month
or trait becomes independently verified through the form. See METHODS.md for
provenance, exposure definitions and limits. Skagit and Yakima candidates remain
present and pending; a completed form cannot approve their sequences.

## M4.2 evidence supplement — research references, review pending

The six Palouse entries now carry `research_traits` with values/ranges, units,
source URLs, locators, scope, limitations and review status. Existing scoring
fields and every `verified` flag are unchanged. Thus statements above about
missing scoring categories and approved monthly schedules still apply; general
numeric reference information is now available without pretending it resolves
those gaps.

| Source opened during M4.2 | What it supports | What it does not support |
|---|---|---|
| [FAO Crop Water Needs](https://www.fao.org/4/s2022e/s2022e02.htm), Tables 4–5 | Generic wheat/barley and pea seasonal water ranges; indicative cereal duration | Washington irrigation needs; low/medium/high cutoffs; winter-wheat local duration; a green-manure water budget |
| [FAO-56 Chapter 8](https://www.fao.org/4/x0490e/x0490e0e.htm), Table 22 | Maximum effective rooting ranges for winter/spring wheat, barley and dry peas | Field-specific roots or a scientifically approved shallow/deep threshold |
| [NRCS Pullman Pea Guide](https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_pisa6.pdf), Uses and Establishment | Symbiotic fixation; broad spring/fall growing-period ranges; distinctions between seed and green-manure use | Fixed fertilizer credits, a local minimum frost-free duration, or complete soil cover |
| [Government of Saskatchewan: Soil Improvements With Legumes](https://www.saskatchewan.ca/business/agriculture-natural-resources-and-industry/agribusiness-farmers-and-ranchers/crops-and-irrigation/soils-fertility-and-nutrients/soil-improvements-with-legumes), Legumes / Biological Nitrogen Fixation | Legume-type fixation distinction from cereal crops; dependence on rhizobia | Transfer of regional management rates or absence of all soil microbial fixation |
| [USDA ARS 427958](https://www.ars.usda.gov/research/publications/publication/?seqNo115=427958), Technical Abstract | Baseline sequence and 2012–2020 no-till research context | Comparison against the app's two historical winter-pea treatments in the same trial |
| [WSU STEEP winter-pea study](https://pnwsteep.wsu.edu/pnw-conservation-tillage-handbook/austrian-winter-pea-a-good-alternative-to-fallow/), Research Focus / Trial I | Seed versus green-manure sequences; recorded incorporation and planting events | Modern local planting prescriptions or percentages of ground protected by residue |

The WSU garden cover-crop page was found in search but returned HTTP 403 when
opened; it is not marked opened/read or used in the new records. The accessible
Saskatchewan government source supports the narrower botanical distinction.

No local frost-injury thresholds, numeric nitrogen credits, green-manure season
length, soil-series assignments, exposure percentages or new approval flags were
created. General pea water/root ranges are explicitly not treatment-specific
values for Austrian winter pea seed or green manure. Winter-wheat duration and
green-manure duration remain unavailable. Local cultivar/management review is
still needed. Nitrogen-fixation evidence for cereals is recorded separately and
does not overwrite their unresolved scoring boolean.

Soil attempts and limitations are documented in METHODS.md and each farm's saved
query receipt. No soil values were available through this environment's proxy.
