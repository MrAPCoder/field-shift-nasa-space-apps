import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const config = read('../src/config/config.json');
for (const farm of config.farms) {
  test(`${farm.name}: cached M1 contract`, () => {
    const data = read(`../public/data/${farm.id}/climate.json`);
    assert.deepEqual(data.farm, farm);
    assert.equal(data.annual.length, 45);
    assert.equal(data.monthly.length, 12);
    assert.equal(data.quality.duplicate_dates, 0);
    for (const coverage of Object.values(data.coverage)) {
      assert.equal(coverage.expected_days, 16436);
      assert.equal(coverage.valid_days + coverage.missing_days, coverage.expected_days);
    }
    assert.ok(Math.abs(data.monthly.reduce((s,m) => s + m.rainfall_share_percent, 0)-100) < 1e-8);
    for (const source of data.provenance) assert.ok(existsSync(new URL(`../public/data/${farm.id}/${source.file}`, import.meta.url)));
    for (const key of ['rainfall_mm', 'frost_free_days', 'hot_days']) {
      const values = data.annual.map(a => a[key]).filter(v => v !== null);
      assert.equal(data.summary[`${key}_valid_years`], values.length);
      assert.ok(Math.abs(data.summary[`mean_${key}`]-values.reduce((a,b)=>a+b,0)/values.length) < 1e-8);
    }
  });
}
