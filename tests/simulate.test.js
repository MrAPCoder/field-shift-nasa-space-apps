// M5 simulation engine. All weather and calendars here are SYNTHETIC test fixtures
// (see ./synthetic-replay.js) except the final structural check on the real archive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateReplay, replayHash, dateAt } from '../src/lib/replay.js';
import { buildRuns, planFromCalendar, planFromWindow, simulate, topExposedMonths, wetnessContext, validateSimulationConfig, REASONS } from '../src/lib/simulate.js';
import { syntheticReplay, syntheticCalendar, simConfig, SYNTHETIC_FARM } from './synthetic-replay.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const fixture = (build = () => {}, options) => { const f = syntheticReplay(options); build(f); validateReplay(f.replay, SYNTHETIC_FARM); return f.replay; };
const calendar = (status, exposed, overrides) => planFromCalendar(syntheticCalendar(status, exposed, overrides), { source: 'farmer_confirmed' });
const allYear = planFromWindow(1, 12);
const runOf = (result, year) => result.runs.find(run => run.startYear === year);

test('43 runs from 1981 to 2023; the last ends 2025-12-31 and no run requests 2026 weather', () => {
  const replay = fixture(), runs = buildRuns(replay);
  assert.equal(runs.length, 43);
  assert.deepEqual([runs[0].startYear, runs.at(-1).startYear], [1981, 2023]);
  assert.equal(dateAt(replay, runs.at(-1).months[35].end - 1), '2025-12-31');
  assert.equal(runs.at(-1).months[35].end, replay.days);
  for (const run of runs) {
    assert.equal(run.months.length, 36);
    run.months.forEach((span, m) => {
      assert.deepEqual([span.year, span.month], [run.startYear + Math.floor(m / 12), m % 12 + 1]);
      assert.ok(span.start >= 0 && span.end <= replay.days && span.year <= 2025);
      if (m) assert.equal(span.start, run.months[m - 1].end, 'months are contiguous days');
    });
    assert.equal(dateAt(replay, run.months[0].start), `${run.startYear}-01-01`);
  }
  const feb = year => { const run = runs.find(r => r.startYear === year - 1).months[13]; return run.end - run.start; };
  assert.deepEqual([feb(1984), feb(1985), feb(2000), feb(2024)], [29, 28, 29, 29]);
  assert.equal(runs.find(r => r.startYear === 1983).months.reduce((n, s) => n + s.end - s.start, 0), 1096);
  assert.equal(simulate(replay, allYear, simConfig).startYears.length, 43);
});

test('a growing window may wrap the year (Oct→Jul) and repeats every plan year', () => {
  const plan = planFromWindow(10, 7);
  assert.deepEqual(plan.months.filter(m => m.planYear === 2 && m.inCrop).map(m => m.month), [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]);
  assert.ok(plan.months.every(m => m.inCrop === ![8, 9].includes(m.month)));
  assert.deepEqual(planFromWindow(4, 9).months.filter(m => m.planYear === 3 && m.inCrop).map(m => m.month), [4, 5, 6, 7, 8, 9]);
  assert.equal(planFromWindow(6, 6).months.filter(m => m.inCrop).length, 3);
  assert.equal(plan.source, 'growing_window');
  for (const bad of [[0, 5], [3, 13], [null, 4], [2.5, 4]]) assert.throws(() => planFromWindow(...bad));
});

