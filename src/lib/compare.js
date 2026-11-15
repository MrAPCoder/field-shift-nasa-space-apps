// M5: paired before/after comparison of two plans under identical weather.
// Changing a plan never changes weather: both simulations must come from the same
// replay (same fingerprint) and the same start years, or compare() throws.
import { FAMILY_TITLES, CHIPS } from './concerns.js';

// Wording that must never appear in comparison output.
export const BANNED_WORDING = [/erosion\s+reduc/i, /water\s+sav/i, /yield/i, /profit/i, /soil\s+loss/i];
const PAIRED = {
  exposed: { phrase: 'less precipitation on assumed-exposed soil', metric: 'Precipitation on assumed-exposed soil per replay', unit: 'mm', digits: 0, value: run => run.exposed.exposedMm },
  dry: { phrase: 'a shorter longest in-crop dry spell', metric: 'Longest in-crop dry spell per replay', unit: 'days', digits: 0, value: run => run.dry.value },
  heat: { phrase: 'fewer in-crop hot days', metric: 'In-crop hot days in the hottest plan year', unit: 'days', digits: 0, value: run => run.heat.value },
  frost: { phrase: 'fewer in-crop shoulder-month frost days', metric: 'In-crop shoulder-month frost days in the frostiest plan year', unit: 'days', digits: 0, value: run => run.frost.value },
};
const EPSILON = 1e-9;

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => value === b[i]);
const format = (value, digits) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);

function side(summary) {
  return { status: summary.status, flagged: summary.flaggedRuns, valid: summary.validRuns, frequency: summary.frequency, qualifies: summary.qualifies, reason: summary.reason ?? null };
}

export function compare(before, after) {
  if (!before?.replayHash || before.replayHash !== after?.replayHash) throw new Error('Before and after must use the same weather replay.');
  if (!sameList(before.startYears, after.startYears)) throw new Error('Before and after must use the same replay start years.');
  const order = before.config.familyOrder;
  const families = order.map(family => {
    const b = side(before.families[family]), a = side(after.families[family]), spec = PAIRED[family];
    const row = { family, title: FAMILY_TITLES[family], before: b, after: a, chip: CHIPS.simulated, frequencyText: null, delta: null, paired: null };
    if (b.status === 'evaluated' && a.status === 'evaluated') {
      row.frequencyText = b.valid === a.valid ? `${b.flagged} → ${a.flagged} of ${b.valid} replays` : `${b.flagged} of ${b.valid} → ${a.flagged} of ${a.valid} replays`;
      row.delta = b.valid === a.valid ? a.flagged - b.flagged : null;
      const pairs = before.runs.map((run, i) => [run, after.runs[i]]).filter(([x, y]) => x[family].valid && y[family].valid).map(([x, y]) => [spec.value(x), spec.value(y)]);
      if (pairs.length) {
        const less = pairs.filter(([x, y]) => y < x - EPSILON).length, more = pairs.filter(([x, y]) => y > x + EPSILON).length;
        const medianBefore = median(pairs.map(pair => pair[0])), medianAfter = median(pairs.map(pair => pair[1]));
        row.paired = { runs: pairs.length, less, more, same: pairs.length - less - more, medianBefore, medianAfter, unit: spec.unit, metric: spec.metric,
          medianText: `median ${format(medianBefore, spec.digits)} → ${format(medianAfter, spec.digits)} ${spec.unit}`,
          text: `${spec.phrase} in ${less} of ${pairs.length} replays` + (more ? `; more in ${more}` : '') };
      }
    } else if (b.status === 'evaluated') row.frequencyText = `${b.flagged} of ${b.valid} replays → not evaluated`;
    else if (a.status === 'evaluated') row.frequencyText = `not evaluated → ${a.flagged} of ${a.valid} replays`;
    else row.frequencyText = 'not evaluated in either plan';
    return row;
  });
  const qualified = simulation => order.filter(family => simulation.families[family].status === 'evaluated' && simulation.families[family].qualifies);
  const was = qualified(before), now = qualified(after);
  return {
    replayHash: before.replayHash, startYears: before.startYears, runCount: before.startYears.length, farmId: before.farmId,
    families,
    exposed: families.find(row => row.family === 'exposed').paired,
    appeared: now.filter(family => !was.includes(family)).map(family => ({ family, title: FAMILY_TITLES[family] })),
    disappeared: was.filter(family => !now.includes(family)).map(family => ({ family, title: FAMILY_TITLES[family] })),
    noLongerEvaluated: families.filter(row => row.before.status === 'evaluated' && row.after.status !== 'evaluated').map(row => ({ family: row.family, title: row.title, reason: row.after.reason })),
    note: 'Same weather, same start years: only the plan changed. Months changed to a crop or cover status count as crop months in the dry, heat and frost screens.',
  };
}

/** All human-readable strings in a comparison, for wording checks. */
export function comparisonText(result) {
  return [result.note, ...result.families.flatMap(row => [row.title, row.frequencyText, row.paired?.text, row.paired?.medianText, row.paired?.metric]),
    ...result.appeared.map(item => item.title), ...result.disappeared.map(item => item.title)].filter(Boolean).join(' | ');
}
