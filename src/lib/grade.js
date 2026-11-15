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
      const c = credit(m[fid], f);
      factors[fid] = { value: m[fid], credit: c, weight: f.weight };
      if (c !== null) { earned += f.weight * c; possible += f.weight; }
    }
    // Irrigation does not apply without irrigation; heavy-day exposure does not apply without heavy days.
    const applicable = id === 'irrigation' ? m.irrigation > 0 : possible > 0;
    groups[id] = { id, label: G[id].label, applicable, max: G[id].points, factors,
      points: applicable ? G[id].points * earned / possible : null };
  }
  if (!groups.cropWater.applicable || !groups.soilCover.applicable) return { status: 'NOT_SCORED', total: null, reasons: ['Crop-season demand or non-freezing precipitation could not be calculated.'] };
  const live = GROUP_IDS.filter(id => groups[id].applicable), scale = 100 / live.reduce((t, id) => t + groups[id].max, 0);
  for (const id of live) groups[id].lost = (groups[id].max - groups[id].points) * scale; // on the 100-point basis
  const exact = live.reduce((t, id) => t + groups[id].points, 0) * scale;
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
    text: `From ${season}, NASA weather created ${fmt(m.demand)} mm of crop water demand, but the modeled soil supplied ${fmt(m.supplied)} mm (${pct(m.demandMet)}). The crop was below the stress line on ${m.stressDays} of ${m.cropDays} days${m.longestStress >= 3 ? `, including a ${m.longestStress}-day dry spell` : ''}.`,
    evidence: [`Crop demand from FAO-56 reference ET (${fmt(m.seasonET0)} mm) driven by NASA temperature, humidity, sunlight, wind and pressure`,
      `Water in during the season: ${fmt(m.seasonRain)} mm NASA precipitation + ${fmt(m.irrigation)} mm irrigation`,
      m.worstPeriod !== null ? `Worst 14 days: the soil met ${pct(m.worstPeriod)} of demand, starting ${m.worstPeriodStart}` : null].filter(Boolean),
  };
  if (id === 'irrigation') {
    const draining = m.irrExtraDrainage >= m.irrLeftInSoil;
    return {
      id, title: draining ? 'Excessive irrigation' : 'Irrigation the crop did not use',
      text: draining
        ? `${fmt(m.irrExtraDrainage)} of the ${fmt(m.irrigation)} mm you irrigated (${pct(m.drainShare)}) drained below the 0.6 m modeled soil layer. Irrigation often arrived when the soil was already full.`
        : `Only ${pct(m.cropUse)} of the ${fmt(m.irrigation)} mm you irrigated was used by the crop. ${fmt(m.irrLeftInSoil)} mm was still in the soil at harvest and ${fmt(m.irrExtraDrainage)} mm drained away.`,
      evidence: [`Irrigation used by the crop: ${fmt(m.irrExtraET)} mm · drained: ${fmt(m.irrExtraDrainage)} mm · left in soil at harvest: ${fmt(m.irrLeftInSoil)} mm`,
        `Compared with the same year and weather with no irrigation`],
    };
  }
  return {
    id, title: 'Rain on exposed soil',
    text: `${fmt(m.liquidExposed)} of ${fmt(m.liquidRain)} mm of non-freezing NASA precipitation (${pct(m.exposure)}) fell on exposed soil, ${fmt(m.offSeasonLiquidExposed)} mm of it outside the crop season with ${COVER_TEXT[m.cover]}.${m.heavyDays ? ` That includes ${m.heavyDays} heavier day${m.heavyDays > 1 ? 's' : ''} (12.7 mm or more).` : ''}`,
    evidence: ['Assumed cover fractions. An exposure indicator, not measured erosion or soil health',
      `${fmt(m.freezingPrecip)} mm fell on freezing days and is left out because snow is not modeled`],
  };
}

const INVESTIGATE = {
  cropWater: 'Things you could investigate: irrigation timing (this model spreads irrigation evenly), local planting dates with an extension agronomist, or a crop with lower water demand.',
  irrigation: 'Things you could investigate: irrigation scheduling based on soil moisture. This model spreads irrigation evenly across the season, so it cannot test timing.',
  soilCover: 'Things you could investigate: local residue and cover-crop practices. The cover fractions here are generic assumptions.',
};

function tradeoffs(before, after) {
  const b = before.score.metrics, a = after.score.metrics, list = [];
  if (a.stressDays > b.stressDays) list.push(`${a.stressDays - b.stressDays} more crop-season days below the stress line (${b.stressDays} → ${a.stressDays}).`);
  if (a.irrigation > b.irrigation) list.push(`Uses ${fmt(a.irrigation - b.irrigation)} mm more irrigation water.`);
  if (a.drainage > b.drainage + .5) list.push(`${fmt(a.drainage - b.drainage)} mm more water drains below the modeled layer over the year.`);
  if (a.exposure > b.exposure + .005) list.push(`More rain falls on exposed soil (${pct(b.exposure)} → ${pct(a.exposure)}).`);
  const off = r => r.days.reduce((t, d) => d.active ? t : t + d.actualET, 0);
  if (after.result.scenario.cover === 'cover' && off(after.result) > off(before.result) + .5) list.push(`The cover crop uses ${fmt(off(after.result) - off(before.result))} mm more off-season water.`);
  return list;
}

