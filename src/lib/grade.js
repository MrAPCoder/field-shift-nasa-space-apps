// 100-point model score for ONE simulated historical year, plus the biggest-weakness analysis.
// Every number comes from runSoilSimulation output; every suggested change is a real rerun on the
// same NASA weather, location, year, soil and model. Targets: config.soilSimulation.grading and
// docs/METHODS.md ("M8 model score"). Not a yield, soil-health or erosion measurement.
import { MODEL, runSoilSimulation } from './soilWater.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const COVER_LABEL = { bare: 'bare soil between crops', residue: 'crop residue (70% assumed cover)', cover: 'a live cover crop outside the crop season' };
const fmt = (v, d = 0) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = v => `${fmt(100 * v)}%`;
export const CATEGORY_IDS = ['irrigationEfficiency', 'cropWaterSupply', 'rainExposure'];

// Linear between the zero point and the target. `higherIsBetter` false: smaller fractions earn more.
export function categoryPoints(fraction, { max, fullAt, zeroAt }) {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return null;
  const t = (fraction - zeroAt) / (fullAt - zeroAt);
  return Math.round(max * Math.min(1, Math.max(0, t)));
}
export function letterGrade(total, grades = MODEL.grading.grades) {
  if (!Number.isFinite(total)) return null;
  return grades.find(([min]) => total >= min)[1];
}
const notScored = (id, reason) => ({ id, label: MODEL.grading.categories[id].label, max: MODEL.grading.categories[id].max, status: 'NOT_SCORED', points: null, lost: null, fraction: null, reason });
const sumWhere = (days, keep, key) => days.reduce((s, d) => keep(d) ? s + d[key] : s, 0);

/** Scores a ready result. `dryRun` is the identical scenario with irrigation 0 (needed for attribution). */
export function scoreResult(result, dryRun, model = MODEL) {
  const g = model.grading, cat = g.categories;
  if (result?.status !== 'ready') {
    const categories = Object.fromEntries(CATEGORY_IDS.map(id => [id, notScored(id, result?.reason ?? 'The simulation did not run.')]));
    return { status: 'NOT_SCORED', categories, total: null, grade: null, reasons: [result?.reason ?? 'The simulation did not run.'] };
  }
  const s = result.summary, days = result.days, active = d => d.active;
  const out = {};
  // 1. Irrigation efficiency: extra drainage caused by irrigation, from a paired zero-irrigation rerun.
  if (!(s.irrigation > 0)) {
    out.irrigationEfficiency = { id: 'irrigationEfficiency', label: cat.irrigationEfficiency.label, max: cat.irrigationEfficiency.max, status: 'SCORED',
      points: cat.irrigationEfficiency.max, lost: 0, fraction: 0, evidence: { applied: 0, extraDrainage: 0 },
      noIrrigation: true };
  } else if (dryRun?.status !== 'ready' || dryRun.weatherKey !== result.weatherKey || dryRun.scenario.irrigation !== 0
    || JSON.stringify({ ...dryRun.scenario, irrigation: result.scenario.irrigation }) !== JSON.stringify(result.scenario)) {
    out.irrigationEfficiency = notScored('irrigationEfficiency', 'The paired no-irrigation run on the same weather is unavailable, so drainage cannot be attributed to irrigation.');
  } else {
    const extra = Math.max(0, s.drainage - dryRun.summary.drainage), fraction = Math.min(1, extra / s.irrigation);
    const points = categoryPoints(fraction, cat.irrigationEfficiency);
    out.irrigationEfficiency = { id: 'irrigationEfficiency', label: cat.irrigationEfficiency.label, max: cat.irrigationEfficiency.max, status: 'SCORED', points,
      lost: cat.irrigationEfficiency.max - points, fraction,
      evidence: { applied: s.irrigation, extraDrainage: extra, drainage: s.drainage, drainageWithout: dryRun.summary.drainage,
        drainDaysWithRain: days.filter(d => d.irrigation > 0 && d.drainage > 0 && d.rain >= 1).length,
        drainDays: days.filter(d => d.irrigation > 0 && d.drainage > 0).length,
        seasonRain: sumWhere(days, active, 'rain') } };
  }
  // 2. Crop water supply over the assumed crop season.
  const demand = sumWhere(days, active, 'demand'), supplied = sumWhere(days, active, 'actualET');
  if (!(demand > 0)) out.cropWaterSupply = notScored('cropWaterSupply', 'No crop-season water demand was calculated.');
  else {
    const fraction = supplied / demand, points = categoryPoints(fraction, cat.cropWaterSupply);
    out.cropWaterSupply = { id: 'cropWaterSupply', label: cat.cropWaterSupply.label, max: cat.cropWaterSupply.max, status: 'SCORED', points,
      lost: cat.cropWaterSupply.max - points, fraction,
      evidence: { demand, supplied, unmet: demand - supplied, dryDays: s.dryDays, seasonDays: days.filter(active).length,
        seasonRain: sumWhere(days, active, 'rain'), seasonIrrigation: s.irrigation, seasonET0: sumWhere(days, active, 'et0') } };
  }
  // 3. Rain exposure: share of the year's NASA precipitation on assumed exposed soil.
  if (!(s.rain > 0)) out.rainExposure = notScored('rainExposure', 'No precipitation fell in this year, so exposure cannot be scored.');
  else {
    const fraction = s.exposedRain / s.rain, points = categoryPoints(fraction, cat.rainExposure);
    out.rainExposure = { id: 'rainExposure', label: cat.rainExposure.label, max: cat.rainExposure.max, status: 'SCORED', points,
      lost: cat.rainExposure.max - points, fraction,
      evidence: { rain: s.rain, exposedRain: s.exposedRain, offSeasonRain: sumWhere(days, d => !d.active, 'rain'),
        offSeasonExposed: sumWhere(days, d => !d.active, 'exposedRain'), seasonExposed: sumWhere(days, active, 'exposedRain'), cover: result.scenario.cover } };
  }
  const missing = CATEGORY_IDS.filter(id => out[id].status !== 'SCORED');
  const total = missing.length ? null : CATEGORY_IDS.reduce((t, id) => t + out[id].points, 0);
  return { status: missing.length ? 'NOT_SCORED' : 'SCORED', categories: out, total, grade: total === null ? null : letterGrade(total, g.grades),
    reasons: missing.map(id => `${out[id].label}: ${out[id].reason}`) };
}

