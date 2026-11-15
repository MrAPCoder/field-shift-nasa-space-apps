// SYNTHETIC fixtures for M5 unit tests. These values are NOT NASA measurements and
// must never be rendered as real results. Default weather is deliberately bland:
// 5 mm of precipitation every day, 20 °C highs, 5 °C lows, wetness 0.5.
import { readFileSync } from 'node:fs';
export const SYNTHETIC_FARM = { id: 'synthetic', name: 'SYNTHETIC TEST FARM', latitude: 1.5, longitude: -2.5 };
export const simConfig = JSON.parse(readFileSync(new URL('../src/config/config.json', import.meta.url), 'utf8')).simulation;
const DAY = 86400000;
export function syntheticReplay({ startYear = 1981, endYear = 2025, rain = 5, tmax = 20, tmin = 5, wet = 0.5 } = {}) {
  const days = Math.round((Date.UTC(endYear, 11, 31) - Date.UTC(startYear, 0, 1)) / DAY) + 1;
  const replay = { schema: 'field-shift-replay', schema_version: 1,
    farm: { id: SYNTHETIC_FARM.id, latitude: SYNTHETIC_FARM.latitude, longitude: SYNTHETIC_FARM.longitude },
    start: `${startYear}-01-01`, end: `${endYear}-12-31`, time_standard: 'LST', days,
    units: { PRECTOTCORR: 'mm/day', T2M_MAX: 'C', T2M_MIN: 'C', GWETROOT: '1' },
    series: { PRECTOTCORR: Array(days).fill(rain), T2M_MAX: Array(days).fill(tmax), T2M_MIN: Array(days).fill(tmin), GWETROOT: Array(days).fill(wet) },
    provenance: { source: 'SYNTHETIC TEST FIXTURE', raw_files: [{ path: 'synthetic/none.json.gz', sha256: '0'.repeat(64) }], built_at: '2026-11-15T00:00:00+00:00', builder: 'tests/synthetic-replay.js' } };
  const index = iso => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(startYear, 0, 1)) / DAY);
  // set('PRECTOTCORR', '1990-06-01', '1990-06-30', 0) fills an inclusive date range.
  const set = (name, from, to, value) => { for (let i = index(from); i <= index(to); i++) replay.series[name][i] = value; return replay; };
  return { replay, index, set };
}
// A complete SYNTHETIC calendar: every month one status and one exposure percentage.
export function syntheticCalendar(status = 'cash', exposed = 50, overrides = {}) {
  return Array.from({ length: 36 }, (_, i) => ({ year: Math.floor(i / 12) + 1, month: i % 12 + 1, status, exposed_percent: status === 'bare' ? 100 : exposed, ...(overrides[i] ?? {}) }));
}
