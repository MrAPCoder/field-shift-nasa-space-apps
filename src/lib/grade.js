// Farm score v2: a provisional, educational 100-point rating of ONE simulated historical year.
// Every number comes from runSoilSimulation output on archived NASA POWER weather; every
// suggested change is a real rerun on the same weather, location, year, soil and crop.
// Rubric: config.soilSimulation.grading; derivation and limits: docs/METHODS.md ("M9").
// Not a validated farm assessment, soil-health test, erosion, yield or crop-damage estimate.
import { MODEL, runSoilSimulation } from './soilWater.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const COVER_TEXT = { bare: 'bare soil between crops', residue: 'crop residue (70% assumed cover)', cover: 'a live cover crop outside the crop season' };
const fmt = (v, d = 0) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = v => `${fmt(100 * v)}%`;
const sum = (days, key, keep = () => true) => days.reduce((t, d) => keep(d) ? t + d[key] : t, 0);
export const GROUP_IDS = ['cropWater', 'irrigation', 'soilCover'];

/** Linear credit between a zero point and a target (either direction), clamped to 0–1. */
export function credit(value, { fullAt, zeroAt }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, (value - zeroAt) / (fullAt - zeroAt)));
}

/** Why a scenario cannot be scored fairly by this model, or [] if it can. */
export function seasonIssues(result, model = MODEL) {
  const rule = model.grading.scorableSeason, s = result.scenario, issues = [];
  if (!rule.allowNewYear && s.planting > s.harvest) issues.push('The season crosses New Year. The autumn part is not simulated, so the crop year is incomplete.');
  const months = s.planting <= s.harvest ? s.harvest - s.planting + 1 : 12 - s.planting + 1 + s.harvest;
  if (months < rule.minMonths) issues.push(`The season is shorter than ${rule.minMonths} months, too short to score as a full crop season.`);
  // Precipitation on freezing days enters the bucket as liquid; when much of the season's water
  // arrives that way, the crop-water result is not trustworthy.
  const crop = result.days.filter(d => d.active), P = sum(crop, 'rain'), frozenP = sum(crop, 'rain', d => d.freezing);
  if (P > 0 && frozenP / P > rule.maxFreezingPrecipShare) issues.push(`${pct(frozenP / P)} of crop-season precipitation fell on days with a NASA minimum temperature at or below 0 °C. Snow and frozen ground are not modeled, so this season cannot be scored reliably.`);
  return issues;
}