test('calendar plans: in-crop is cash or cover, bare is exactly 100, unknown is never bare', () => {
  const plan = calendar('cash', 40, { 0: { status: 'bare', exposed_percent: 100 }, 1: { status: 'cover', exposed_percent: 0 }, 2: { status: 'unknown', exposed_percent: null }, 3: { status: 'bare', exposed_percent: 40 } });
  assert.deepEqual(plan.months.slice(0, 5).map(m => [m.status, m.inCrop, m.exposedPercent]), [['bare', false, 100], ['cover', true, 0], ['unknown', false, null], ['bare', false, null], ['cash', true, 40]]);
  assert.equal(plan.calendarComplete, false);
  assert.equal(calendar('cash', 40).calendarComplete, true);
  assert.equal(calendar('cash', null).calendarComplete, false, 'a planted crop has no default exposure');
  assert.throws(() => planFromCalendar(syntheticCalendar().slice(1), { source: 'farmer_confirmed' }));
  assert.throws(() => planFromCalendar([...syntheticCalendar().slice(1), { year: 2, month: 1, status: 'cash', exposed_percent: 1 }], { source: 'farmer_confirmed' }), /Duplicate/);
  assert.throws(() => planFromCalendar(syntheticCalendar(), {}), /explicit source/);
});

test('dry spell: longest run of in-crop days below 1.0 mm, across month and year boundaries', () => {
  // SYNTHETIC: 40 dry days from 1990-12-12 to 1991-01-20 and a shorter 10-day spell.
  const replay = fixture(f => { f.set('PRECTOTCORR', '1990-12-12', '1991-01-20', 0); f.set('PRECTOTCORR', '1990-06-01', '1990-06-10', 0.5); });
  const result = simulate(replay, allYear, simConfig);
  for (const year of [1989, 1990]) {
    assert.deepEqual(runOf(result, year).dry, { valid: true, value: 40, flagged: true, spell: { startIndex: runOf(result, year).dry.spell.startIndex, endIndex: runOf(result, year).dry.spell.endIndex, startDate: '1990-12-12', endDate: '1991-01-20', days: 40 } });
  }
  // The run starting 1991 only sees the January part; the run starting 1988 only the December part.
  assert.equal(runOf(result, 1991).dry.value, 20);
  assert.equal(runOf(result, 1991).dry.flagged, false);
  assert.equal(runOf(result, 1988).dry.value, 20);
  assert.equal(runOf(result, 1992).dry.value, 0);
  assert.equal(runOf(result, 1992).dry.spell, null);
  assert.deepEqual([result.families.dry.flaggedRuns, result.families.dry.validRuns], [2, 43]);
  assert.equal(result.families.dry.worst.startYear, 1989, 'ties keep the earliest start year');
});

test('dry-day threshold: 0.99 mm is dry, exactly 1.0 mm is not; 21 days flags, 20 does not', () => {
  const replay = fixture(f => {
    f.set('PRECTOTCORR', '1995-05-01', '1995-05-21', 0.99);
    f.set('PRECTOTCORR', '1999-05-01', '1999-05-21', 1.0);
    f.set('PRECTOTCORR', '2003-05-01', '2003-05-20', 0);
  });
  const result = simulate(replay, allYear, simConfig);
  assert.deepEqual([runOf(result, 1995).dry.value, runOf(result, 1995).dry.flagged], [21, true]);
  assert.equal(runOf(result, 1999).dry.value, 0);
  assert.deepEqual([runOf(result, 2003).dry.value, runOf(result, 2003).dry.flagged], [20, false]);
});

test('a non-in-crop day ends a dry spell; winter crops use the preceding fall of the correct year', () => {
  // SYNTHETIC: dry from 1990-09-01 to 1991-02-28. Winter-crop window Oct→Jul.
  const replay = fixture(f => f.set('PRECTOTCORR', '1990-09-01', '1991-02-28', 0));
  const winter = simulate(replay, planFromWindow(10, 7), simConfig);
  assert.deepEqual([runOf(winter, 1990).dry.spell.startDate, runOf(winter, 1990).dry.spell.endDate, runOf(winter, 1990).dry.value], ['1990-10-01', '1991-02-28', 151]);
  // A calendar with crop months Oct of plan year 1 → Jul of plan year 2 only.
  const months = syntheticCalendar('bare', 100);
  for (let i = 9; i <= 18; i++) months[i] = { ...months[i], status: 'cash', exposed_percent: 30 };
  const plan = planFromCalendar(months, { source: 'farmer_confirmed' });
  const result = simulate(replay, plan, simConfig);
  assert.equal(runOf(result, 1990).dry.spell.startDate, '1990-10-01');
  assert.equal(runOf(result, 1990).dry.value, 151);
  assert.equal(runOf(result, 1989).dry.value, 0, 'plan year 2 fall (1990) is not a crop month in the 1989 run');
  assert.equal(runOf(result, 1991).dry.value, 0, 'Jan–Feb of plan year 1 are bare, not in crop');
  // Summer-only window: September ends nothing because it never started.
  assert.equal(runOf(simulate(replay, planFromWindow(4, 8), simConfig), 1990).dry.value, 0);
});

