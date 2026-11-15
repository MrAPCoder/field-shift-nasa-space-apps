// M5 replay contract. Fixtures from ./synthetic-replay.js are SYNTHETIC, not NASA data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateReplay, dayIndex, dateAt, monthSpan, replayYears, replayHash, loadReplay, REPLAY_LOAD_ERROR } from '../src/lib/replay.js';
import { syntheticReplay, SYNTHETIC_FARM } from './synthetic-replay.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const config = read('../src/config/config.json');

test('committed replay files validate against the configured farms: 16,436 days, distinct fingerprints', () => {
  const hashes = new Set();
  for (const farm of config.farms) {
    const replay = validateReplay(read(`../public/data/${farm.id}/replay.json`), farm);
    assert.equal(replay.days, 16436);
    assert.deepEqual(replayYears(replay), { first: 1981, last: 2025 });
    for (const name of ['PRECTOTCORR', 'T2M_MAX', 'T2M_MIN', 'GWETROOT']) assert.equal(replay.series[name].length, 16436);
    assert.equal(replay.provenance.raw_files.length, 9);
    hashes.add(replayHash(replay));
  }
  assert.equal(hashes.size, 3);
});

test('a replay for another location or with a broken contract is rejected', () => {
  const mutations = {
    schema: r => { r.schema = 'other'; },
    version: r => { r.schema_version = 2; },
    latitude: r => { r.farm.latitude += 0.001; },
    farmId: r => { r.farm.id = 'elsewhere'; },
    shortSeries: r => { r.series.T2M_MAX.pop(); },
    days: r => { r.days -= 1; },
    units: r => { r.units.PRECTOTCORR = 'mm/hour'; },
    timeStandard: r => { r.time_standard = 'UTC'; },
    nan: r => { r.series.GWETROOT[5] = NaN; },
    sentinel: r => { r.series.PRECTOTCORR[5] = -999; },
    string: r => { r.series.T2M_MIN[5] = '5'; },
    undefinedValue: r => { r.series.T2M_MIN[5] = undefined; },
    wetnessRange: r => { r.series.GWETROOT[5] = 1.2; },
    temperatureOrder: r => { r.series.T2M_MIN[5] = 30; },
    partialYearStart: r => { r.start = '1981-01-02'; r.days -= 1; for (const s of Object.values(r.series)) s.pop(); },
    provenance: r => { r.provenance.raw_files = []; },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const { replay } = syntheticReplay({ endYear: 1983 });
    mutate(replay);
    assert.throws(() => validateReplay(replay, SYNTHETIC_FARM), new RegExp(REPLAY_LOAD_ERROR), name);
  }
  assert.throws(() => validateReplay(null, SYNTHETIC_FARM), new RegExp(REPLAY_LOAD_ERROR));
  assert.throws(() => validateReplay(syntheticReplay({ endYear: 1983 }).replay, config.farms[0]), /does not match this location/);
});

test('null and zero are both valid values and stay distinct', () => {
  const { replay } = syntheticReplay({ endYear: 1983 });
  replay.series.PRECTOTCORR[0] = 0; replay.series.PRECTOTCORR[1] = null;
  const valid = validateReplay(replay, SYNTHETIC_FARM);
  assert.equal(valid.series.PRECTOTCORR[0], 0);
  assert.equal(valid.series.PRECTOTCORR[1], null);
});