/** Raw, unweighted metrics read from the daily records. `dry` = same scenario with irrigation 0. */
export function metrics(result, dry, model = MODEL) {
  const g = model.grading, days = result.days, crop = days.filter(d => d.active);
  const demand = sum(crop, 'demand'), supplied = sum(crop, 'actualET');
  // Longest run of consecutive crop-season days below the stress line.
  let longest = 0, run = 0, longestEnd = null;
  days.forEach((d, i) => { run = d.active && d.dry ? run + 1 : 0; if (run > longest) { longest = run; longestEnd = i; } });
  // Worst window: lowest supplied/demand over any window of consecutive crop-season days.
  const w = g.groups.cropWater.factors.worstPeriod.windowDays;
  let worst = null, worstStart = null;
  for (let i = 0; i + w <= days.length; i++) {
    const win = days.slice(i, i + w);
    if (!win.every(d => d.active)) continue;
    const dem = sum(win, 'demand'); if (!(dem > 0)) continue;
    const r = sum(win, 'actualET') / dem;
    if (worst === null || r < worst) { worst = r; worstStart = i; }
  }
  const m = {
    cropDays: crop.length, demand, supplied, unmet: demand - supplied,
    demandMet: demand > 0 ? supplied / demand : null,
    timeAboveStress: crop.length ? crop.filter(d => !d.dry).length / crop.length : null,
    stressDays: crop.filter(d => d.dry).length,
    longestStress: longest, longestStressEnd: longestEnd === null ? null : days[longestEnd].date,
    longestStressStart: longestEnd === null || !longest ? null : days[longestEnd - longest + 1].date,
    worstPeriod: worst, worstPeriodStart: worstStart === null ? null : days[worstStart].date,
    meanAvailable: crop.length ? sum(crop, 'availablePercent') / crop.length : null,
    seasonRain: sum(crop, 'rain'), seasonET0: sum(crop, 'et0'),
    irrigation: result.summary.irrigation, drainage: result.summary.drainage,
  };
  // Irrigation: exact decomposition over crop-season days, I = ΔET + Δdrainage + Δstorage at season end.
  if (m.irrigation > 0 && dry?.status === 'ready') {
    const di = dry.days, idx = days.map((d, i) => d.active ? i : -1).filter(i => i >= 0);
    m.irrExtraET = idx.reduce((t, i) => t + days[i].actualET - di[i].actualET, 0);
    m.irrExtraDrainage = idx.reduce((t, i) => t + days[i].drainage - di[i].drainage, 0);
    const lastI = idx.at(-1);
    m.irrLeftInSoil = days[lastI].water - di[lastI].water;
    m.cropUse = m.irrExtraET / m.irrigation;
    m.drainShare = m.irrExtraDrainage / m.irrigation;
    m.irrDrainDays = idx.filter(i => days[i].drainage > 0 && days[i].irrigation > 0).length;
  }
  // Exposure: non-freezing days only (precipitation phase is not modeled on freezing days).
  const liquid = d => !d.freezing, heavyMm = g.groups.soilCover.factors.heavyExposure.heavyDayMm;
  const heavy = d => liquid(d) && d.rain >= heavyMm;
  m.liquidRain = sum(days, 'rain', liquid); m.liquidExposed = sum(days, 'exposedRain', liquid);
  m.exposure = m.liquidRain > 0 ? m.liquidExposed / m.liquidRain : null;
  m.heavyDays = days.filter(heavy).length; m.heavyRain = sum(days, 'rain', heavy); m.heavyExposed = sum(days, 'exposedRain', heavy);
  m.heavyExposure = m.heavyRain > 0 ? m.heavyExposed / m.heavyRain : null;
  m.offSeasonLiquidExposed = sum(days, 'exposedRain', d => liquid(d) && !d.active);
  m.freezingPrecip = sum(days, 'rain', d => d.freezing);
  m.cover = result.scenario.cover;
  return m;
}

/** Score a ready result. Returns status, total (0–100) and per-group points used for diagnosis only. */
export function scoreResult(result, dry, model = MODEL) {
  if (result?.status !== 'ready') return { status: 'NOT_SCORED', total: null, reasons: [result?.reason ?? 'The simulation did not run.'] };
  const issues = seasonIssues(result, model);
  // Raw metrics stay available for before/after display; only the score is withheld.
  if (issues.length) return { status: 'NOT_SCORED', total: null, reasons: issues, metrics: metrics(result, dry, model) };
  if (result.summary.irrigation > 0 && (dry?.status !== 'ready' || dry.weatherKey !== result.weatherKey || dry.scenario.irrigation !== 0
    || ['location','year','crop','soil','planting','harvest','cover'].some(k => dry.scenario[k] !== result.scenario[k])))
    return { status: 'NOT_SCORED', total: null, reasons: ['The paired no-irrigation run on identical weather is unavailable, so irrigation use cannot be attributed.'] };
  const m = metrics(result, dry, model), G = model.grading.groups, groups = {};
  for (const id of GROUP_IDS) {
    const factors = {};
    let earned = 0, possible = 0;
    for (const [fid, f] of Object.entries(G[id].factors)) {
      // No irrigation applied: nothing could be lost, so irrigation efficiency gets full credit.
      // Every scenario is therefore scored on the same fixed 100-point scale with the same weights.
      const c = id === 'irrigation' && !(m.irrigation > 0) ? 1 : credit(m[fid], f);
      factors[fid] = { value: m[fid] ?? null, credit: c, weight: f.weight };
      if (c !== null) { earned += f.weight * c; possible += f.weight; }
    }
    // Heavy-day exposure has no value in a year without heavy non-freezing days; the group keeps its
    // points and uses the remaining factor.
    groups[id] = { id, label: G[id].label, max: G[id].points, factors,
      points: possible > 0 ? G[id].points * earned / possible : null, noIrrigation: id === 'irrigation' && !(m.irrigation > 0) };
  }
  if (GROUP_IDS.some(id => groups[id].points === null)) return { status: 'NOT_SCORED', total: null, reasons: ['Crop-season demand or non-freezing precipitation could not be calculated.'], metrics: m };
  for (const id of GROUP_IDS) { groups[id].applicable = true; groups[id].lost = groups[id].max - groups[id].points; }
  const exact = GROUP_IDS.reduce((t, id) => t + groups[id].points, 0);
  return { status: 'SCORED', total: Math.round(exact), exact, groups, metrics: m, reasons: [] };
}