test('a missing in-crop day breaks the spell and invalidates the run for that family only', () => {
  const replay = fixture(f => { f.set('PRECTOTCORR', '1990-06-01', '1990-07-10', 0); f.set('PRECTOTCORR', '1990-06-20', '1990-06-20', null); });
  const result = simulate(replay, allYear, simConfig);
  for (const year of [1988, 1989, 1990]) {
    assert.deepEqual(runOf(result, year).dry, { valid: false, value: null, flagged: null, spell: null });
    assert.equal(runOf(result, year).heat.valid, true);
    assert.equal(runOf(result, year).frost.valid, true);
  }
  assert.equal(runOf(result, 1991).dry.valid, true);
  assert.deepEqual([result.families.dry.validRuns, result.families.dry.flaggedRuns], [40, 0]);
  assert.equal(result.families.dry.flags[9], null);
  // Missing weather outside the crop months does not affect in-crop screens.
  const offSeason = simulate(replay, planFromWindow(8, 10), simConfig);
  assert.equal(runOf(offSeason, 1990).dry.valid, true);
});

test('heat counts only in-crop days at or above 32 °C; flag needs 5 in one plan year', () => {
  const replay = fixture(f => {
    f.set('T2M_MAX', '1990-07-01', '1990-07-04', 32); f.set('T2M_MAX', '1990-07-05', '1990-07-05', 31.99);   // 4 days
    f.set('T2M_MAX', '1991-08-01', '1991-08-05', 35); f.set('T2M_MAX', '1991-08-03', '1991-08-03', 38.5);    // 5 days
    f.set('T2M_MAX', '1991-11-01', '1991-11-30', 40);                                                        // outside window
  });
  const result = simulate(replay, planFromWindow(4, 9), simConfig);
  assert.deepEqual(runOf(result, 1990).heat.perYear, [4, 5, 0]);
  assert.deepEqual([runOf(result, 1990).heat.value, runOf(result, 1990).heat.flagged, runOf(result, 1990).heat.worstPlanYear, runOf(result, 1990).heat.calendarYear], [5, true, 2, 1991]);
  assert.deepEqual(runOf(result, 1990).heat.hottest, { date: '1991-08-03', value: 38.5 });
  assert.deepEqual([runOf(result, 1988).heat.value, runOf(result, 1988).heat.flagged], [4, false]);
  assert.equal(result.families.heat.flaggedRuns, 3);
  assert.equal(runOf(simulate(replay, allYear, simConfig), 1991).heat.value, 35);
});

