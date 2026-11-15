import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODEL, runSoilSimulation, monthlyBalance } from '../src/lib/soilWater.js';
import { CATEGORY_IDS, categoryPoints, letterGrade, scoreResult, gradeScenario, candidateChanges, analyzeWeaknesses } from '../src/lib/grade.js';

const load = id => JSON.parse(readFileSync(new URL(`../public/data/${id}/soil-weather.json`, import.meta.url)));
const W = { palouse: load('palouse'), yakima: load('yakima'), skagit: load('skagit') };
const base = { location: 'palouse', year: 2023, crop: 'spring_wheat', soil: 'loamy', irrigation: 0, planting: 4, harvest: 8, cover: 'bare' };
const G = MODEL.grading;

test('grading config: three categories summing to 100, targets inside [0,1]', () => {
  assert.deepEqual(Object.keys(G.categories), CATEGORY_IDS);
  assert.equal(CATEGORY_IDS.reduce((t, id) => t + G.categories[id].max, 0), 100);
  for (const id of CATEGORY_IDS) { const c = G.categories[id]; assert.ok(c.fullAt >= 0 && c.fullAt <= 1 && c.zeroAt >= 0 && c.zeroAt <= 1 && c.fullAt !== c.zeroAt); }
  assert.match(G.note, /not a perfect real farm/);
});

test('category points: linear between zero point and target, clamped, whole numbers; non-finite is null', () => {
  const c = { max: 35, fullAt: .1, zeroAt: .6 };
  assert.equal(categoryPoints(0, c), 35); assert.equal(categoryPoints(.1, c), 35);
  assert.equal(categoryPoints(.35, c), 18); assert.equal(categoryPoints(.6, c), 0); assert.equal(categoryPoints(1, c), 0);
  assert.equal(categoryPoints(NaN, c), null); assert.equal(categoryPoints(null, c), null);
  const up = { max: 35, fullAt: .9, zeroAt: .5 };
  assert.equal(categoryPoints(.5, up), 0); assert.equal(categoryPoints(.75, up), 22); assert.equal(categoryPoints(.95, up), 35);
  assert.deepEqual([100, 90, 89, 80, 70, 60, 59, 0].map(t => letterGrade(t)), ['A', 'A', 'B', 'B', 'C', 'D', 'F', 'F']);
});

test('all farms × years × crops × irrigation × cover: categories within maxima, totals 0–100 and equal to the sum', () => {
  let n = 0;
  for (const location of Object.keys(W)) for (const year of [2021, 2022, 2023, 2024, 2025]) for (const crop of Object.keys(MODEL.crops))
    for (const irrigation of [0, 20, 60]) for (const cover of ['bare', 'residue', 'cover']) {
      const { score } = gradeScenario(W[location], { ...base, location, year, crop, irrigation, cover });
      assert.equal(score.status, 'SCORED');
      for (const id of CATEGORY_IDS) {
        const c = score.categories[id];
        assert.ok(Number.isInteger(c.points) && c.points >= 0 && c.points <= c.max, `${id} ${c.points}`);
        assert.equal(c.lost, c.max - c.points);
      }
      assert.ok(score.total >= 0 && score.total <= 100);
      assert.equal(score.total, CATEGORY_IDS.reduce((t, id) => t + score.categories[id].points, 0));
      assert.equal(score.grade, letterGrade(score.total)); n++;
    }
  assert.equal(n, 405);
});

test('category metrics are read from the daily model records', () => {
  const s = { ...base, irrigation: 40 };
  const r = runSoilSimulation(W.palouse, s), dry = runSoilSimulation(W.palouse, { ...s, irrigation: 0 });
  const { categories: c } = scoreResult(r, dry);
  const active = r.days.filter(d => d.active), sum = (a, k) => a.reduce((t, d) => t + d[k], 0);
  assert.ok(Math.abs(c.irrigationEfficiency.fraction - (r.summary.drainage - dry.summary.drainage) / r.summary.irrigation) < 1e-12);
  assert.ok(Math.abs(c.cropWaterSupply.fraction - sum(active, 'actualET') / sum(active, 'demand')) < 1e-12);
  assert.ok(Math.abs(c.rainExposure.fraction - r.summary.exposedRain / r.summary.rain) < 1e-12);
  // No irrigation: nothing applied, nothing drained away. Crop supply still loses points.
  const none = gradeScenario(W.palouse, base).score;
  assert.equal(none.categories.irrigationEfficiency.points, 35); assert.equal(none.categories.irrigationEfficiency.noIrrigation, true);
  assert.equal(none.categories.cropWaterSupply.points, 0);
});

