// M5 historical replay simulator: pure functions, no React, no network.
// A 36-month plan is replayed through every complete three-year window of the
// archived daily NASA POWER weather. Results are screening frequencies under
// provisional thresholds — not a forecast, yield, water, profit or erosion model.
// Formulas: docs/METHODS.md, "M5 historical replay simulator".
import { dateAt, monthSpan, replayHash, replayYears } from './replay.js';

export const FAMILIES = ['exposed', 'dry', 'heat', 'frost'];
export const PLAN_MONTHS = 36;
export const PLAN_SOURCES = ['illustrative_demo', 'farmer_confirmed', 'farmer_whatif', 'growing_window'];
const IN_CROP = new Set(['cash', 'cover']);
const STATUSES = new Set(['cash', 'cover', 'bare', 'unknown']);
const isMonth = value => Number.isInteger(value) && value >= 1 && value <= 12;
const finite = (value, min = -Infinity, max = Infinity) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export const REASONS = {
  noCrop: 'The plan has no crop months (cash or cover), so in-crop weather screens cannot run.',
  climateOnly: 'Climate-only plan: exposed-soil precipitation needs a complete field calendar. Enter or confirm a field calendar below.',
  incomplete: 'The calendar has unknown months or missing exposure values, and unknown is never treated as bare soil. Enter or confirm a field calendar below.',
};

/** Thresholds are provisional screening conventions; a broken config fails closed. */
export function validateSimulationConfig(c) {
  const ok = c && typeof c.status === 'string' && finite(c.dryDayMm, 0) && Number.isInteger(c.drySpellDays) && c.drySpellDays > 0
    && finite(c.hotDayC) && Number.isInteger(c.hotDaysPerYear) && c.hotDaysPerYear > 0
    && finite(c.frostDayC) && Number.isInteger(c.frostDaysPerYear) && c.frostDaysPerYear > 0
    && Array.isArray(c.frostShoulderMonths) && c.frostShoulderMonths.length > 0 && c.frostShoulderMonths.every(isMonth)
    && finite(c.exposedFraction, 0, 1) && finite(c.concernMinFrequency, 0, 1) && Number.isInteger(c.minValidRuns) && c.minValidRuns > 0
    && Array.isArray(c.wetnessBaseline) && c.wetnessBaseline.length === 2 && c.wetnessBaseline.every(Number.isInteger) && c.wetnessBaseline[0] <= c.wetnessBaseline[1]
    && Array.isArray(c.familyOrder) && c.familyOrder.length === FAMILIES.length && FAMILIES.every(family => c.familyOrder.includes(family));
  if (!ok) throw new Error('Simulation thresholds are missing or invalid in the configuration.');
  return c;
}

/**
 * Normalize a 36-month calendar ({year 1–3, month 1–12, status, exposed_percent}).
 * In-crop = cash or cover. Bare is exactly 100% exposed. Unknown stays unknown.
 */
export function planFromCalendar(rows, { source, label = '', rotationId = null } = {}) {
  if (!['illustrative_demo', 'farmer_confirmed', 'farmer_whatif'].includes(source)) throw new Error('A calendar plan needs an explicit source.');
  if (!Array.isArray(rows) || rows.length !== PLAN_MONTHS) throw new Error('A plan calendar needs exactly 36 monthly entries.');
  const months = Array(PLAN_MONTHS).fill(null);
  for (const row of rows) {
    if (!row || !Number.isInteger(row.year) || row.year < 1 || row.year > 3 || !isMonth(row.month)) throw new Error('Invalid plan year or month.');
    const index = (row.year - 1) * 12 + row.month - 1;
    if (months[index]) throw new Error('Duplicate plan month.');
    const status = STATUSES.has(row.status) ? row.status : 'unknown';
    let exposedPercent = null;
    if (status === 'bare') exposedPercent = row.exposed_percent === 100 || row.exposed_percent == null ? 100 : null;
    else if (status !== 'unknown' && finite(row.exposed_percent, 0, 100)) exposedPercent = row.exposed_percent;
    months[index] = { index, planYear: row.year, month: row.month, status, inCrop: IN_CROP.has(status), exposedPercent };
  }
  return Object.freeze({ kind: 'calendar', source, label, rotationId, window: null, months: Object.freeze(months.map(Object.freeze)),
    hasCrop: months.some(month => month.inCrop), calendarComplete: months.every(month => month.status !== 'unknown' && month.exposedPercent !== null) });
}

