// M5 paired before/after comparison and demo-data isolation. Unit fixtures are SYNTHETIC
// (./synthetic-replay.js). data/demo-scenarios.json is an ILLUSTRATIVE demo, not farm data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateReplay, replayHash } from '../src/lib/replay.js';
import { planFromCalendar, planFromWindow, simulate } from '../src/lib/simulate.js';
import { compare, comparisonText, median, BANNED_WORDING } from '../src/lib/compare.js';
import { evaluateConcerns, CHIPS } from '../src/lib/concerns.js';
import { managementIssues, emptyManagement } from '../src/lib/management.js';
import { scoreErosion, scoreRotation } from '../src/lib/score.js';
import { syntheticReplay, syntheticCalendar, simConfig, SYNTHETIC_FARM } from './synthetic-replay.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const fixture = (build = () => {}, options) => { const f = syntheticReplay(options); build(f); validateReplay(f.replay, SYNTHETIC_FARM); return f.replay; };
const calendar = (status, exposed, overrides) => planFromCalendar(syntheticCalendar(status, exposed, overrides), { source: 'farmer_confirmed' });
const clean = text => BANNED_WORDING.forEach(pattern => assert.doesNotMatch(text, pattern));

test('median', () => {
  assert.deepEqual([median([3, 1, 2]), median([4, 1, 3, 2]), median([]), median([7])], [2, 2.5, null, 7]);
});

test('same replay, same start years: frequency change, paired medians and allowed wording', () => {
  const replay = fixture(), hash = replayHash(replay), snapshot = structuredClone(replay);
  const before = simulate(replay, calendar('bare', 100), simConfig);       // SYNTHETIC: fully bare
  const after = simulate(replay, calendar('cover', 10), simConfig);        // SYNTHETIC: cover at 10%
  const result = compare(before, after);
  assert.deepEqual(replay, snapshot);
  assert.deepEqual([result.replayHash, before.replayHash, after.replayHash], [hash, hash, hash]);
  assert.deepEqual(result.startYears, before.startYears);
  assert.equal(result.runCount, 43);
  const exposed = result.families.find(row => row.family === 'exposed');
  assert.equal(exposed.frequencyText, '43 → 0 of 43 replays');
  assert.equal(exposed.delta, -43);
  assert.equal(exposed.paired.text, 'less precipitation on assumed-exposed soil in 43 of 43 replays');
  assert.equal(exposed.paired.medianText, 'median 5,480 → 548 mm');
  assert.deepEqual([exposed.paired.less, exposed.paired.more, exposed.paired.same, exposed.paired.runs], [43, 0, 0, 43]);
  assert.equal(result.exposed, exposed.paired);
  assert.equal(exposed.chip, CHIPS.simulated);
  assert.deepEqual(result.disappeared.map(item => item.family), ['exposed']);
  assert.deepEqual(result.appeared, []);
  // The bare plan had no crop months: climate screens go from not evaluated to evaluated.
  assert.equal(result.families.find(row => row.family === 'dry').frequencyText, 'not evaluated → 0 of 43 replays');
  assert.deepEqual(result.families.map(row => row.family), simConfig.familyOrder);
  clean(comparisonText(result));
  assert.match(result.note, /Same weather, same start years/);
});