const cloneWithStart = (() => { const cache = new Map(); return (model, fraction) => {
  const key = `${fraction}`; if (model !== MODEL) { const c = structuredClone(model); c.assumptions.initialAvailableFraction = fraction; return c; }
  if (!cache.has(key)) { const c = structuredClone(MODEL); c.assumptions.initialAvailableFraction = fraction; cache.set(key, c); }
  return cache.get(key); }; })();

/**
 * Sensitivity bound only, never displayed: a copy of the archive in which precipitation on days with
 * NASA minimum temperature ≤ 0 °C is removed, i.e. assumes none of it reached the soil as liquid.
 */
const winterCache = new WeakMap();
export function dryWinterWeather(weather) {
  if (!winterCache.has(weather)) {
    const w = structuredClone(weather), p = w.series.PRECTOTCORR, tmin = w.series.T2M_MIN;
    for (let i = 0; i < p.length; i++) if (tmin[i] !== null && tmin[i] <= 0 && p[i] !== null) p[i] = 0;
    w.fingerprint = `${weather.fingerprint}-dry-winter-bound`;
    winterCache.set(weather, w);
  }
  return winterCache.get(weather);
}

/** Run a scenario plus its paired zero-irrigation run, then score it. */
export function gradeScenario(weather, scenario, model = MODEL) {
  const result = runSoilSimulation(weather, scenario, model);
  const dry = result.status === 'ready' && scenario.irrigation > 0 ? runSoilSimulation(weather, { ...scenario, irrigation: 0 }, model) : null;
  return { result, dry, score: scoreResult(result, dry, model) };
}

/** Totals with the assumed Jan 1 starting water at 0%, 50% and 100% of capacity. */
export function startWaterRange(weather, scenario, model = MODEL) {
  const totals = model.grading.startWater.fractions.map(f => gradeScenario(weather, scenario, cloneWithStart(model, f)).score.total);
  if (totals.some(t => t === null)) return null;
  return { totals, min: Math.min(...totals), max: Math.max(...totals), spread: Math.max(...totals) - Math.min(...totals) };
}