test('missing evidence is "Not scored", never a guessed total', () => {
  const failed = scoreResult({ status: 'unavailable', reason: 'Missing RH2M on 2023-02-01.' });
  assert.equal(failed.status, 'NOT_SCORED'); assert.equal(failed.total, null); assert.equal(failed.grade, null);
  for (const id of CATEGORY_IDS) assert.equal(failed.categories[id].points, null);
  // Irrigated run without its paired no-irrigation run cannot attribute drainage.
  const r = runSoilSimulation(W.palouse, { ...base, irrigation: 20 });
  const partial = scoreResult(r, null);
  assert.equal(partial.categories.irrigationEfficiency.status, 'NOT_SCORED');
  assert.equal(partial.categories.cropWaterSupply.status, 'SCORED');
  assert.equal(partial.total, null); assert.match(partial.reasons[0], /Irrigation Efficiency/);
  // A pair from different weather is refused.
  const other = runSoilSimulation(W.yakima, { ...base, location: 'yakima', irrigation: 0 });
  assert.equal(scoreResult(r, other).total, null);
  // Missing forcing in the archive: unavailable run, unscored.
  const broken = structuredClone(W.palouse); broken.series.RH2M[Date.UTC(2023, 5, 1) / 864e5 - Date.parse(broken.start) / 864e5] = null;
  const g = gradeScenario(broken, base);
  assert.equal(g.result.status, 'unavailable'); assert.equal(g.score.status, 'NOT_SCORED');
  assert.equal(analyzeWeaknesses(broken, base).status, 'NOT_SCORED');
});

test('candidate changes never touch soil, location, crop or year; season shifts keep length', () => {
  for (const s of [base, { ...base, irrigation: 40, cover: 'residue' }, { ...base, planting: 10, harvest: 7 }, { ...base, planting: 1, harvest: 12 }]) {
    for (const c of candidateChanges(s)) {
      for (const k of ['soil', 'location', 'crop', 'year']) assert.equal(c.scenario[k], s[k]);
      assert.notDeepEqual(c.scenario, s);
      if (c.setting === 'season') { assert.equal(c.scenario.harvest - c.scenario.planting, s.harvest - s.planting); assert.ok(c.scenario.planting >= 1 && c.scenario.harvest <= 12); }
    }
  }
  assert.equal(candidateChanges({ ...base, planting: 10, harvest: 7 }).filter(c => c.setting === 'season').length, 0, 'New-Year seasons are not shifted');
});

test('biggest weakness: largest model-supported TOTAL gain, not simply the lowest raw score', () => {
  const a = analyzeWeaknesses(W.palouse, base);
  const crop = a.categories.find(c => c.id === 'cropWaterSupply'), rain = a.categories.find(c => c.id === 'rainExposure');
  assert.ok(crop.lost > rain.lost, 'crop water supply lost more points');
  assert.equal(a.status, 'WEAKNESS'); assert.equal(a.biggest.id, 'rainExposure');
  assert.ok(a.biggest.improvement.totalGain > crop.improvement.totalGain);
  for (const c of a.categories) if (c.meaningful && c.improvement) assert.ok(c.improvement.totalGain <= a.biggest.improvement.totalGain);
  assert.match(a.biggest.why, /491 of 669 mm of NASA precipitation \(73%\) fell on exposed soil/);
  assert.equal(a.biggest.improvement.setting, 'cover'); assert.equal(a.biggest.improvement.value, 'residue');
  // Deterministic: same inputs → identical analysis.
  assert.deepEqual(JSON.parse(JSON.stringify(analyzeWeaknesses(W.palouse, base))), JSON.parse(JSON.stringify(a)));
});

test('every suggested improvement equals an independent rerun on the same weather; displayed changes match', () => {
  const scenarios = [base, { ...base, irrigation: 40 }, { ...base, location: 'yakima', crop: 'potato', planting: 5, harvest: 9 }, { ...base, location: 'skagit', irrigation: 30 }, { ...base, soil: 'sandy', irrigation: 40, year: 2021 }];
  for (const s of scenarios) {
    const a = analyzeWeaknesses(W[s.location], s), before = gradeScenario(W[s.location], s).score;
    assert.equal(a.before.score.total, before.total);
    for (const c of a.categories.filter(c => c.improvement)) {
      const imp = c.improvement, rerun = gradeScenario(W[s.location], imp.scenario);
      assert.equal(rerun.result.weatherKey, a.before.result.weatherKey, 'same NASA weather');
      assert.equal(imp.totalBefore, before.total); assert.equal(imp.totalAfter, rerun.score.total);
      assert.equal(imp.totalGain, rerun.score.total - before.total);
      assert.equal(imp.categoryBefore, before.categories[c.id].points); assert.equal(imp.categoryAfter, rerun.score.categories[c.id].points);
      assert.equal(imp.categoryGain, imp.categoryAfter - imp.categoryBefore); assert.ok(imp.categoryGain > 0);
      assert.equal(imp.gradeAfter, rerun.score.grade); assert.ok(imp.totalGain >= G.minMeaningfulGain);
      for (const id of CATEGORY_IDS) assert.equal(imp.delta[id], rerun.score.categories[id].points - before.categories[id].points);
      // Monthly balances still close for the suggested scenario.
      for (const m of monthlyBalance(rerun.result)) assert.ok(Math.abs(m.residual) < 1e-9);
    }
  }
});