test('growing-window change: fewer in-crop hot days, appeared and disappeared concerns', () => {
  // SYNTHETIC: hot spell every August, frost every October 5.
  const replay = fixture(f => { for (let year = 1981; year <= 2025; year++) { f.set('T2M_MAX', `${year}-08-01`, `${year}-08-10`, 35); f.set('T2M_MIN', `${year}-10-05`, `${year}-10-05`, -2); } });
  const before = simulate(replay, planFromWindow(4, 8), simConfig), after = simulate(replay, planFromWindow(9, 11), simConfig);
  const result = compare(before, after);
  const heat = result.families.find(row => row.family === 'heat'), frost = result.families.find(row => row.family === 'frost');
  assert.equal(heat.frequencyText, '43 → 0 of 43 replays');
  assert.equal(heat.paired.text, 'fewer in-crop hot days in 43 of 43 replays');
  assert.equal(heat.paired.medianText, 'median 10 → 0 days');
  assert.equal(frost.frequencyText, '0 → 43 of 43 replays');
  assert.equal(frost.paired.text, 'fewer in-crop shoulder-month frost days in 0 of 43 replays; more in 43');
  assert.deepEqual(result.disappeared.map(item => item.family), ['heat']);
  assert.deepEqual(result.appeared.map(item => item.family), ['frost']);
  assert.equal(result.families.find(row => row.family === 'exposed').frequencyText, 'not evaluated in either plan');
  assert.equal(result.families.find(row => row.family === 'dry').paired.text, 'a shorter longest in-crop dry spell in 0 of 43 replays');
  clean(comparisonText(result));
  // Calendar → climate-only: the exposed family is reported as no longer evaluated, not as improved.
  const dropped = compare(simulate(replay, calendar('cash', 60), simConfig), after);
  assert.equal(dropped.families.find(row => row.family === 'exposed').frequencyText, '43 of 43 replays → not evaluated');
  assert.deepEqual(dropped.noLongerEvaluated.map(item => item.family), ['exposed']);
  assert.deepEqual(dropped.disappeared.map(item => item.family), ['exposed', 'heat']);
  clean(comparisonText(dropped));
});

test('compare rejects different weather or different start years', () => {
  const replay = fixture(), other = fixture(f => f.set('PRECTOTCORR', '2000-01-01', '2000-01-01', 4.99));
  const a = simulate(replay, planFromWindow(4, 9), simConfig), b = simulate(other, planFromWindow(4, 9), simConfig);
  assert.notEqual(a.replayHash, b.replayHash);
  assert.throws(() => compare(a, b), /same weather replay/);
  assert.throws(() => compare(a, { ...a, replayHash: undefined }), /same weather replay/);
  assert.throws(() => compare(a, { ...a, startYears: a.startYears.slice(1) }), /same replay start years/);
  assert.throws(() => compare(a, { ...a, startYears: a.startYears.map(year => year + 1) }), /same replay start years/);
  const shorter = simulate(fixture(() => {}, { endYear: 2020 }), planFromWindow(4, 9), simConfig);
  assert.equal(shorter.startYears.length, 38);
  assert.throws(() => compare(a, shorter));
  assert.doesNotThrow(() => compare(a, simulate(replay, planFromWindow(5, 8), simConfig)));
});

const demo = read('../data/demo-scenarios.json');
const rotations = read('../data/rotations.json').rotations;
const crops = read('../data/crops.json').crops;
const config = read('../src/config/config.json');
const palouseClimate = read('../public/data/palouse/climate.json');

test('demo calendars are labeled illustrative, complete, and differ only in the non-crop months', () => {
  assert.equal(demo.source_kind, 'illustrative_demo');
  assert.equal(demo.values_status, 'illustrative_pending_review');
  assert.match(demo.notice, /^Hypothetical demonstration\. Calendar and exposure values are illustrative, not farm data or recommendations\./);
  assert.deepEqual(Object.keys(demo.scenarios), ['baseline', 'improved']);
  const { baseline, improved } = demo.scenarios;
  for (const scenario of [baseline, improved]) {
    assert.deepEqual([scenario.rotation_id, scenario.source_kind, scenario.confirmed, scenario.values_status], ['palouse-current', 'illustrative_demo', false, 'illustrative_pending_review']);
    assert.equal(scenario.months.length, 36);
    assert.equal(planFromCalendar(scenario.months, { source: 'illustrative_demo' }).calendarComplete, true);
    assert.ok(scenario.months.every((row, i) => row.year === Math.floor(i / 12) + 1 && row.month === i % 12 + 1));
  }
  let changed = 0;
  baseline.months.forEach((row, i) => {
    const other = improved.months[i];
    if (row.status === 'cash') { assert.deepEqual(other, row); assert.equal(row.exposed_percent, demo.illustrative_values.crop_month_exposed_percent); }
    else { changed++; assert.deepEqual([row.status, row.exposed_percent], ['bare', 100]); assert.deepEqual([other.status, other.exposed_percent], ['cover', demo.illustrative_values.cover_month_exposed_percent]); }
  });
  assert.equal(changed, 16);
  assert.ok(rotations.some(rotation => rotation.id === demo.rotation_id && rotation.farm_id === 'palouse'));
});

