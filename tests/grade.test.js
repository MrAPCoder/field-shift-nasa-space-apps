import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODEL, runSoilSimulation, monthlyBalance } from '../src/lib/soilWater.js';
import { GROUP_IDS, credit, seasonIssues, metrics, scoreResult, gradeScenario, startWaterRange, candidateScenarios, analyzeFarm, dryWinterWeather } from '../src/lib/grade.js';

const load = id => JSON.parse(readFileSync(new URL(`../public/data/${id}/soil-weather.json`, import.meta.url)));
const W = { palouse: load('palouse'), yakima: load('yakima'), skagit: load('skagit') };
const base = { location: 'palouse', year: 2023, crop: 'spring_wheat', soil: 'loamy', irrigation: 0, planting: 4, harvest: 8, cover: 'bare' };
const G = MODEL.grading;
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);
// SYNTHETIC: altered copies of real archives, used only inside these tests.
const synthetic = (id, edit) => { const w = structuredClone(W[id]); edit(w.series); return w; };

test('rubric: eight factors in three groups, group weights add up, total is 100, not equal weights', () => {
  assert.deepEqual(Object.keys(G.groups), GROUP_IDS);
  const factors = GROUP_IDS.flatMap(id => Object.keys(G.groups[id].factors));
  assert.equal(factors.length, 7, 'seven scored factors; drainage (factor 5) is the reported complement of irrigation use');
  for (const id of GROUP_IDS) assert.equal(Object.values(G.groups[id].factors).reduce((t, f) => t + f.weight, 0), G.groups[id].points);
  assert.equal(GROUP_IDS.reduce((t, id) => t + G.groups[id].points, 0), 100);
  assert.ok(new Set(factors.map(f => GROUP_IDS.map(g => G.groups[g].factors[f]?.weight).find(Boolean))).size > 1, 'weights differ');
  assert.match(G.note, /provisional/); assert.match(G.note, /not a validated assessment/);
});

test('credit: linear in either direction, clamped, null when not finite', () => {
  assert.equal(credit(.95, { fullAt: .95, zeroAt: .5 }), 1); assert.equal(credit(.5, { fullAt: .95, zeroAt: .5 }), 0);
  near(credit(.725, { fullAt: .95, zeroAt: .5 }), .5); assert.equal(credit(2, { fullAt: .95, zeroAt: .5 }), 1);
  assert.equal(credit(7, { fullAt: 7, zeroAt: 45 }), 1); assert.equal(credit(45, { fullAt: 7, zeroAt: 45 }), 0); near(credit(26, { fullAt: 7, zeroAt: 45 }), .5);
  assert.equal(credit(NaN, { fullAt: 1, zeroAt: 0 }), null); assert.equal(credit(null, { fullAt: 1, zeroAt: 0 }), null);
});

test('all farms × years × crops × soils × irrigation × cover: valid scores 0–100, groups within maxima', () => {
  let scored = 0;
  for (const location of Object.keys(W)) for (const year of [2021, 2022, 2023, 2024, 2025]) for (const crop of Object.keys(MODEL.crops))
    for (const soil of Object.keys(MODEL.soils)) for (const irrigation of [0, 25, 80]) for (const cover of ['bare', 'residue', 'cover']) {
      const { score } = gradeScenario(W[location], { ...base, location, year, crop, soil, irrigation, cover });
      if (score.status !== 'SCORED') { assert.equal(score.total, null); assert.ok(score.reasons.length); continue; }
      scored++;
      assert.ok(Number.isInteger(score.total) && score.total >= 0 && score.total <= 100);
      let sum = 0, possible = 0;
      for (const id of GROUP_IDS) { const gr = score.groups[id];
        if (!gr.applicable) { assert.equal(gr.points, null); continue; }
        assert.ok(gr.points >= -1e-9 && gr.points <= gr.max + 1e-9); sum += gr.points; possible += gr.max; }
      near(score.exact, 100 * sum / possible, 1e-9);
      assert.equal(score.groups.irrigation.applicable, irrigation > 0);
    }
  assert.ok(scored > 1000, `${scored} scored`);
});

