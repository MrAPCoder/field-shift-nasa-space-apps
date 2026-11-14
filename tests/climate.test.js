import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateClimate, loadClimate, chartRows, formatValue } from '../src/lib/climate.js';
const data = JSON.parse(readFileSync(new URL('../public/data/skagit/climate.json', import.meta.url)));
const farm = data.farm;
test('chart rows preserve NASA values and calendar order', () => {
  const rows = chartRows(validateClimate(data, farm));
  assert.equal(rows[0].name, 'Jan'); assert.equal(rows[11].name, 'Dec');
  rows.forEach((row, i) => { assert.equal(row.rainfall_normal_mm, data.monthly[i].rainfall_normal_mm); assert.equal(row.gwetroot_mean, data.monthly[i].gwetroot_mean); });
});
test('missing values are unavailable, never zero', () => {
  const copy = structuredClone(data);
  copy.monthly[0].rainfall_normal_mm = null; copy.monthly[0].gwetroot_mean = null; copy.summary.mean_hot_days = null;
  validateClimate(copy, farm);
  assert.equal(chartRows(copy)[0].rainfall_normal_mm, null);
  for (const value of [null, undefined, NaN]) assert.equal(formatValue(value), 'Unavailable');
  assert.equal(formatValue(0), '0.0');
});
test('reject mismatched location, units, month order, malformed summaries and coverage', () => {
  for (const mutate of [
    d => d.farm.id = 'yakima', d => d.farm.latitude = 0, d => d.units.GWETROOT = '%',
    d => d.monthly.pop(), d => d.monthly[0].month = 12, d => d.monthly[0].gwetroot_mean = 2,
    d => delete d.summary, d => delete d.annual, d => d.coverage.GWETROOT.percent = 101,
    d => d.monthly[0].gwetroot_expected_days = 0,
  ]) { const copy = structuredClone(data); mutate(copy); assert.throws(() => validateClimate(copy, farm)); }
});
test('loader uses only local cache and forwards cancellation signal', async () => {
  const controller = new AbortController();
  const loaded = await loadClimate(farm, { signal: controller.signal, fetcher: async (url, options) => {
    assert.equal(url, '/data/skagit/climate.json'); assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => data };
  } }); assert.equal(loaded, data);
});
test('HTTP and malformed JSON failures propagate for the retry state', async () => {
  await assert.rejects(loadClimate(farm, { fetcher: async () => ({ ok: false }) }), /could not be loaded/);
  await assert.rejects(loadClimate(farm, { fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } }) }), SyntaxError);
});
