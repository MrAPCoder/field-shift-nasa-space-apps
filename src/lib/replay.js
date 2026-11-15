// M5: validated daily NASA POWER replay cache and UTC day-index helpers.
// The replay is static JSON built offline by scripts/build_replay.py. Nothing here
// contacts NASA; the only request is for the app's own public/data file.
export const REPLAY_SCHEMA = 'field-shift-replay';
export const REPLAY_VERSION = 1;
export const REPLAY_UNITS = { PRECTOTCORR: 'mm/day', T2M_MAX: 'C', T2M_MIN: 'C', GWETROOT: '1' };
export const REPLAY_SERIES = Object.keys(REPLAY_UNITS);
// Error screens (same limits as the M1 pipeline), not climatological validation.
const BOUNDS = { PRECTOTCORR: [0, 2000], T2M_MAX: [-90, 65], T2M_MIN: [-90, 65], GWETROOT: [0, 1] };
const DAY_MS = 86400000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
export const REPLAY_LOAD_ERROR = 'Simulation data could not be loaded';

function utcMs(iso) {
  const match = ISO.exec(iso ?? '');
  if (!match) return NaN;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? ms : NaN;
}

/** Fail closed: a replay that is incomplete or belongs to another location is never used. */
export function validateReplay(data, farm) {
  const fail = detail => { throw new Error(`${REPLAY_LOAD_ERROR}: ${detail}`); };
  if (data?.schema !== REPLAY_SCHEMA || data.schema_version !== REPLAY_VERSION) fail('unexpected replay schema.');
  if (!farm || data.farm?.id !== farm.id || data.farm.latitude !== farm.latitude || data.farm.longitude !== farm.longitude) fail('the replay does not match this location.');
  const start = utcMs(data.start), end = utcMs(data.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) fail('invalid period.');
  if (!data.start.endsWith('-01-01') || !data.end.endsWith('-12-31')) fail('the replay must cover complete calendar years.');
  if (data.time_standard !== 'LST') fail('unexpected time standard.');
  const days = Math.round((end - start) / DAY_MS) + 1;
  if (data.days !== days) fail('day count does not match the period.');
  for (const name of REPLAY_SERIES) {
    if (data.units?.[name] !== REPLAY_UNITS[name]) fail(`unexpected units for ${name}.`);
    const column = data.series?.[name];
    if (!Array.isArray(column) || column.length !== days) fail(`${name} does not have exactly ${days} days.`);
    const [lo, hi] = BOUNDS[name];
    for (let i = 0; i < days; i++) {
      const value = column[i];
      if (value !== null && !(typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi)) fail(`invalid ${name} value.`);
    }
  }
  const { T2M_MIN: low, T2M_MAX: high } = data.series;
  for (let i = 0; i < days; i++) if (low[i] !== null && high[i] !== null && low[i] > high[i]) fail('minimum temperature exceeds maximum.');
  const files = data.provenance?.raw_files;
  if (!Array.isArray(files) || !files.length || files.some(file => typeof file?.path !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256 ?? ''))) fail('missing archive provenance.');
  // Weather is read-only for every simulation and comparison.
  for (const name of REPLAY_SERIES) Object.freeze(data.series[name]);
  Object.freeze(data.series);
  return data;
}

/** Index of a calendar date: index i is start + i days (UTC date arithmetic only). */
export function dayIndex(replay, year, month, day = 1) {
  return Math.round((Date.UTC(year, month - 1, day) - utcMs(replay.start)) / DAY_MS);
}
export function dateAt(replay, index) {
  if (!Number.isInteger(index) || index < 0 || index >= replay.days) throw new RangeError('Day index is outside the replay.');
  return new Date(utcMs(replay.start) + index * DAY_MS).toISOString().slice(0, 10);
}
/** [start, end) day indexes of one calendar month. Never reaches outside the archive. */
export function monthSpan(replay, year, month) {
  const start = dayIndex(replay, year, month), end = dayIndex(replay, month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);
  if (!Number.isInteger(month) || month < 1 || month > 12 || start < 0 || end > replay.days) throw new RangeError(`No archived weather for ${year}-${String(month).padStart(2, '0')}.`);
  return { start, end };
}
export function replayYears(replay) {
  return { first: Number(replay.start.slice(0, 4)), last: Number(replay.end.slice(0, 4)) };
}

const hashes = new WeakMap();
/** Deterministic fingerprint of location, period and every daily value. Not cryptographic. */
export function replayHash(replay) {
  if (hashes.has(replay)) return hashes.get(replay);
  let a = 0x811c9dc5, b = 0x01000193;
  const mix = n => { a = Math.imul(a ^ n, 0x01000193) >>> 0; b = Math.imul(b + n, 0x85ebca6b) >>> 0; b ^= b >>> 13; };
  for (const char of `${replay.farm.id}|${replay.farm.latitude}|${replay.farm.longitude}|${replay.start}|${replay.end}|${replay.days}`) mix(char.codePointAt(0));
  for (const name of REPLAY_SERIES) {
    mix(name.length);
    for (const value of replay.series[name]) mix(value === null ? 0x7fffffff : Math.round(value * 100) | 0);
  }
  const hash = a.toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  hashes.set(replay, hash);
  return hash;
}

const memory = new Map();
export function clearReplayCache() { memory.clear(); }
/** Fetched lazily on first Simulate, then kept in memory for the tab. */
export async function loadReplay(farm, { signal, fetcher = fetch, cache = memory } = {}) {
  if (cache.has(farm.id)) return cache.get(farm.id);
  let response;
  try {
    response = await fetcher(`${import.meta.env?.BASE_URL ?? '/'}data/${farm.id}/replay.json`, { signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error(`${REPLAY_LOAD_ERROR}: the saved replay file could not be fetched.`);
  }
  if (!response.ok) throw new Error(`${REPLAY_LOAD_ERROR}: the saved replay file could not be fetched.`);
  let body;
  try { body = await response.json(); } catch { throw new Error(`${REPLAY_LOAD_ERROR}: the saved replay file is not valid JSON.`); }
  const replay = validateReplay(body, farm);
  cache.set(farm.id, replay);
  return replay;
}