function describeChange(from, to) {
  const parts = [], why = [];
  if (to.irrigation !== from.irrigation) {
    parts.push(to.irrigation === 0 ? `Stop irrigating (currently ${from.irrigation} mm/week)` : `${to.irrigation < from.irrigation ? 'Reduce' : 'Increase'} irrigation from ${from.irrigation} to ${to.irrigation} mm/week`);
    why.push(to.irrigation < from.irrigation ? 'less water drains away when NASA precipitation has already filled the soil' : 'more water reaches the crop during dry periods');
  }
  if (to.cover !== from.cover) {
    parts.push(`switch ground cover between crops to ${COVER_TEXT[to.cover]}`);
    why.push(to.cover === 'bare' ? 'bare ground uses less off-season water' : 'more of the soil surface is protected from off-season rain');
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

/**
 * Full analysis for the scenario on screen: score, start-water sensitivity, biggest problem and the
 * best improvement actually found by reruns. Problem and improvement are reported separately.
 */
export function analyzeFarm(weather, scenario, model = MODEL) {
  const g = model.grading, before = gradeScenario(weather, scenario, model);
  if (before.score.status !== 'SCORED') return { status: 'NOT_SCORED', before, reasons: before.score.reasons };
  const range = startWaterRange(weather, scenario, model);
  if (range && range.spread >= g.startWater.withholdPoints) return { status: 'NOT_SCORED', before, range,
    reasons: [`The score would range from ${range.min} to ${range.max} depending on the assumed January 1 soil water, so it is withheld.`] };
  const sc = before.score, live = GROUP_IDS.filter(id => sc.groups[id].applicable);
  const worst = live.reduce((a, id) => sc.groups[id].lost > sc.groups[a].lost ? id : a, live[0]);
  const problem = sc.groups[worst].lost >= g.minProblemPoints ? { ...describeProblem(worst, sc.metrics, scenario), pointsLost: sc.groups[worst].lost } : null;
  // Rerun every candidate on identical weather.
  const tried = candidateScenarios(scenario, model).map(s => {
    const after = gradeScenario(weather, s, model);
    if (after.score.status !== 'SCORED') return null;
    const changes = (s.irrigation !== scenario.irrigation) + (s.cover !== scenario.cover);
    const lostAfter = problem && after.score.groups[problem.id].applicable ? after.score.groups[problem.id].lost : 0;
    return { scenario: s, after, changes, gain: after.score.total - sc.total, helpsProblem: problem ? sc.groups[problem.id].lost - lostAfter >= 1 : false };
  }).filter(t => t && t.gain >= g.minMeaningfulGain);
  // Fix the biggest problem first, with one setting where possible; combinations only if no single
  // change helps. Within a pool: largest gain, then the smallest irrigation change.
  const order = (a, b) => b.gain - a.gain || Math.abs(a.scenario.irrigation - scenario.irrigation) - Math.abs(b.scenario.irrigation - scenario.irrigation);
  const pick = pool => [...pool].sort(order);
  // Robust: the gain must hold with 0%, 50% and 100% assumed starting water, and under a dry-winter
  // bound in which no precipitation on freezing days reaches the soil (snow is not modeled).
  const dryWinter = dryWinterWeather(weather), winterBase = gradeScenario(dryWinter, scenario, model).score.total;
  const robust = t => (!range || g.startWater.fractions.every((f, k) => {
    const m2 = cloneWithStart(model, f), a = gradeScenario(weather, t.scenario, m2).score.total;
    return a !== null && a > range.totals[k];
  })) && (winterBase === null || (gradeScenario(dryWinter, t.scenario, model).score.total ?? -1) > winterBase);
  let chosen = null;
  const pools = [t => t.helpsProblem && t.changes === 1, t => t.helpsProblem, t => t.changes === 1, () => true];
  for (const pool of pools.map(f => tried.filter(f))) {
    for (const t of pick(pool).slice(0, 6)) if (robust(t)) { chosen = t; break; }
    if (chosen) break;
  }
  const improvement = chosen && { ...describeChange(scenario, chosen.scenario), scenario: chosen.scenario,
    totalBefore: sc.total, totalAfter: chosen.after.score.total, gain: chosen.gain,
    helpsProblem: chosen.helpsProblem, tradeoffs: tradeoffs(before, chosen.after) };
  return {
    status: 'SCORED', before, score: sc.total, range, startWaterNote: range && range.spread >= g.startWater.notePoints,
    problem, improvement, candidatesTested: candidateScenarios(scenario, model).length,
    investigate: !improvement && problem ? INVESTIGATE[problem.id] : null,
  };
}