test('frost counts only in-crop days at or below 0 °C in shoulder months 4,5,6,9,10', () => {
  const replay = fixture(f => {
    f.set('T2M_MIN', '1990-01-01', '1990-03-31', -10);   // winter: never counted
    f.set('T2M_MIN', '1990-04-10', '1990-04-11', 0);     // shoulder, exactly 0 counts
    f.set('T2M_MIN', '1990-04-12', '1990-04-12', 0.01);  // not a frost
    f.set('T2M_MIN', '1990-07-15', '1990-07-15', -1);    // July is not a shoulder month
    f.set('T2M_MIN', '1990-10-05', '1990-10-05', -3);
    f.set('T2M_MIN', '1990-11-01', '1990-11-30', -5);    // November is not a shoulder month
  });
  const all = runOf(simulate(replay, allYear, simConfig), 1990).frost;
  assert.deepEqual([all.value, all.flagged, all.first, all.last], [3, true, '1990-04-10', '1990-10-05']);
  assert.deepEqual(all.coldest, { date: '1990-10-05', value: -3 });
  // Window May→Sep: April and October frosts fall outside the crop months.
  const summer = simulate(replay, planFromWindow(5, 9), simConfig);
  assert.deepEqual([runOf(summer, 1990).frost.value, runOf(summer, 1990).frost.flagged], [0, false]);
  assert.equal(summer.families.frost.flaggedRuns, 0);
  assert.equal(runOf(simulate(replay, planFromWindow(10, 4), simConfig), 1990).frost.value, 3);
});

test('exposed-soil precipitation: Efrac per plan year and E_mm per run; bare counts as 100%', () => {
  // SYNTHETIC: 5 mm every day. Year 1 fully bare, year 2 at 20%, year 3 at 0%.
  const months = syntheticCalendar('cash', 0);
  for (let i = 0; i < 12; i++) months[i] = { ...months[i], status: 'bare', exposed_percent: 100 };
  for (let i = 12; i < 24; i++) months[i] = { ...months[i], status: 'cover', exposed_percent: 20 };
  const result = simulate(fixture(), planFromCalendar(months, { source: 'farmer_confirmed' }), simConfig);
  const run = runOf(result, 1981).exposed;
  assert.deepEqual(run.perYear.map(y => Math.round(y.fraction * 1e9) / 1e9), [1, 0.2, 0]);
  assert.deepEqual([run.perYear[0].totalMm, run.perYear[0].exposedMm], [1825, 1825]);
  assert.ok(Math.abs(run.exposedMm - (1825 + 365)) < 1e-9);
  assert.deepEqual([run.value, run.flagged, run.worstPlanYear, run.calendarYear], [1, true, 1, 1981]);
  assert.equal(result.families.exposed.flaggedRuns, 43);
  assert.deepEqual(topExposedMonths(result), [0, 2, 4], '31-day months of the bare year, earliest first on ties');
  // Just under and exactly at the 0.25 screen.
  const at = pct => simulate(fixture(), calendar('cash', pct), simConfig).families.exposed.flaggedRuns;
  assert.deepEqual([at(24.9), at(25)], [0, 43]);
});

test('exposed family: zero precipitation in a plan year → unavailable; unknown months → unavailable; climate-only → unavailable', () => {
  const dryYear = fixture(f => f.set('PRECTOTCORR', '1990-01-01', '1990-12-31', 0));
  const result = simulate(dryYear, calendar('cash', 50), simConfig);
  for (const year of [1988, 1989, 1990]) assert.deepEqual(runOf(result, year).exposed, { valid: false, value: null, flagged: null });
  assert.equal(runOf(result, 1991).exposed.valid, true);
  assert.equal(result.families.exposed.validRuns, 40);
  const missing = simulate(fixture(f => f.set('PRECTOTCORR', '1990-12-25', '1990-12-25', null)), calendar('bare', 100), simConfig);
  assert.equal(runOf(missing, 1990).exposed.valid, false);
  const unknown = simulate(fixture(), calendar('cash', 50, { 17: { status: 'unknown', exposed_percent: null } }), simConfig);
  assert.equal(unknown.families.exposed.status, 'unavailable');
  assert.equal(unknown.families.exposed.reason, REASONS.incomplete);
  assert.equal(unknown.families.dry.status, 'evaluated', 'climate families still run');
  assert.equal(unknown.exposedByPlanMonth, null);
  assert.deepEqual(topExposedMonths(unknown), []);
  const climateOnly = simulate(fixture(), planFromWindow(4, 9), simConfig);
  assert.equal(climateOnly.families.exposed.status, 'unavailable');
  assert.equal(climateOnly.families.exposed.reason, REASONS.climateOnly);
  assert.ok(climateOnly.runs.every(run => run.exposed.valid === false));
  const noCrop = simulate(fixture(), calendar('bare', 100), simConfig);
  for (const family of ['dry', 'heat', 'frost']) assert.deepEqual([noCrop.families[family].status, noCrop.families[family].reason], ['unavailable', REASONS.noCrop]);
  assert.equal(noCrop.families.exposed.status, 'evaluated');
});