test('no double counting: irrigation splits exactly into crop use + drainage + water left; drainage is not scored twice', () => {
  for (const [id, s] of [['palouse', { ...base, irrigation: 40 }], ['yakima', { ...base, location: 'yakima', crop: 'potato', planting: 5, harvest: 9, irrigation: 30 }], ['skagit', { ...base, location: 'skagit', soil: 'sandy', irrigation: 15 }]]) {
    const g = gradeScenario(W[id], s), m = g.score.metrics;
    near(m.irrExtraET + m.irrExtraDrainage + m.irrLeftInSoil, m.irrigation, 1e-6);
    near(g.score.groups.irrigation.points, 30 * credit(m.cropUse, G.groups.irrigation.factors.cropUse), 1e-9);
    assert.deepEqual(Object.keys(g.score.groups.irrigation.factors), ['cropUse']);
  }
  // A single severe shortage can cost at most the capped crop-water group.
  const dry = gradeScenario(W.yakima, { ...base, location: 'yakima', crop: 'potato', planting: 5, harvest: 9 }).score;
  assert.ok(dry.groups.cropWater.lost <= 100 * 50 / 70 + 1e-9);
});

test('metrics come from the daily records; freezing-day precipitation is excluded from exposure; GWETROOT is never used', () => {
  const r = runSoilSimulation(W.palouse, base), m = metrics(r, null), crop = r.days.filter(d => d.active);
  near(m.demandMet, crop.reduce((t, d) => t + d.actualET, 0) / crop.reduce((t, d) => t + d.demand, 0));
  assert.equal(m.stressDays, crop.filter(d => d.dry).length);
  const liquid = r.days.filter(d => !d.freezing);
  near(m.exposure, liquid.reduce((t, d) => t + d.exposedRain, 0) / liquid.reduce((t, d) => t + d.rain, 0));
  assert.ok(m.freezingPrecip > 0);
  const noWet = synthetic('palouse', s => s.GWETROOT.fill(null));
  assert.deepEqual(gradeScenario(noWet, base).score.total, gradeScenario(W.palouse, base).score.total);
});

test('loophole: zero irrigation with a severe shortage scores low, not high', () => {
  for (const [id, s] of [['palouse', base], ['yakima', { ...base, location: 'yakima', crop: 'potato', planting: 5, harvest: 9 }]]) {
    const sc = gradeScenario(W[id], s).score;
    assert.equal(sc.groups.irrigation.applicable, false);
    assert.ok(sc.metrics.demandMet < .6 && sc.total < 30, `${id}: ${sc.total}`);
  }
});

test('loophole: excessive irrigation never reaches 100 and scores below a moderate amount', () => {
  for (const id of Object.keys(W)) {
    const s = { ...base, location: id }, heavy = gradeScenario(W[id], { ...s, irrigation: 200, cover: 'residue' }).score;
    assert.ok(heavy.total < 100); assert.ok(heavy.groups.irrigation.points < 5);
    const best = Math.max(...G.irrigationOptions.map(i => gradeScenario(W[id], { ...s, irrigation: i, cover: 'residue' }).score.total));
    assert.ok(best > heavy.total, `${id}: moderate ${best} vs heavy ${heavy.total}`);
  }
});

test('loophole: unrealistic seasons are not scored (New Year, too short, mostly freezing precipitation)', () => {
  const cases = [[{ planting: 10, harvest: 7 }, /crosses New Year/], [{ planting: 6, harvest: 7 }, /shorter than 3 months/], [{ planting: 1, harvest: 4 }, /0 °C/], [{ planting: 11, harvest: 12 }, /shorter/]];
  for (const [season, why] of cases) {
    const g = gradeScenario(W.palouse, { ...base, ...season });
    assert.equal(g.score.status, 'NOT_SCORED'); assert.equal(g.score.total, null);
    assert.ok(g.score.reasons.some(r => why.test(r)), JSON.stringify(g.score.reasons));
    assert.ok(g.score.metrics, 'raw metrics remain for display');
    assert.equal(analyzeFarm(W.palouse, { ...base, ...season }).status, 'NOT_SCORED');
  }
  // An all-freezing synthetic year is never scored.
  const frozen = synthetic('palouse', s => s.T2M_MIN.forEach((v, i) => { s.T2M_MIN[i] = Math.min(v, 0, s.T2M_MAX[i]); }));
  assert.match(seasonIssues(runSoilSimulation(frozen, { ...base, irrigation: 0 })).join(' '), /0 °C/);
});