/** Climate-only plan: the farmer-chosen growing window (wrapping allowed, e.g. Oct→Jul) repeats every plan year. */
export function planFromWindow(startMonth, endMonth, { label = '', rotationId = null } = {}) {
  if (!isMonth(startMonth) || !isMonth(endMonth)) throw new Error('Choose a growing-window start and end month.');
  const inside = month => startMonth <= endMonth ? month >= startMonth && month <= endMonth : month >= startMonth || month <= endMonth;
  const months = Array.from({ length: PLAN_MONTHS }, (_, index) => {
    const month = index % 12 + 1;
    return Object.freeze({ index, planYear: Math.floor(index / 12) + 1, month, status: inside(month) ? 'window' : 'outside', inCrop: inside(month), exposedPercent: null });
  });
  return Object.freeze({ kind: 'window', source: 'growing_window', label, rotationId, window: Object.freeze({ start: startMonth, end: endMonth }),
    months: Object.freeze(months), hasCrop: true, calendarComplete: false });
}

/** One run per start year Y: plan month m → calendar year Y + floor(m/12), month (m mod 12) + 1. */
export function buildRuns(replay) {
  const { first, last } = replayYears(replay);
  const runs = [];
  for (let startYear = first; startYear + 2 <= last; startYear++) {
    runs.push({ startYear, months: Array.from({ length: PLAN_MONTHS }, (_, m) => {
      const year = startYear + Math.floor(m / 12), month = m % 12 + 1;
      return { year, month, ...monthSpan(replay, year, month) };
    }) });
  }
  return runs;
}

const argmax = values => values.reduce((best, value, i) => value > values[best] ? i : best, 0);