// ---- The biggest problem: the group losing the most points, explained from the model results. ----
function describeProblem(id, m, s) {
  const season = `${MONTHS[s.planting - 1]}–${MONTHS[s.harvest - 1]}`;
  if (id === 'cropWater') return {
    id, title: 'Crop water shortage',
    text: `From ${season}, the weather called for ${fmt(m.demand)} mm of crop water, but the modeled soil supplied ${fmt(m.supplied)} mm (${pct(m.demandMet)}). The crop was under water stress on ${m.stressDays} of ${m.cropDays} days${m.longestStress >= 3 ? `, including a ${m.longestStress}-day stretch` : ''}.`,
    evidence: [`Crop water demand comes from FAO-56 reference evapotranspiration (${fmt(m.seasonET0)} mm this season), calculated from NASA temperature, humidity, sunlight, wind and pressure`,
      `Water in during the season: ${fmt(m.seasonRain)} mm NASA precipitation + ${fmt(m.irrigation)} mm irrigation`,
      m.worstPeriod !== null ? `Worst two weeks: the soil met ${pct(m.worstPeriod)} of demand, from ${m.worstPeriodStart}` : null].filter(Boolean),
  };
  if (id === 'irrigation') {
    const draining = m.irrExtraDrainage >= m.irrLeftInSoil;
    return {
      id, title: draining ? 'Excessive irrigation' : 'Irrigation left in the soil',
      text: draining
        ? `Compared with no irrigation, ${fmt(m.irrExtraDrainage)} of the ${fmt(m.irrigation)} mm irrigated (${pct(m.drainShare)}) ended up as extra drainage below the 0.6 m model layer. Much of it was added when the soil was already full.`
        : `Compared with no irrigation, only ${pct(m.cropUse)} of the ${fmt(m.irrigation)} mm irrigated shows up as added crop-season water use. ${fmt(m.irrLeftInSoil)} mm was still stored at harvest and ${fmt(m.irrExtraDrainage)} mm drained.`,
      evidence: [`Of the irrigation: ${fmt(m.irrExtraET)} mm added crop-season evapotranspiration, ${fmt(m.irrExtraDrainage)} mm added modeled drainage, ${fmt(m.irrLeftInSoil)} mm added storage at harvest`,
        'Found by rerunning the same year and weather with no irrigation; drainage is a model quantity, not a field measurement'],
    };
  }
  return {
    id, title: 'Rain on exposed soil',
    text: `${fmt(m.liquidExposed)} of ${fmt(m.liquidRain)} mm of rain (${pct(m.exposure)}) fell on exposed soil, ${fmt(m.offSeasonLiquidExposed)} mm of it between crops with ${COVER_TEXT[m.cover]}.${m.heavyDays ? ` That includes ${m.heavyDays} heavier day${m.heavyDays > 1 ? 's' : ''} of 12.7 mm or more.` : ''}`,
    evidence: ['Exposure uses assumed cover fractions. It is an indicator, not measured erosion or soil health',
      `${fmt(m.freezingPrecip)} mm fell on freezing days and is left out, because snow is not modeled`],
  };
}

const INVESTIGATE = {
  cropWater: 'Worth investigating: irrigation timing (this model spreads irrigation evenly), local planting dates with an extension agronomist, or a crop with lower water demand.',
  irrigation: 'Worth investigating: scheduling irrigation by soil moisture. This model spreads irrigation evenly, so it cannot test timing.',
  soilCover: 'Worth investigating: local residue and cover-crop practices. The cover fractions here are generic assumptions.',
};

/** How a change affects modeled crop-water shortage, and whether that worsening is material. */
export function shortageChange(b, a, model = MODEL) {
  const rule = model.grading.guardrail;
  const stress = a.stressDays - b.stressDays, met = a.demandMet - b.demandMet, worst = (a.worstPeriod ?? 0) - (b.worstPeriod ?? 0);
  return { stress, met, worst, material: stress >= rule.maxExtraStressDays || -met >= rule.maxDemandMetDrop || -worst >= rule.maxWorstPeriodDrop,
    none: stress <= 0 && -met <= rule.strictDemandMetDrop && -worst <= rule.strictDemandMetDrop };
}