test('fewer than 20 valid replays makes a family unavailable, not "low"', () => {
  const withGaps = lastYear => fixture(f => { for (let year = 1981; year <= lastYear; year++) f.set('PRECTOTCORR', `${year}-06-01`, `${year}-06-01`, null); });
  const few = simulate(withGaps(2006), allYear, simConfig).families.dry;
  assert.deepEqual([few.status, few.validRuns, few.frequency, few.flaggedRuns, few.qualifies], ['unavailable', 17, null, null, false]);
  assert.match(few.reason, /Only 17 of 43 replays/);
  const enough = simulate(withGaps(2003), allYear, simConfig).families.dry;
  assert.deepEqual([enough.status, enough.validRuns, enough.frequency], ['evaluated', 20, 0]);
  assert.equal(simulate(withGaps(2006), allYear, simConfig).families.heat.status, 'evaluated');
});

test('frequency is flagged / valid and qualifies at 1 in 5', () => {
  // SYNTHETIC: one hot spell in each of 1985, 1995, 2005 → 3 runs each = 9 of 43 (0.209).
  const replay = fixture(f => { for (const year of [1985, 1995, 2005]) f.set('T2M_MAX', `${year}-07-01`, `${year}-07-10`, 36); });
  const heat = simulate(replay, allYear, simConfig).families.heat;
  assert.deepEqual([heat.flaggedRuns, heat.validRuns, heat.qualifies], [9, 43, true]);
  assert.ok(Math.abs(heat.frequency - 9 / 43) < 1e-12);
  assert.equal(heat.flags.filter(Boolean).length, 9);
  const two = simulate(fixture(f => { for (const year of [1985, 2005]) f.set('T2M_MAX', `${year}-07-01`, `${year}-07-10`, 36); f.set('T2M_MAX', '1981-07-01', '1981-07-10', 36); f.set('T2M_MAX', '2025-07-01', '2025-07-10', 36); }), allYear, simConfig).families.heat;
  assert.deepEqual([two.flaggedRuns, two.qualifies], [8, false]);
});

test('GWETROOT context: mean empirical percentile (below + 0.5·equal)/N against the same months 1991–2020', () => {
  // SYNTHETIC: baseline wetness 0.5; ten baseline Junes at 0.2; evaluated dry June 2022 at 0.3.
  const replay = fixture(f => {
    for (let year = 1991; year <= 2000; year++) f.set('GWETROOT', `${year}-06-01`, `${year}-06-30`, 0.2);
    f.set('GWETROOT', '2022-06-01', '2022-06-30', 0.3);
    f.set('PRECTOTCORR', '2022-06-01', '2022-06-30', 0);
  });
  const plan = planFromWindow(6, 6), result = simulate(replay, plan, simConfig);
  const worst = result.families.dry.worst;
  assert.deepEqual([worst.startYear, worst.spell.startDate, worst.value], [2020, '2022-06-01', 30]);
  assert.deepEqual(worst.wetness.months, [6]);
  assert.deepEqual([worst.wetness.calendarYear, worst.wetness.baseline, worst.wetness.referenceYears], [2022, [1991, 2020], 30]);
  assert.ok(Math.abs(worst.wetness.percentile - 100 * 10 / 30) < 1e-9);
  // Evaluated year inside the baseline and tied with it: 10 below, 20 equal → (10 + 10) / 30.
  const tied = fixture(f => { for (let year = 1991; year <= 2000; year++) f.set('GWETROOT', `${year}-06-01`, `${year}-06-30`, 0.2); f.set('PRECTOTCORR', '2010-06-01', '2010-06-30', 0); });
  const tiedWorst = simulate(tied, plan, simConfig).families.dry.worst;
  assert.ok(Math.abs(tiedWorst.wetness.percentile - 100 * 20 / 30) < 1e-9);
  // A missing wetness day in the evaluated month → context unavailable; the dry result is unaffected.
  const gap = fixture(f => { f.set('PRECTOTCORR', '2022-06-01', '2022-06-30', 0); f.set('GWETROOT', '2022-06-15', '2022-06-15', null); });
  const gapResult = simulate(gap, plan, simConfig);
  assert.equal(gapResult.families.dry.worst.wetness, null);
  assert.equal(gapResult.families.dry.worst.value, 30);
  assert.equal(wetnessContext(gap, plan, { startYear: 2020, dry: { spell: null } }, simConfig), null);
  // Wetness never changes a flag: identical dry results with very different wetness.
  const wetter = fixture(f => { f.set('PRECTOTCORR', '2022-06-01', '2022-06-30', 0); f.set('GWETROOT', '2022-01-01', '2022-12-31', 1); });
  assert.deepEqual(simulate(wetter, plan, simConfig).families.dry.flags, result.families.dry.flags);
});