function evaluateRun(replay, plan, run, c) {
  const rain = replay.series.PRECTOTCORR, high = replay.series.T2M_MAX, low = replay.series.T2M_MIN;
  const shoulder = new Set(c.frostShoulderMonths);
  let dryValid = plan.hasCrop, heatValid = plan.hasCrop, frostValid = plan.hasCrop, exposedValid = plan.calendarComplete;
  let current = 0, currentStart = -1, best = 0, bestStart = -1, bestEnd = -1;
  const hot = [0, 0, 0], frost = [0, 0, 0], exposedMm = [0, 0, 0], totalMm = [0, 0, 0];
  const hottest = [null, null, null], coldest = [null, null, null], frostFirst = [null, null, null], frostLast = [null, null, null];
  const exposedByMonth = Array(PLAN_MONTHS).fill(0), rainByMonth = Array(PLAN_MONTHS).fill(0);
  for (let m = 0; m < PLAN_MONTHS; m++) {
    const planned = plan.months[m], span = run.months[m], k = Math.floor(m / 12);
    for (let i = span.start; i < span.end; i++) {
      const p = rain[i];
      if (exposedValid) {
        if (p === null) exposedValid = false;
        else {
          const exposed = p * planned.exposedPercent / 100;
          totalMm[k] += p; exposedMm[k] += exposed; rainByMonth[m] += p; exposedByMonth[m] += exposed;
        }
      }
      if (!planned.inCrop) { current = 0; continue; } // a non-in-crop day ends a dry spell
      if (p === null) { dryValid = false; current = 0; } // missing is neither dry nor wet
      else if (p < c.dryDayMm) {
        if (current === 0) currentStart = i;
        current++;
        if (current > best) { best = current; bestStart = currentStart; bestEnd = i; }
      } else current = 0;
      const tMax = high[i];
      if (tMax === null) heatValid = false;
      else {
        if (tMax >= c.hotDayC) hot[k]++;
        if (!hottest[k] || tMax > hottest[k].value) hottest[k] = { index: i, value: tMax };
      }
      if (shoulder.has(planned.month)) {
        const tMin = low[i];
        if (tMin === null) frostValid = false;
        else if (tMin <= c.frostDayC) {
          frost[k]++;
          if (frostFirst[k] === null) frostFirst[k] = i;
          frostLast[k] = i;
          if (!coldest[k] || tMin < coldest[k].value) coldest[k] = { index: i, value: tMin };
        }
      }
    }
  }
  const dated = point => point ? { date: dateAt(replay, point.index), value: point.value } : null;
  const fractions = totalMm.map((total, k) => total > 0 ? exposedMm[k] / total : null);
  if (exposedValid && fractions.some(value => value === null)) exposedValid = false; // zero denominator → unavailable
  const hotYear = argmax(hot), frostYear = argmax(frost), exposedYear = exposedValid ? argmax(fractions) : 0;
  const sum = values => values.reduce((a, b) => a + b, 0);
  return {
    startYear: run.startYear,
    dry: dryValid ? { valid: true, value: best, flagged: best >= c.drySpellDays,
      spell: best > 0 ? { startIndex: bestStart, endIndex: bestEnd, startDate: dateAt(replay, bestStart), endDate: dateAt(replay, bestEnd), days: best } : null }
      : { valid: false, value: null, flagged: null, spell: null },
    heat: heatValid ? { valid: true, value: hot[hotYear], flagged: hot[hotYear] >= c.hotDaysPerYear, perYear: hot, worstPlanYear: hotYear + 1,
      calendarYear: run.startYear + hotYear, hottest: dated(hottest[hotYear]) }
      : { valid: false, value: null, flagged: null },
    frost: frostValid ? { valid: true, value: frost[frostYear], flagged: frost[frostYear] >= c.frostDaysPerYear, perYear: frost, worstPlanYear: frostYear + 1,
      calendarYear: run.startYear + frostYear, first: frostFirst[frostYear] === null ? null : dateAt(replay, frostFirst[frostYear]),
      last: frostLast[frostYear] === null ? null : dateAt(replay, frostLast[frostYear]), coldest: dated(coldest[frostYear]) }
      : { valid: false, value: null, flagged: null },
    exposed: exposedValid ? { valid: true, value: fractions[exposedYear], flagged: fractions[exposedYear] >= c.exposedFraction,
      perYear: fractions.map((fraction, k) => ({ fraction, exposedMm: exposedMm[k], totalMm: totalMm[k] })), worstPlanYear: exposedYear + 1,
      calendarYear: run.startYear + exposedYear, exposedMm: sum(exposedMm), totalMm: sum(totalMm), exposedByMonth, rainByMonth }
      : { valid: false, value: null, flagged: null },
  };
}

function monthlyWetness(replay, year, month) {
  let span;
  try { span = monthSpan(replay, year, month); } catch { return null; }
  let total = 0;
  for (let i = span.start; i < span.end; i++) {
    const value = replay.series.GWETROOT[i];
    if (value === null) return null; // an incomplete month is unavailable, never averaged around
    total += value;
  }
  return total / (span.end - span.start);
}

/**
 * Context only, never a trigger. For the in-crop months of the plan year in which
 * the run's longest dry spell starts: mean empirical percentile of monthly-mean
 * GWETROOT against the same calendar months in the baseline years.
 * percentile = (n_below + 0.5 * n_equal) / N. GWETROOT is a model estimate.
 */