function tradeoffs(before, after, model) {
  const b = before.score.metrics, a = after.score.metrics, list = [], sh = shortageChange(b, a, model);
  if (sh.stress > 0) list.push(`${sh.stress} more day${sh.stress > 1 ? 's' : ''} of crop water stress (${b.stressDays} → ${a.stressDays}).`);
  if (sh.met < -.005) list.push(`Crop demand met falls from ${pct(b.demandMet)} to ${pct(a.demandMet)}.`);
  if (a.irrigation > b.irrigation) list.push(`Uses ${fmt(a.irrigation - b.irrigation)} mm more irrigation water.`);
  if (a.drainage > b.drainage + .5) list.push(`${fmt(a.drainage - b.drainage)} mm more modeled drainage over the year.`);
  if (a.exposure > b.exposure + .005) list.push(`More rain on exposed soil (${pct(b.exposure)} → ${pct(a.exposure)}).`);
  const off = r => r.days.reduce((t, d) => d.active ? t : t + d.actualET, 0);
  if (after.result.scenario.cover === 'cover' && off(after.result) > off(before.result) + .5) list.push(`The cover crop uses ${fmt(off(after.result) - off(before.result))} mm more water between seasons.`);
  return list;
}

function describeChange(from, to) {
  const parts = [], why = [];
  if (to.irrigation !== from.irrigation) {
    parts.push(to.irrigation === 0 ? `Stop irrigating (now ${from.irrigation} mm/week)` : `${to.irrigation < from.irrigation ? 'Reduce' : 'Increase'} irrigation from ${from.irrigation} to ${to.irrigation} mm/week`);
    why.push(to.irrigation < from.irrigation ? 'less water drains away when rain has already filled the soil' : 'more water reaches the crop in dry spells');
  }
  if (to.cover !== from.cover) {
    parts.push(`${parts.length ? 'switch' : 'Switch'} ground cover between crops to ${COVER_TEXT[to.cover]}`);
    why.push(to.cover === 'bare' ? 'bare ground uses less water between seasons' : to.cover === 'residue' ? 'residue shields the soil and cuts evaporation' : 'a cover crop shields the soil between seasons');
  }
  const text = parts.join(' and ');
  return { action: text.charAt(0).toUpperCase() + text.slice(1), why: why.join(', and ').replace(/^./, c => c.toUpperCase()) };
}

/** Candidate management changes: irrigation amounts × ground cover. Soil, crop, location, year and season never change. */
export function candidateScenarios(scenario, model = MODEL) {
  const g = model.grading, irr = [...new Set([...g.irrigationOptions, scenario.irrigation])], list = [];
  for (const irrigation of irr) for (const cover of g.coverOptions) {
    if (irrigation === scenario.irrigation && cover === scenario.cover) continue;
    list.push({ ...scenario, irrigation, cover });
  }
  return list;
}

export const PRIORITIES = {
  balanced: 'Balanced',
  shortage: 'Avoid crop water shortage',
  water: 'Save irrigation water',
};

/**
 * Score, start-water sensitivity, biggest problem, and one tested option per farmer priority.
 * Options are full reruns on identical weather. The balanced option may never materially worsen
 * modeled crop-water shortage (config guardrail); a water-saving option that does is labelled.
 */