/** Runs a scenario and its paired zero-irrigation run, then scores it. */
export function gradeScenario(weather, scenario, model = MODEL) {
  const result = runSoilSimulation(weather, scenario, model);
  const dryRun = result.status === 'ready' && scenario.irrigation > 0 ? runSoilSimulation(weather, { ...scenario, irrigation: 0 }, model) : null;
  return { result, score: scoreResult(result, dryRun, model) };
}

// ---- Why points were lost: plain wording built only from the calculated evidence. ----
export function explainCategory(c, scenario) {
  if (c.status !== 'SCORED') return { why: c.reason, evidence: [] };
  const e = c.evidence ?? {};
  if (c.id === 'irrigationEfficiency') {
    if (c.noIrrigation) return { why: 'No irrigation was applied, so none could drain away.', evidence: [] };
    return {
      why: c.lost > 0
        ? `${fmt(e.extraDrainage)} of the ${fmt(e.applied)} mm you irrigated (${pct(c.fraction)}) drained below the 0.6 m modeled soil layer instead of staying available to the crop. Water arrived when the soil store was already full.`
        : `Only ${pct(c.fraction)} of your ${fmt(e.applied)} mm of irrigation drained below the modeled layer, which is within the target.`,
      evidence: [
        `Drainage with your irrigation: ${fmt(e.drainage)} mm · same year without irrigation: ${fmt(e.drainageWithout)} mm`,
        `${e.drainDays} irrigated days drained water; on ${e.drainDaysWithRain} of them NASA recorded at least 1 mm of precipitation`,
        `${fmt(e.seasonRain)} mm NASA precipitation fell during the crop season`,
      ],
    };
  }
  if (c.id === 'cropWaterSupply') return {
    why: c.lost > 0
      ? `During the ${MONTHS[scenario.planting - 1]}–${MONTHS[scenario.harvest - 1]} season, NASA weather created ${fmt(e.demand)} mm of crop water demand, but the modeled soil supplied ${fmt(e.supplied)} mm (${pct(c.fraction)}). On ${e.dryDays} days water was below the crop stress line.`
      : `The modeled soil supplied ${pct(c.fraction)} of the crop-season water demand, which meets the target.`,
    evidence: [
      `Crop demand ${fmt(e.demand)} mm, from FAO-56 reference ET of ${fmt(e.seasonET0)} mm driven by NASA temperature, humidity, sunlight, wind and pressure`,
      `Water in during the season: ${fmt(e.seasonRain)} mm NASA precipitation + ${fmt(e.seasonIrrigation)} mm irrigation`,
      `${e.dryDays} of ${e.seasonDays} crop-season days below the crop stress line`,
    ],
  };
  return {
    why: c.lost > 0
      ? `${fmt(e.exposedRain)} of ${fmt(e.rain)} mm of NASA precipitation (${pct(c.fraction)}) fell on exposed soil. ${fmt(e.offSeasonExposed)} mm of that fell outside the crop season with ${COVER_LABEL[e.cover]}.`
      : `${pct(c.fraction)} of the year's precipitation fell on exposed soil, which meets the target.`,
    evidence: [
      `${fmt(e.offSeasonRain)} mm of NASA precipitation fell outside the crop season`,
      `Exposed-soil precipitation: ${fmt(e.offSeasonExposed)} mm off-season + ${fmt(e.seasonExposed)} mm in season`,
      'Assumed cover fractions; an exposure proxy, not measured erosion or soil health',
    ],
  };
}