test('demo calendars are rejected as farmer management and can never produce a rotation score', () => {
  const rotation = rotations.find(item => item.id === 'palouse-current');
  for (const scenario of Object.values(demo.scenarios)) {
    for (const requireConfirmation of [true, false]) assert.deepEqual(managementIssues(scenario, rotation.id, requireConfirmation), ['Farmer calendar provenance or rotation does not match.']);
    // Even if someone forged confirmation fields onto the demo object, provenance still fails closed.
    const forged = { ...scenario, confirmed: true, confirmed_at: '2026-11-15T00:00:00Z', confirmed_by: 'x', context: 'x', mode: 'proposed', method: emptyManagement(rotation.id).method };
    assert.ok(managementIssues(forged, rotation.id).length > 0);
    assert.equal(scoreErosion(rotation, palouseClimate, forged).status, 'NOT_SCORED');
    assert.equal(scoreRotation(rotation, crops, palouseClimate, { water: 5, soil: 5, income: 5, erosion: 5 }, config.scoring, forged).total.status, 'NOT_SCORED');
  }
});

test('simulator modules never import the scoring engine, write farmer management state, or make their own requests', () => {
  assert.match(readFileSync(new URL('../src/lib/replay.js', import.meta.url), 'utf8'), /data\/\$\{farm\.id\}\/replay\.json/);
  const required = ['replay.js', 'simulate.js', 'concerns.js', 'compare.js'].map(name => `../src/lib/${name}`);
  const components = readdirSync(new URL('../src/components/', import.meta.url)).filter(name => /^(Sim|ConcernCard)/.test(name)).map(name => `../src/components/${name}`);
  assert.deepEqual(components.map(path => path.split('/').pop()).sort(), ['ConcernCard.jsx', 'SimComparison.jsx', 'SimSetup.jsx', 'SimulationReport.jsx', 'Simulator.jsx']);
  for (const path of [...required, ...components]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /score\.js|scoreRotation|scoreErosion|onManagementChange|setManagement/, path);
    // The only network access is replay.js loading the app's own static file.
    if (!path.endsWith('/replay.js')) assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/, path);
  }
});

test('illustrative demo on the archived Palouse replay: identical weather, less exposed precipitation in every replay', () => {
  const farm = config.farms.find(item => item.id === 'palouse');
  const replay = validateReplay(read('../public/data/palouse/replay.json'), farm);
  const plan = id => planFromCalendar(demo.scenarios[id].months, { source: 'illustrative_demo', label: demo.scenarios[id].label, rotationId: demo.rotation_id });
  const before = simulate(replay, plan('baseline'), config.simulation), after = simulate(replay, plan('improved'), config.simulation);
  const result = compare(before, after);
  assert.equal(result.runCount, 43);
  assert.deepEqual([result.exposed.less, result.exposed.more, result.exposed.runs], [43, 0, 43]);
  assert.ok(result.exposed.medianAfter < result.exposed.medianBefore);
  const concerns = evaluateConcerns(before);
  assert.ok(concerns.concerns.length >= 1 && concerns.concerns.length <= 3);
  assert.equal(concerns.concerns[0].family, 'exposed');
  assert.ok(concerns.concerns.every(card => card.assumptionChip === CHIPS.demo));
  clean(comparisonText(result));
});
