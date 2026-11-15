// M5: turn simulation results into at most three explained concerns.
// Pure presentation logic and template strings; all numbers come from simulate.js.
// Cross-family order is a stable planning convention, not a measure of expected harm.
import { MONTHS } from './climate.js';

export const CHIPS = {
  nasa: 'Historical NASA weather',
  model: 'Model estimate (GWETROOT)',
  farmer: 'Farmer assumption',
  demo: 'Illustrative demo assumption',
  simulated: 'Simulated indicator',
};
export const FAMILY_TITLES = {
  exposed: 'Precipitation on exposed soil',
  dry: 'Long dry spells during crop months',
  heat: 'Hot days during crop months',
  frost: 'Frost in spring and fall crop months',
};
// One generic sentence each. No crop-specific claims.
export const WHY = {
  exposed: 'Precipitation that falls while soil is assumed exposed shows when cover or residue would matter most in this plan; it is not a measurement of runoff or soil movement.',
  dry: 'Long runs of days with little precipitation during crop months mean a crop would depend on stored soil water or irrigation.',
  heat: 'Hot days during crop months are a general weather screen; whether they matter depends on the crop and its growth stage, which are not modeled.',
  frost: 'Freezing nights in spring and fall crop months are a general weather screen; whether they matter depends on the crop and its growth stage, which are not modeled.',
};
export const UNCERTAINTY = 'Gridded data (~50 km), not your field. Irrigation and soil storage are not modeled. Overlapping replays are not independent.';
export const IRRIGATION_NOTE = 'Irrigation, where available, may offset low precipitation; it is not modeled here.';
export const NO_CONCERN_MESSAGE = 'No screening concern met the bar in these replays. This is not evidence of low risk.';
export const PROVISIONAL_NOTE = 'Thresholds are provisional screening conventions pending team review. They are not crop-damage thresholds.';
export const NOT_A_FORECAST = 'A replay of historical weather, not a forecast. It does not estimate yield, water savings, profit or erosion.';
export const DEMO_BANNER = 'Hypothetical demonstration. Calendar and exposure values are illustrative, not farm data or recommendations.';

const number = (value, digits = 1) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
const plain = value => String(Number(value)); // 1.0 → "1", 0.25 → "0.25"
const days = count => `${count} in-crop ${count === 1 ? 'day' : 'days'}`;
export function ordinal(n) {
  const v = Math.round(n), tail = v % 100;
  return `${v}${tail >= 11 && tail <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][v % 10] ?? 'th'}`;
}
export const monthName = month => MONTHS[month - 1];
export const planMonthLabel = index => `Year ${Math.floor(index / 12) + 1} · ${MONTHS[index % 12]}`;

/** Where the plan came from. Demo assumptions are never labeled as farmer input. */
export function describePlan(plan) {
  if (plan.source === 'illustrative_demo') return { kind: 'Illustrative demo calendar', label: plan.label || 'Illustrative demo calendar', chip: CHIPS.demo };
  if (plan.source === 'farmer_confirmed') return { kind: 'Farmer-confirmed field calendar', label: plan.label || 'Farmer-confirmed field calendar', chip: CHIPS.farmer };
  if (plan.source === 'farmer_whatif') return { kind: 'What-if edit of a field calendar (unconfirmed)', label: plan.label || 'What-if edit of the field calendar (unconfirmed)', chip: CHIPS.farmer };
  const window = `${monthName(plan.window.start)} → ${monthName(plan.window.end)}`;
  return { kind: 'Climate-only growing window', label: plan.label || `Climate-only growing window ${window}, repeated each plan year`, chip: CHIPS.farmer };
}

export function howOftenText(flagged, valid) { return `${flagged} of ${valid} historical replays`; }

export function ruleText(family, c) {
  const tag = `${c.status} screen`;
  if (family === 'dry') return `${c.drySpellDays}+ consecutive in-crop days < ${plain(c.dryDayMm)} mm — ${tag}`;
  if (family === 'heat') return `${c.hotDaysPerYear}+ in-crop days ≥ ${plain(c.hotDayC)} °C in any plan year — ${tag}`;
  if (family === 'frost') return `${c.frostDaysPerYear}+ in-crop ${c.frostDaysPerYear === 1 ? 'day' : 'days'} ≤ ${plain(c.frostDayC)} °C in ${c.frostShoulderMonths.map(monthName).join(', ')} in any plan year — ${tag}`;
  return `${plain(c.exposedFraction * 100)}%+ of a plan year’s precipitation on assumed-exposed soil — ${tag}`;
}

const replayLabel = worst => `replay ${worst.startYear}–${worst.startYear + 2}`;
/** Worst example = the replay with the largest family metric (ties: earliest start year), with real dates. */
export function evidenceText(family, worst, c) {
  if (family === 'dry') return worst.spell
    ? `${worst.spell.startDate} → ${worst.spell.endDate}: ${days(worst.spell.days)} without ≥${plain(c.dryDayMm)} mm (${replayLabel(worst)})`
    : `No in-crop day below ${plain(c.dryDayMm)} mm in any replay`;
  if (family === 'heat') return worst.value > 0
    ? `${worst.calendarYear}: ${days(worst.value)} ≥ ${plain(c.hotDayC)} °C; hottest ${worst.hottest.date} at ${number(worst.hottest.value)} °C (plan year ${worst.worstPlanYear}, ${replayLabel(worst)})`
    : `No in-crop day reached ${plain(c.hotDayC)} °C in any replay`;
  if (family === 'frost') return worst.value > 0
    ? `${worst.calendarYear}: ${days(worst.value)} ≤ ${plain(c.frostDayC)} °C in shoulder months, first ${worst.first}, last ${worst.last}; coldest ${worst.coldest.date} at ${number(worst.coldest.value)} °C (plan year ${worst.worstPlanYear}, ${replayLabel(worst)})`
    : `No in-crop shoulder-month day at or below ${plain(c.frostDayC)} °C in any replay`;
  const year = worst.perYear[worst.worstPlanYear - 1];
  return `${worst.calendarYear}: ${number(year.exposedMm)} mm of ${number(year.totalMm)} mm precipitation (${number(100 * year.fraction, 0)}%) fell on assumed-exposed soil (plan year ${worst.worstPlanYear}, ${replayLabel(worst)})`;
}