test('advice accounts for tradeoffs', () => {
  const a = analyzeWeaknesses(W.palouse, { ...base, irrigation: 40 });
  const eff = a.categories.find(c => c.id === 'irrigationEfficiency').improvement;
  assert.equal(eff.setting, 'irrigation'); assert.ok(eff.value < 40);
  assert.ok(eff.delta.cropWaterSupply <= 0);
  const r0 = gradeScenario(W.palouse, { ...base, irrigation: 40 }).result, r1 = gradeScenario(W.palouse, eff.scenario).result;
  if (r1.summary.dryDays > r0.summary.dryDays) assert.ok(eff.tradeoffs.some(t => t.includes(`(${r0.summary.dryDays} → ${r1.summary.dryDays})`)));
  for (const id of CATEGORY_IDS) if (eff.delta[id] < 0) assert.ok(eff.tradeoffs.some(t => t.startsWith(G.categories[id].label)));
  // Residue: more drainage is reported as a tradeoff.
  const res = analyzeWeaknesses(W.palouse, base).biggest.improvement;
  assert.ok(res.tradeoffs.some(t => /more water drains below the modeled layer/.test(t)));
  // A live cover crop reports its extra off-season water use.
  const cover = gradeScenario(W.palouse, { ...base, cover: 'cover' }), bare = gradeScenario(W.palouse, base);
  assert.ok(cover.score.categories.rainExposure.points > bare.score.categories.rainExposure.points);
});

test('no meaningful change → says so; every target met → no weakness invented', () => {
  const a = analyzeWeaknesses(W.palouse, { ...base, irrigation: 20, cover: 'residue' });
  assert.equal(a.status, 'NO_SUPPORTED_CHANGE'); assert.equal(a.biggest, null);
  assert.match(a.message, /Irrigation Efficiency lost the most points/);
  const easy = structuredClone(MODEL);
  for (const id of CATEGORY_IDS) Object.assign(easy.grading.categories[id], id === 'cropWaterSupply' ? { fullAt: .01, zeroAt: 0 } : { fullAt: .99, zeroAt: 1 });
  const m = analyzeWeaknesses(W.palouse, base, easy);
  assert.equal(m.before.score.total, 100); assert.equal(m.status, 'MEETS_TARGETS'); assert.equal(m.biggest, null);
  assert.match(m.message, /no meaningful weakness/);
});

test('apply then undo: the applied scenario scores as predicted, the original scenario scores as before', () => {
  const a = analyzeWeaknesses(W.palouse, base), imp = a.biggest.improvement;
  const applied = analyzeWeaknesses(W.palouse, imp.scenario);
  assert.equal(applied.before.score.total, imp.totalAfter);
  assert.equal(applied.before.score.grade, imp.gradeAfter);
  assert.equal(analyzeWeaknesses(W.palouse, base).before.score.total, imp.totalBefore);
});

test('Palouse demo: labelled illustrative, seasonal (not year-round), and the irrigated run overfills storage', () => {
  const d = MODEL.demo;
  assert.match(d.status, /illustrative/); assert.match(d.note, /not an irrigation schedule or recommendation/);
  assert.equal(d.baselineIrrigation, 0); assert.ok(d.illustrativeIrrigation > 0);
  assert.ok(d.planting < d.harvest && d.harvest - d.planting < 11, 'an explicit growing season, not the whole year');
  const s = { location: d.location, crop: d.crop, soil: d.soil, planting: d.planting, harvest: d.harvest, cover: d.cover, year: 2023 };
  const none = runSoilSimulation(W.palouse, { ...s, irrigation: d.baselineIrrigation }), irr = runSoilSimulation(W.palouse, { ...s, irrigation: d.illustrativeIrrigation });
  assert.ok(irr.days.filter(x => !x.active).every(x => x.irrigation === 0), 'irrigation only in the season');
  const overflow = irr.days.filter(x => x.irrigation > 0 && x.drainage > 0);
  assert.ok(overflow.length > 0 && irr.summary.drainage > none.summary.drainage);
  // Drainage only when stored water + rain + irrigation exceeded capacity; the excess is exactly what drained.
  for (const x of overflow) { const k = irr.days.indexOf(x), prev = k ? irr.days[k - 1].water : irr.initialWater;
    assert.ok(Math.abs(prev + x.rain + x.irrigation - x.drainage - irr.capacity) < 1e-9, 'drainage happens only at full storage'); }
});