test('loophole: ground cover is not free; a live cover crop can lower crop water supply and the cost is reported', () => {
  const s = { ...base, location: 'yakima', irrigation: 15, year: 2021 };
  const bare = gradeScenario(W.yakima, s).score, cover = gradeScenario(W.yakima, { ...s, cover: 'cover' }).score;
  assert.ok(cover.groups.cropWater.points < bare.groups.cropWater.points, 'off-season cover water use reduces crop-season supply');
  assert.ok(cover.metrics.exposure < bare.metrics.exposure);
});

test('missing evidence → "Not scored": failed run, missing pair, mismatched weather, missing forcing', () => {
  assert.equal(scoreResult({ status: 'unavailable', reason: 'x' }).total, null);
  const r = runSoilSimulation(W.palouse, { ...base, irrigation: 20 });
  assert.equal(scoreResult(r, null).status, 'NOT_SCORED');
  assert.equal(scoreResult(r, runSoilSimulation(W.yakima, { ...base, location: 'yakima' })).status, 'NOT_SCORED');
  assert.equal(scoreResult(r, runSoilSimulation(W.palouse, { ...base, cover: 'residue' })).status, 'NOT_SCORED', 'pair must differ only in irrigation');
  const broken = synthetic('palouse', s => { s.RH2M[Date.UTC(2023, 5, 1) / 864e5 - Date.parse(W.palouse.start) / 864e5] = null; });
  assert.equal(analyzeFarm(broken, base).status, 'NOT_SCORED');
});

test('starting water: range is computed, a large spread withholds the score', () => {
  const r = startWaterRange(W.palouse, base);
  assert.equal(r.totals.length, 3); assert.equal(r.totals[1], gradeScenario(W.palouse, base).score.total);
  const strict = structuredClone(MODEL); strict.grading.startWater.withholdPoints = 0;
  const a = analyzeFarm(W.palouse, base, strict);
  assert.equal(a.status, 'NOT_SCORED'); assert.match(a.reasons[0], /assumed January 1 soil water/);
});

test('biggest problem: largest points lost, explained with NASA-driven model results', () => {
  const a = analyzeFarm(W.palouse, base), sc = a.before.score;
  const live = GROUP_IDS.filter(id => sc.groups[id].applicable), worst = live.reduce((x, id) => sc.groups[id].lost > sc.groups[x].lost ? id : x);
  assert.equal(a.problem.id, worst); assert.equal(a.problem.title, 'Crop water shortage');
  assert.match(a.problem.text, /NASA weather created 487 mm of crop water demand/);
  const d = analyzeFarm(W.palouse, { ...base, irrigation: 40 });
  assert.equal(d.problem.title, 'Excessive irrigation'); assert.match(d.problem.text, /drained below the 0\.6 m modeled soil layer/);
  // Deterministic.
  assert.deepEqual(JSON.parse(JSON.stringify(analyzeFarm(W.palouse, base).improvement)), JSON.parse(JSON.stringify(a.improvement)));
});

test('problem is still named when no tested change helps; nothing positive is invented', () => {
  const none = structuredClone(MODEL); none.grading.irrigationOptions = [0]; none.grading.coverOptions = ['bare'];
  const a = analyzeFarm(W.palouse, base, none);
  assert.equal(a.problem.title, 'Crop water shortage'); assert.equal(a.improvement, null);
  assert.match(a.investigate, /could investigate/);
});