test('weather invariance: simulating plan A then plan B leaves the replay identical', () => {
  const build = f => { f.set('PRECTOTCORR', '1990-06-01', '1990-07-10', 0); f.set('T2M_MAX', '2001-07-01', '2001-07-09', 34); };
  const replay = fixture(build), before = structuredClone(replay), hash = replayHash(replay);
  const a = simulate(replay, calendar('bare', 100, { 5: { status: 'cash', exposed_percent: 10 } }), simConfig);
  const b = simulate(replay, planFromWindow(10, 7), simConfig);
  assert.deepEqual(replay, before);
  assert.equal(replayHash(replay), hash);
  assert.deepEqual([a.replayHash, b.replayHash], [hash, hash]);
  assert.deepEqual(a.startYears, b.startYears);
  assert.deepEqual(a.startYears, Array.from({ length: 43 }, (_, i) => 1981 + i));
  assert.deepEqual(simulate(replay, planFromWindow(10, 7), simConfig), b, 'deterministic');
  assert.notEqual(simulate(fixture(f => { build(f); f.set('T2M_MIN', '1999-01-01', '1999-01-01', 4); }), allYear, simConfig).replayHash, hash);
});

test('misconfigured thresholds fail closed', () => {
  for (const patch of [{ dryDayMm: null }, { drySpellDays: 0 }, { frostShoulderMonths: [13] }, { exposedFraction: 1.5 }, { minValidRuns: 0 }, { familyOrder: ['dry'] }, { wetnessBaseline: [2020, 1991] }, { status: undefined }])
    assert.throws(() => validateSimulationConfig({ ...simConfig, ...patch }), /thresholds/);
  assert.throws(() => simulate(fixture(), allYear, undefined), /thresholds/);
  assert.throws(() => simulate(fixture(), { ...allYear, source: 'made_up' }, simConfig), /Invalid simulation plan/);
  assert.equal(simConfig.status, 'provisional');
});

test('structural check on the real Palouse archive (values are not asserted or displayed here)', () => {
  const config = read('../src/config/config.json');
  const farm = config.farms.find(item => item.id === 'palouse');
  const replay = validateReplay(read('../public/data/palouse/replay.json'), farm);
  const result = simulate(replay, planFromWindow(4, 8), config.simulation);
  assert.equal(result.runs.length, 43);
  for (const family of ['dry', 'heat', 'frost']) {
    assert.equal(result.families[family].status, 'evaluated');
    assert.equal(result.families[family].validRuns, 43, 'core variables have no missing days');
  }
  assert.equal(result.families.exposed.status, 'unavailable');
});