export function analyzeFarm(weather, scenario, model = MODEL) {
  const g = model.grading, before = gradeScenario(weather, scenario, model);
  if (before.score.status !== 'SCORED') return { status: 'NOT_SCORED', before, reasons: before.score.reasons };
  const range = startWaterRange(weather, scenario, model);
  if (range && range.spread >= g.startWater.withholdPoints) return { status: 'NOT_SCORED', before, range,
    reasons: [`The score would range from ${range.min} to ${range.max} depending on the assumed January 1 soil water, so it is withheld.`] };
  const sc = before.score, bm = sc.metrics;
  const worst = GROUP_IDS.reduce((a, id) => sc.groups[id].lost > sc.groups[a].lost ? id : a, GROUP_IDS[0]);
  const problem = sc.groups[worst].lost >= g.minProblemPoints ? { ...describeProblem(worst, bm, scenario), pointsLost: sc.groups[worst].lost } : null;
  // Rerun every candidate on identical weather.
  const tried = candidateScenarios(scenario, model).map(s => {
    const after = gradeScenario(weather, s, model);
    if (after.score.status !== 'SCORED') return null;
    const changes = (s.irrigation !== scenario.irrigation) + (s.cover !== scenario.cover);
    return { scenario: s, after, changes, gain: after.score.total - sc.total, shortage: shortageChange(bm, after.score.metrics, model),
      helpsProblem: problem ? sc.groups[problem.id].lost - after.score.groups[problem.id].lost >= 1 : false };
  }).filter(Boolean);
  // Robust: the claimed score change must hold with 0%, 50% and 100% starting water and under a
  // dry-winter bound in which no precipitation on freezing days reaches the soil (snow is not modeled).
  const dryWinter = dryWinterWeather(weather), winterBase = gradeScenario(dryWinter, scenario, model).score.total;
  const robust = (t, minGain) => (!range || g.startWater.fractions.every((f, k) => {
    const a = gradeScenario(weather, t.scenario, cloneWithStart(model, f)).score.total;
    return a !== null && a - range.totals[k] >= minGain;
  })) && (winterBase === null || (gradeScenario(dryWinter, t.scenario, model).score.total ?? -1e9) - winterBase >= minGain);
  const dIrr = t => Math.abs(t.scenario.irrigation - scenario.irrigation);
  const first = (list, minGain) => list.find(t => robust(t, minGain)) ?? null;
  // Balanced: the largest robust gain that never materially worsens shortage. Within 2 points of that
  // gain, prefer a change that fixes the biggest problem, then fewer settings changed.
  const ok = tried.filter(t => t.gain >= g.minMeaningfulGain && !t.shortage.material).sort((a, b) => b.gain - a.gain || dIrr(a) - dIrr(b));
  const top = first(ok.slice(0, 8), g.minMeaningfulGain);
  const near = top ? ok.filter(t => t.gain >= top.gain - 2).sort((a, b) => b.helpsProblem - a.helpsProblem || a.changes - b.changes || b.gain - a.gain || dIrr(a) - dIrr(b)) : [];
  const balanced = top ? first(near.slice(0, 8), g.minMeaningfulGain) ?? top : null;
  // Avoid shortage: no worsening at all; least stress, then most demand met, then score.
  const strict = tried.filter(t => t.shortage.none && (t.shortage.stress < 0 || t.shortage.met > .005 || t.gain >= g.minMeaningfulGain) && t.gain >= 0);
  const shortage = first(strict.sort((a, b) => a.after.score.metrics.stressDays - b.after.score.metrics.stressDays
    || b.after.score.metrics.demandMet - a.after.score.metrics.demandMet || b.gain - a.gain || dIrr(a) - dIrr(b)).slice(0, 6), 0);
  // Save water: the largest irrigation cut that does not lower the score; shortage effects are labelled.
  const water = scenario.irrigation > 0 ? first(tried.filter(t => t.scenario.irrigation < scenario.irrigation && t.gain >= 0)
    .sort((a, b) => a.scenario.irrigation - b.scenario.irrigation || b.gain - a.gain || a.changes - b.changes).slice(0, 6), 0) : null;
  const pack = t => t && { ...describeChange(scenario, t.scenario), scenario: t.scenario, totalBefore: sc.total, totalAfter: t.after.score.total,
    gain: t.gain, helpsProblem: t.helpsProblem, shortage: t.shortage, tradeoffs: tradeoffs(before, t.after, model),
    metrics: { stressDays: t.after.score.metrics.stressDays, demandMet: t.after.score.metrics.demandMet, irrigation: t.after.score.metrics.irrigation, drainage: t.after.score.metrics.drainage } };
  const options = { balanced: pack(balanced), shortage: pack(shortage), water: pack(water) };
  return {
    status: 'SCORED', before, score: sc.total, range, startWaterNote: range && range.spread >= g.startWater.notePoints,
    current: { stressDays: bm.stressDays, demandMet: bm.demandMet, irrigation: bm.irrigation, drainage: bm.drainage },
    problem, improvement: options.balanced, options, candidatesTested: candidateScenarios(scenario, model).length,
    investigate: problem ? INVESTIGATE[problem.id] : null,
  };
}
