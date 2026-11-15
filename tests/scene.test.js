import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODEL, runSoilSimulation, startupSensitivity } from '../src/lib/soilWater.js';
import { FLOW_SCALE, flowWidth, rainClass, soilTone, cropStage, explainDay, sceneFrame, mm } from '../src/lib/scene.js';

const load = id => JSON.parse(readFileSync(new URL(`../public/data/${id}/soil-weather.json`, import.meta.url)));
const palouse = load('palouse');
const scenario = { location: 'palouse', year: 2023, crop: 'spring_wheat', soil: 'loamy', irrigation: 0, planting: 4, harvest: 8, cover: 'bare' };
const run = (s = {}, w = palouse) => runSoilSimulation(w, { ...scenario, ...s });
const darkness = c => c.match(/\d+/g).map(Number).reduce((a, b) => a + b, 0);

test('flow arrows are linear in millimetres, invisible only at zero, capped and labelled above the cap', () => {
  for (const v of [0, -1, null, undefined, NaN, Infinity]) assert.equal(flowWidth(v), 0);
  assert.equal(flowWidth(.01), FLOW_SCALE.minPx);
  assert.equal(flowWidth(10), 10 * FLOW_SCALE.pxPerMm);
  assert.equal(flowWidth(2 * 10), 2 * flowWidth(10));
  assert.equal(flowWidth(80), FLOW_SCALE.capMm * FLOW_SCALE.pxPerMm);
  assert.equal(mm(0), '0.0'); assert.equal(mm(.03), '<0.1'); assert.equal(mm(12.34), '12.3');
});
test('precipitation classes follow the stated thresholds; missing is not "no rain"', () => {
  for (const [v, id] of [[0, 'none'], [.2, 'trace'], [.99, 'trace'], [1, 'light'], [4.99, 'light'], [5, 'moderate'], [14.9, 'moderate'], [15, 'heavy'], [80, 'heavy']]) assert.equal(rainClass(v).id, id, String(v));
  assert.equal(rainClass(null), null);
  assert.equal(rainClass(0).drops, 0);
});
test('soil tone darkens monotonically with calculated water, per soil texture; unknown input stays unknown', () => {
  for (const soil of Object.keys(MODEL.soils)) {
    let last = Infinity;
    for (let p = 0; p <= 100; p += 5) { const d = darkness(soilTone(p, soil)); assert.ok(d < last, `${soil} ${p}`); last = d; }
    assert.equal(soilTone(-20, soil), soilTone(0, soil)); assert.equal(soilTone(130, soil), soilTone(100, soil));
  }
  assert.equal(soilTone(50, 'peat'), null); assert.equal(soilTone(null, 'loamy'), null);
});
test('illustrated crop stage follows the configured calendar fractions, never anything else', () => {
  const [f0, f1, f2] = MODEL.assumptions.stageFractions;
  assert.equal(cropStage(null), null);
  assert.equal(cropStage(0).id, 'initial'); assert.equal(cropStage(f0).id, 'initial');
  assert.equal(cropStage(f0 + .01).id, 'development'); assert.equal(cropStage(f0 + f1 + .01).id, 'mid');
  assert.equal(cropStage(f0 + f1 + f2 + .01).id, 'late'); assert.equal(cropStage(1).senescence, 1);
  let last = 0;
  for (let p = 0; p <= 1; p += .01) { const s = cropStage(p); assert.ok(s.size >= last - 1e-12); last = s.size; }
});
test('every frame of a real year is read straight from that day’s model record', () => {
  for (const s of [{}, { irrigation: 25, cover: 'residue', soil: 'sandy' }, { crop: 'potato', planting: 10, harvest: 7, cover: 'cover', soil: 'clay' }]) {
    const r = run(s), st = startupSensitivity(palouse, { ...scenario, ...s });
    r.days.forEach((d, i) => {
      const f = sceneFrame(r, i, st), prev = i ? r.days[i - 1].water : r.initialWater;
      assert.equal(f.date, d.date); assert.equal(f.percent, d.availablePercent); assert.equal(f.water, d.water);
      assert.equal(f.soilColor, soilTone(d.availablePercent, r.scenario.soil));
      for (const k of ['rain', 'irrigation', 'demand', 'actualET', 'drainage']) { assert.equal(f.flows[k], d[k]); assert.equal(f.widths[k], flowWidth(d[k])); }
      assert.equal(f.change, d.water - prev);
      assert.equal(f.thresholdPercent, d.active ? 100 * (1 - d.p) : null);
      assert.equal(f.stage === null, !d.active);
      assert.equal(f.cover.kind, d.active ? 'crop' : r.scenario.cover);
      assert.equal(f.cover.exposedPercent, 100 * d.exposedFraction);
      assert.equal(f.freezingPrecip, d.tMin <= 0 && d.rain > 0);
      assert.equal(f.waterLimited, d.demand - d.actualET >= .05);
      assert.equal(f.startupActive, st.index === null || i < st.index);
      if (d.rain === 0) assert.equal(f.rainClass.drops, 0, 'no precipitation marks on a dry day');
    });
  }
  assert.equal(sceneFrame(run(), 365), null); assert.equal(sceneFrame(run(), -1), null); assert.equal(sceneFrame({ status: 'unavailable' }, 0), null);
});
test('representative real days: wet/drain, dry-limited, irrigated, high demand and freezing each show their own cause', () => {
  const r = run(), irrigated = run({ irrigation: 20 }), frames = r.days.map((_, i) => sceneFrame(r, i));
  const pick = (fn, label) => { const i = r.days.findIndex(fn); assert.ok(i >= 0, label); return [i, frames[i]]; };
  const [, drain] = pick(d => d.drainage > 5 && !d.freezing, 'drain-excess day');
  assert.ok(drain.widths.drainage > 0);
  // Store filled, excess drained, then the day's ET was removed: storage = capacity − ET exactly.
  assert.ok(Math.abs(drain.water - (drain.capacity - drain.flows.actualET)) < 1e-9); assert.match(drain.explanation, /drained below/);
  const [, dry] = pick(d => d.dry && d.rain === 0 && d.demand - d.actualET > 1, 'dry, water-limited day');
  assert.ok(dry.waterLimited && dry.widths.demand > dry.widths.actualET); assert.match(dry.explanation, /Soil water is limiting/);
  assert.ok(darkness(dry.soilColor) > darkness(drain.soilColor), 'dry soil is drawn lighter than saturated soil');
  const [, freeze] = pick(d => d.tMin <= 0 && d.rain > 1, 'freezing precipitation day');
  assert.equal(freeze.freezingPrecip, true); assert.match(freeze.explanation, /snow and frozen ground are not modeled/);
  const hot = r.days.reduce((a, d, i) => d.et0 > r.days[a].et0 ? i : a, 0);
  assert.equal(frames[hot].date, '2023-07-21', 'highest NASA-driven demand day of Palouse 2023 (ET0 5.79 mm)');
  const wet = sceneFrame(irrigated, hot);
  assert.ok(wet.widths.irrigation > 0 && frames[hot].widths.irrigation === 0);
  assert.ok(wet.percent >= frames[hot].percent, 'irrigation is visible in the same day’s soil water');
});
test('real spring-to-fall sequence: storage change, soil tone and gauge move together every day', () => {
  const r = run(), from = r.days.findIndex(d => d.date === '2023-04-01'), to = r.days.findIndex(d => d.date === '2023-10-31');
  for (let i = from + 1; i <= to; i++) {
    const a = sceneFrame(r, i - 1), b = sceneFrame(r, i);
    assert.equal(Math.sign(Math.round((b.water - a.water) * 1e6)), Math.sign(Math.round((b.percent - a.percent) * 1e6)));
    if (b.percent > a.percent + .5) assert.ok(darkness(b.soilColor) <= darkness(a.soilColor), b.date);
    if (b.percent < a.percent - .5) assert.ok(darkness(b.soilColor) >= darkness(a.soilColor), b.date);
  }
  const stages = r.days.slice(from, to + 1).map(d => sceneFrame(r, r.days.indexOf(d)).stage?.id ?? 'off');
  assert.deepEqual([...new Set(stages)], ['initial', 'development', 'mid', 'late', 'off']);
});
test('explanation sentence (SYNTHETIC records) chooses the right cause and never invents damage or yield', () => {
  const base = { rain: 0, irrigation: 0, actualET: 2, demand: 2, drainage: 0, ks: 1, active: true, freezing: false, tMin: 5 };
  assert.match(explainDay({ ...base, water: 48 }, 50), /fell 2\.0 mm/);
  assert.match(explainDay({ ...base, rain: 10, water: 58 }, 50), /rose 8\.0 mm/);
  assert.match(explainDay({ ...base, rain: 10, drainage: 3, water: 120 }, 115), /3\.0 mm drained/);
  assert.match(explainDay({ ...base, ks: .4, actualET: .8, demand: 2, water: 9 }, 9.8), /supplied only 0\.8 mm/);
  assert.match(explainDay({ ...base, rain: 4, freezing: true, tMin: -3, water: 52 }, 50), /may have been snow/);
  for (const sentence of [explainDay({ ...base, water: 48 }, 50), explainDay({ ...base, ks: .2, actualET: .1, water: 1 }, 1.1)])
    assert.doesNotMatch(sentence, /yield|damage|health|die|loss of crop/i);
});