export function wetnessContext(replay, plan, runResult, c) {
  const spell = runResult?.dry?.spell;
  if (!spell) return null;
  const calendarYear = Number(spell.startDate.slice(0, 4)), k = calendarYear - runResult.startYear;
  const months = plan.months.slice(k * 12, k * 12 + 12).filter(month => month.inCrop).map(month => month.month);
  if (!months.length) return null;
  const [from, to] = c.wetnessBaseline;
  let total = 0, referenceYears = Infinity;
  for (const month of months) {
    const value = monthlyWetness(replay, calendarYear, month);
    if (value === null) return null;
    const reference = [];
    for (let year = from; year <= to; year++) {
      const mean = monthlyWetness(replay, year, month);
      if (mean !== null) reference.push(mean);
    }
    if (reference.length < c.minValidRuns) return null; // insufficient reference sample → unavailable
    referenceYears = Math.min(referenceYears, reference.length);
    const below = reference.filter(mean => mean < value).length, equal = reference.filter(mean => mean === value).length;
    total += (below + 0.5 * equal) / reference.length;
  }
  return { calendarYear, months, percentile: 100 * total / months.length, baseline: [from, to], referenceYears };
}

function summarize(family, runs, c, reason) {
  const base = { family, validRuns: 0, flaggedRuns: null, frequency: null, qualifies: false, flags: runs.map(() => null), worst: null };
  if (reason) return { ...base, status: 'unavailable', reason };
  const valid = runs.filter(run => run[family].valid);
  if (valid.length < c.minValidRuns) return { ...base, status: 'unavailable', validRuns: valid.length,
    reason: `Only ${valid.length} of ${runs.length} replays had complete inputs; at least ${c.minValidRuns} are required.` };
  const flaggedRuns = valid.filter(run => run[family].flagged).length;
  // Worst example: largest family metric; ties keep the earliest start year.
  const worst = valid.reduce((best, run) => run[family].value > best[family].value ? run : best, valid[0]);
  const frequency = flaggedRuns / valid.length;
  return { ...base, status: 'evaluated', reason: null, validRuns: valid.length, flaggedRuns, frequency, qualifies: frequency >= c.concernMinFrequency,
    flags: runs.map(run => run[family].valid ? run[family].flagged : null), worst: { startYear: worst.startYear, ...worst[family] } };
}

/** Replay one plan through every complete three-year window. The replay is never modified. */
export function simulate(replay, plan, simConfig) {
  const c = validateSimulationConfig(simConfig);
  if (!plan || !Array.isArray(plan.months) || plan.months.length !== PLAN_MONTHS || !PLAN_SOURCES.includes(plan.source)) throw new Error('Invalid simulation plan.');
  const runs = buildRuns(replay).map(run => evaluateRun(replay, plan, run, c));
  const cropReason = plan.hasCrop ? null : REASONS.noCrop;
  const exposedReason = plan.kind !== 'calendar' ? REASONS.climateOnly : plan.calendarComplete ? null : REASONS.incomplete;
  const families = {
    exposed: summarize('exposed', runs, c, exposedReason),
    dry: summarize('dry', runs, c, cropReason),
    heat: summarize('heat', runs, c, cropReason),
    frost: summarize('frost', runs, c, cropReason),
  };
  if (families.dry.worst) {
    const worstRun = runs.find(run => run.startYear === families.dry.worst.startYear);
    families.dry.worst.wetness = wetnessContext(replay, plan, worstRun, c);
  }
  let exposedByPlanMonth = null;
  if (families.exposed.status === 'evaluated') {
    exposedByPlanMonth = Array(PLAN_MONTHS).fill(0);
    for (const run of runs) if (run.exposed.valid) run.exposed.exposedByMonth.forEach((value, m) => { exposedByPlanMonth[m] += value; });
  }
  return { farmId: replay.farm.id, replayHash: replayHash(replay), period: { start: replay.start, end: replay.end },
    startYears: runs.map(run => run.startYear), plan, config: c, runs, families, exposedByPlanMonth };
}

/** Plan-month indexes (0–35) with the most precipitation on assumed-exposed soil, summed over replays. */
export function topExposedMonths(simulation, count = 3) {
  if (!simulation?.exposedByPlanMonth) return [];
  return simulation.exposedByPlanMonth.map((value, index) => ({ index, value })).filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value || a.index - b.index).slice(0, count).map(item => item.index);
}