export function wetnessText(wetness) {
  if (!wetness) return 'Modeled root-zone wetness context is unavailable for that year.';
  return `Modeled root-zone wetness in the crop months of ${wetness.calendarYear} averaged the ${ordinal(wetness.percentile)} percentile of the same calendar months in ${wetness.baseline[0]}–${wetness.baseline[1]} (${wetness.referenceYears} reference years). Context only — it never triggers a concern and is not measured soil water.`;
}

/** Exactly one allowed lever per card. */
export function leverFor(family, plan, farmId) {
  if (family === 'exposed') return { id: 'cover', label: 'Try keeping cover or residue in the most-exposed months' };
  if (plan.kind === 'window') return { id: 'window', label: 'Try a different growing window' };
  if (farmId === 'palouse') return { id: 'rotation', label: 'Try another Palouse research rotation' };
  return null;
}

function buildCard(simulation, family) {
  const summary = simulation.families[family], c = simulation.config, plan = simulation.plan;
  const assumption = describePlan(plan);
  return {
    family, title: FAMILY_TITLES[family], status: c.status,
    flagged: summary.flaggedRuns, valid: summary.validRuns, frequency: summary.frequency, flags: summary.flags, startYears: simulation.startYears,
    howOften: howOftenText(summary.flaggedRuns, summary.validRuns), howOftenChip: CHIPS.simulated,
    rule: ruleText(family, c),
    why: WHY[family],
    evidence: evidenceText(family, summary.worst, c), evidenceChip: CHIPS.nasa,
    assumption: family === 'exposed'
      ? `Exposure percentages and bare months come from: ${assumption.label}.`
      : `Crop months come from: ${assumption.label}.`,
    assumptionChip: assumption.chip,
    context: family === 'dry' ? { text: wetnessText(summary.worst.wetness), chip: CHIPS.model } : null,
    notes: family === 'dry' ? [IRRIGATION_NOTE] : [],
    uncertainty: UNCERTAINTY,
    lever: leverFor(family, plan, simulation.farmId),
  };
}

/**
 * 1. Families with missing inputs are listed as "Not evaluated" with a reason, never as a card.
 * 2. Qualify at frequency ≥ concernMinFrequency. 3. Rank by frequency, ties by familyOrder.
 * 4. Take at most three; never pad.
 */
export function evaluateConcerns(simulation) {
  const c = simulation.config, order = c.familyOrder;
  const brief = family => ({ family, title: FAMILY_TITLES[family], flagged: simulation.families[family].flaggedRuns, valid: simulation.families[family].validRuns,
    howOften: howOftenText(simulation.families[family].flaggedRuns, simulation.families[family].validRuns), rule: ruleText(family, c) });
  const notEvaluated = order.filter(family => simulation.families[family].status !== 'evaluated')
    .map(family => ({ family, title: FAMILY_TITLES[family], reason: simulation.families[family].reason }));
  const evaluated = order.filter(family => simulation.families[family].status === 'evaluated');
  const ranked = evaluated.filter(family => simulation.families[family].qualifies)
    .sort((a, b) => simulation.families[b].frequency - simulation.families[a].frequency || order.indexOf(a) - order.indexOf(b));
  const concerns = ranked.slice(0, 3).map(family => buildCard(simulation, family));
  return {
    concerns,
    qualified: ranked,
    alsoQualified: ranked.slice(3).map(brief),
    belowBar: evaluated.filter(family => !simulation.families[family].qualifies).map(brief),
    notEvaluated,
    message: concerns.length ? null : NO_CONCERN_MESSAGE,
  };
}

/** Every provisional threshold, for the report and the methods panel. */
export function thresholdRows(c) {
  return [
    ['Dry day', `precipitation < ${plain(c.dryDayMm)} mm`],
    ['Dry-spell screen', `${c.drySpellDays}+ consecutive in-crop dry days`],
    ['Hot day', `daily maximum ≥ ${plain(c.hotDayC)} °C`],
    ['Heat screen', `${c.hotDaysPerYear}+ in-crop hot days in any plan year`],
    ['Frost day', `daily minimum ≤ ${plain(c.frostDayC)} °C in ${c.frostShoulderMonths.map(monthName).join(', ')}`],
    ['Frost screen', `${c.frostDaysPerYear}+ in-crop frost ${c.frostDaysPerYear === 1 ? 'day' : 'days'} in any plan year`],
    ['Exposed-soil screen', `${plain(c.exposedFraction * 100)}%+ of a plan year’s precipitation on assumed-exposed soil`],
    ['Concern bar', `screen met in at least ${plain(c.concernMinFrequency * 100)}% of valid replays`],
    ['Minimum valid replays', `${c.minValidRuns}`],
    ['Wetness reference years', `${c.wetnessBaseline[0]}–${c.wetnessBaseline[1]} (context only)`],
  ].map(([label, value]) => ({ label, value, status: c.status }));
}