// ---- Candidate one-setting changes. Soil type and location are never changed. ----
export function candidateChanges(scenario, model = MODEL) {
  const g = model.grading, list = [];
  for (const amount of g.irrigationOptions) if (amount !== scenario.irrigation)
    list.push({ id: `irrigation-${amount}`, setting: 'irrigation', value: amount, scenario: { ...scenario, irrigation: amount },
      action: amount < scenario.irrigation ? `Reduce net irrigation from ${scenario.irrigation} to ${amount} mm/week` : `Increase net irrigation from ${scenario.irrigation} to ${amount} mm/week` });
  for (const cover of ['bare', 'residue', 'cover']) if (cover !== scenario.cover)
    list.push({ id: `cover-${cover}`, setting: 'cover', value: cover, scenario: { ...scenario, cover },
      action: `Change ground cover between crops to ${COVER_LABEL[cover]}` });
  // Shifting the whole season keeps its length; seasons that cross New Year are not shifted.
  if (scenario.planting <= scenario.harvest) for (const shift of g.plantingShiftMonths) {
    const planting = scenario.planting + shift, harvest = scenario.harvest + shift;
    if (planting >= 1 && harvest <= 12)
      list.push({ id: `season${shift > 0 ? '+' : ''}${shift}`, setting: 'season', value: [planting, harvest], scenario: { ...scenario, planting, harvest },
        action: `Shift the season ${shift < 0 ? 'one month earlier' : 'one month later'}: plant in ${MONTHS[planting - 1]}, harvest in ${MONTHS[harvest - 1]}` });
  }
  return list;
}

function tradeoffs(before, after, delta) {
  const list = [];
  for (const id of CATEGORY_IDS) if (delta[id] < 0) list.push(`${after.score.categories[id].label} drops ${-delta[id]} point${delta[id] === -1 ? '' : 's'}.`);
  const b = before.result.summary, a = after.result.summary;
  if (a.dryDays > b.dryDays) list.push(`${a.dryDays - b.dryDays} more crop-season days below the crop stress line (${b.dryDays} → ${a.dryDays}).`);
  if (a.irrigation > b.irrigation) list.push(`Uses ${fmt(a.irrigation - b.irrigation)} mm more irrigation water over the season.`);
  if (a.drainage > b.drainage + .5) list.push(`${fmt(a.drainage - b.drainage)} mm more water drains below the modeled layer.`);
  const offET = r => r.days.reduce((s, d) => d.active ? s : s + d.actualET, 0);
  if (after.result.scenario.cover === 'cover' && offET(after.result) > offET(before.result) + .5) list.push(`The live cover crop uses ${fmt(offET(after.result) - offET(before.result))} mm more off-season water.`);
  if (after.result.scenario.planting !== before.result.scenario.planting) list.push('Planting-date effects on frost, crop development and yield are not modeled.');
  return list;
}
const WHY_CHANGE = {
  irrigation: (c, a, b) => a.irrigation < b.irrigation
    ? 'Less water is added when NASA precipitation has already filled the soil, so less drains away.'
    : 'More water reaches the soil during the season, so the crop spends fewer days below the stress line.',
  cover: c => c.value === 'residue' ? 'Residue shields more of the soil surface from precipitation outside the crop season.'
    : c.value === 'cover' ? 'A live cover crop shields more of the soil surface from off-season precipitation.' : 'Bare soil between crops uses less off-season water.',
  season: () => 'Moving the assumed season changes which NASA weather the crop meets.',
};