test('recommendations are real reruns on identical weather, location, soil, crop, year and season; never planting dates or soil', () => {
  const scenarios = [base, { ...base, irrigation: 40 }, { ...base, irrigation: 20, cover: 'residue' }, { ...base, location: 'yakima', crop: 'potato', planting: 5, harvest: 9, irrigation: 30 }, { ...base, location: 'skagit', irrigation: 30 }];
  for (const s of scenarios) {
    for (const c of candidateScenarios(s)) for (const k of ['location', 'year', 'crop', 'soil', 'planting', 'harvest']) assert.equal(c[k], s[k]);
    const a = analyzeFarm(W[s.location], s), imp = a.improvement;
    if (!imp) continue;
    const rerun = gradeScenario(W[s.location], imp.scenario);
    assert.equal(rerun.result.weatherKey, a.before.result.weatherKey, 'same NASA weather');
    assert.equal(imp.totalBefore, a.score); assert.equal(imp.totalAfter, rerun.score.total); assert.equal(imp.gain, imp.totalAfter - imp.totalBefore);
    assert.ok(imp.gain >= G.minMeaningfulGain);
    // Robust to the starting-water assumption and to the dry-winter bound.
    for (const f of G.startWater.fractions) { const m = structuredClone(MODEL); m.assumptions.initialAvailableFraction = f;
      assert.ok(gradeScenario(W[s.location], imp.scenario, m).score.total > gradeScenario(W[s.location], s, m).score.total); }
    const dw = dryWinterWeather(W[s.location]);
    assert.ok(gradeScenario(dw, imp.scenario).score.total > gradeScenario(dw, s).score.total);
    for (const m of monthlyBalance(rerun.result)) assert.ok(Math.abs(m.residual) < 1e-9);
  }
});

test('recommendations prefer fixing the biggest problem with one setting; tradeoffs are listed', () => {
  const a = analyzeFarm(W.palouse, base);
  assert.equal(a.improvement.helpsProblem, true); assert.match(a.improvement.action, /^Increase irrigation from 0 to \d+ mm\/week$/);
  assert.ok(a.improvement.tradeoffs.some(t => /more irrigation water/.test(t)));
  const d = analyzeFarm(W.palouse, { ...base, irrigation: 40 });
  assert.match(d.improvement.action, /^Reduce irrigation from 40 to/); assert.ok(d.improvement.tradeoffs.some(t => /more crop-season days below the stress line/.test(t)));
  // When the best change does not fix the named problem, it is labelled as such.
  const o = analyzeFarm(W.palouse, { ...base, irrigation: 20, cover: 'residue' });
  assert.equal(o.problem.title, 'Excessive irrigation'); assert.equal(o.improvement.helpsProblem, false);
});

test('apply then undo: the applied scenario scores exactly as predicted; the original is unchanged', () => {
  const a = analyzeFarm(W.palouse, { ...base, irrigation: 40 });
  assert.equal(analyzeFarm(W.palouse, a.improvement.scenario).score, a.improvement.totalAfter);
  assert.equal(analyzeFarm(W.palouse, { ...base, irrigation: 40 }).score, a.improvement.totalBefore);
});

test('audit: storage carries over between days and months; leap years and month boundaries are exact', () => {
  for (const id of Object.keys(W)) for (const year of [2021, 2024]) {
    const r = runSoilSimulation(W[id], { ...base, location: id, year, irrigation: 25 });
    assert.equal(r.days.length, year === 2024 ? 366 : 365);
    const months = monthlyBalance(r);
    near(months[0].start, r.initialWater);
    for (let m = 1; m < 12; m++) { near(months[m].start, months[m - 1].end); assert.equal(r.days[months[m].first].date.slice(5, 10), `${String(m + 1).padStart(2, '0')}-01`); }
    near(months[11].end, r.summary.finalWater);
    assert.equal(months[1].days, year === 2024 ? 29 : 28);
  }
});

test('Palouse demo: labelled illustrative, seasonal, and the score story is calculated', () => {
  const d = MODEL.demo;
  assert.match(d.status, /illustrative/); assert.ok(d.planting < d.harvest);
  const s = { location: d.location, crop: d.crop, soil: d.soil, planting: d.planting, harvest: d.harvest, cover: d.cover, year: 2023 };
  const none = gradeScenario(W.palouse, { ...s, irrigation: 0 }).score, irr = gradeScenario(W.palouse, { ...s, irrigation: d.illustrativeIrrigation }).score;
  assert.ok(irr.metrics.stressDays < none.metrics.stressDays); assert.ok(irr.total > none.total);
  assert.ok(irr.metrics.drainShare > .3, 'the illustrative amount visibly overfills the soil');
});