test('day index is start + i days in UTC, including leap days and both ends of the archive', () => {
  const { replay } = syntheticReplay();
  validateReplay(replay, SYNTHETIC_FARM);
  assert.equal(replay.days, 16436);
  assert.equal(dayIndex(replay, 1981, 1, 1), 0);
  assert.equal(dateAt(replay, 0), '1981-01-01');
  assert.equal(dateAt(replay, 16435), '2025-12-31');
  assert.equal(dayIndex(replay, 2025, 12, 31), 16435);
  assert.equal(dateAt(replay, dayIndex(replay, 1984, 2, 29)), '1984-02-29');
  assert.equal(dayIndex(replay, 1984, 3, 1) - dayIndex(replay, 1984, 2, 28), 2);
  assert.equal(dayIndex(replay, 1985, 3, 1) - dayIndex(replay, 1985, 2, 28), 1);
  for (let i = 0; i < replay.days; i += 997) { const [y, m, d] = dateAt(replay, i).split('-').map(Number); assert.equal(dayIndex(replay, y, m, d), i); }
  assert.deepEqual(monthSpan(replay, 2024, 2), { start: dayIndex(replay, 2024, 2, 1), end: dayIndex(replay, 2024, 2, 1) + 29 });
  assert.equal(monthSpan(replay, 2025, 12).end, replay.days);
  assert.throws(() => monthSpan(replay, 2026, 1), RangeError);
  assert.throws(() => monthSpan(replay, 1980, 12), RangeError);
  assert.throws(() => monthSpan(replay, 2000, 13), RangeError);
  assert.throws(() => dateAt(replay, 16436), RangeError);
  assert.throws(() => dateAt(replay, -1), RangeError);
});

test('validated weather is frozen; the fingerprint is stable and sensitive to any single value', () => {
  const a = syntheticReplay({ endYear: 1985 }).replay, b = syntheticReplay({ endYear: 1985 }).replay, c = syntheticReplay({ endYear: 1985 }).replay, d = syntheticReplay({ endYear: 1985 }).replay;
  b.series.T2M_MIN[700] = 4.99; c.series.PRECTOTCORR[3] = 0; d.series.PRECTOTCORR[3] = null;
  for (const replay of [a, b, c, d]) validateReplay(replay, SYNTHETIC_FARM);
  assert.equal(replayHash(a), replayHash(syntheticReplay({ endYear: 1985 }).replay));
  assert.match(replayHash(a), /^[0-9a-f]{16}$/);
  assert.equal(new Set([a, b, c, d].map(replayHash)).size, 4);
  assert.throws(() => { a.series.PRECTOTCORR[0] = 99; }, TypeError);
  assert.throws(() => { a.series.PRECTOTCORR = []; }, TypeError);
});

test('loadReplay fetches the static file once per farm, reports failures with a retryable error, and never caches a failure', async () => {
  const body = syntheticReplay({ endYear: 1983 }).replay, cache = new Map(), urls = [];
  const ok = async url => { urls.push(url); return { ok: true, json: async () => structuredClone(body) }; };
  const first = await loadReplay(SYNTHETIC_FARM, { fetcher: ok, cache });
  assert.equal(await loadReplay(SYNTHETIC_FARM, { fetcher: ok, cache }), first);
  assert.deepEqual(urls, ['/data/synthetic/replay.json']);
  assert.ok(urls.every(url => !/nasa|usda/i.test(url)));
  const failing = new Map();
  await assert.rejects(loadReplay(SYNTHETIC_FARM, { fetcher: async () => ({ ok: false }), cache: failing }), new RegExp(REPLAY_LOAD_ERROR));
  await assert.rejects(loadReplay(SYNTHETIC_FARM, { fetcher: async () => { throw new TypeError('network down'); }, cache: failing }), new RegExp(REPLAY_LOAD_ERROR));
  await assert.rejects(loadReplay(SYNTHETIC_FARM, { fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } }), cache: failing }), new RegExp(REPLAY_LOAD_ERROR));
  await assert.rejects(loadReplay(SYNTHETIC_FARM, { fetcher: async () => ({ ok: true, json: async () => ({ ...structuredClone(body), days: 3 }) }), cache: failing }), new RegExp(REPLAY_LOAD_ERROR));
  assert.equal(failing.size, 0);
  assert.equal((await loadReplay(SYNTHETIC_FARM, { fetcher: ok, cache: failing })).days, body.days);
});