// Which practical settings act on each category. Soil type is never offered as a fix.
const LEVERS = {
  irrigationEfficiency: (t, s) => (t.setting === 'irrigation' && t.value < s.irrigation) || t.setting === 'season',
  cropWaterSupply: (t, s) => (t.setting === 'irrigation' && t.value > s.irrigation) || t.setting === 'season',
  rainExposure: t => t.setting === 'cover',
};

/**
 * Biggest weakness = the category whose best model-supported single change raises the TOTAL score
 * most (net of tradeoffs), among categories that lost a meaningful number of points.
 */
export function analyzeWeaknesses(weather, scenario, model = MODEL, baseline = null) {
  const g = model.grading, before = baseline ?? gradeScenario(weather, scenario, model);
  if (before.score.status !== 'SCORED') return { status: 'NOT_SCORED', before, biggest: null, categories: [], reasons: before.score.reasons };
  const tried = candidateChanges(scenario, model).map(change => {
    const after = gradeScenario(weather, change.scenario, model);
    if (after.score.status !== 'SCORED') return null;
    const delta = Object.fromEntries(CATEGORY_IDS.map(id => [id, after.score.categories[id].points - before.score.categories[id].points]));
    return { ...change, after, delta, totalGain: after.score.total - before.score.total };
  }).filter(Boolean);
  const categories = CATEGORY_IDS.map(id => {
    const c = before.score.categories[id];
    // A change counts for a category only if it uses that category's lever AND raises that category.
    const options = tried.filter(t => LEVERS[id](t, scenario) && t.delta[id] > 0 && t.totalGain >= g.minMeaningfulGain)
      // Largest total gain; ties go to the smallest change in the same setting, then list order.
      .sort((a, b) => b.totalGain - a.totalGain || Math.abs(a.scenario.irrigation - scenario.irrigation) - Math.abs(b.scenario.irrigation - scenario.irrigation));
    const best = options[0] ?? null;
    return { ...c, ...explainCategory(c, scenario), meaningful: c.lost >= g.minMeaningfulLoss,
      improvement: best && {
        id: best.id, setting: best.setting, value: best.value, action: best.action, scenario: best.scenario,
        why: WHY_CHANGE[best.setting](best, best.scenario, scenario),
        categoryBefore: c.points, categoryAfter: best.after.score.categories[id].points, categoryGain: best.delta[id],
        totalBefore: before.score.total, totalAfter: best.after.score.total, totalGain: best.totalGain,
        gradeBefore: before.score.grade, gradeAfter: best.after.score.grade,
        delta: best.delta, tradeoffs: tradeoffs(before, best.after, best.delta),
      } };
  });
  const ranked = categories.filter(c => c.meaningful && c.improvement)
    .sort((a, b) => b.improvement.totalGain - a.improvement.totalGain || b.lost - a.lost || CATEGORY_IDS.indexOf(a.id) - CATEGORY_IDS.indexOf(b.id));
  const biggest = ranked[0] ?? null;
  const lostAny = categories.filter(c => c.meaningful).sort((a, b) => b.lost - a.lost);
  const status = biggest ? 'WEAKNESS' : lostAny.length ? 'NO_SUPPORTED_CHANGE' : 'MEETS_TARGETS';
  const message = status === 'MEETS_TARGETS'
    ? `Every category is within ${g.minMeaningfulLoss - 1} point of its target, so there is no meaningful weakness to fix in this scenario.`
    : status === 'NO_SUPPORTED_CHANGE'
      ? `${lostAny[0].label} lost the most points (${lostAny[0].points}/${lostAny[0].max}), but none of the ${tried.length} tested single changes (irrigation amount, ground cover or a one-month season shift) raised the total score by at least ${g.minMeaningfulGain} point on this weather.`
      : null;
  return { status, before, biggest, categories, others: categories.filter(c => c !== biggest), message, candidatesTested: candidateChanges(scenario, model).length };
}
