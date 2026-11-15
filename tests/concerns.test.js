// M5 concern identification, ranking and card text. Weather and calendars are SYNTHETIC
// fixtures (./synthetic-replay.js), not NASA measurements or farm data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReplay } from '../src/lib/replay.js';
import { planFromCalendar, planFromWindow, simulate, REASONS } from '../src/lib/simulate.js';
import { evaluateConcerns, ruleText, evidenceText, wetnessText, leverFor, describePlan, thresholdRows, howOftenText, ordinal,
  CHIPS, UNCERTAINTY, NO_CONCERN_MESSAGE, IRRIGATION_NOTE, FAMILY_TITLES, WHY } from '../src/lib/concerns.js';
import { syntheticReplay, syntheticCalendar, simConfig, SYNTHETIC_FARM } from './synthetic-replay.js';
const fixture = (build = () => {}) => { const f = syntheticReplay(); build(f); validateReplay(f.replay, SYNTHETIC_FARM); return f.replay; };
const everyYear = (f, name, from, to, value) => { for (let year = 1981; year <= 2025; year++) f.set(name, `${year}-${from}`, `${year}-${to}`, value); };
const allYear = planFromWindow(1, 12);
const calendar = (exposed, source = 'farmer_confirmed') => planFromCalendar(syntheticCalendar('cash', exposed), { source });

test('dry card: exact template text, real dates, provenance chips, irrigation note', () => {
  // SYNTHETIC: 25-day June spells in six years and one 47-day spell in 2021 → 21 of 43 replays.
  const replay = fixture(f => {
    for (const year of [1985, 1990, 1995, 2000, 2005, 2010]) f.set('PRECTOTCORR', `${year}-06-01`, `${year}-06-25`, 0.2);
    f.set('PRECTOTCORR', '2021-06-03', '2021-07-19', 0);
  });
  const result = evaluateConcerns(simulate(replay, allYear, simConfig));
  assert.equal(result.concerns.length, 1);
  const card = result.concerns[0];
  assert.equal(card.family, 'dry');
  assert.equal(card.title, 'Long dry spells during crop months');
  assert.equal(card.howOften, '21 of 43 historical replays');
  assert.equal(card.rule, '21+ consecutive in-crop days < 1 mm — provisional screen');
  assert.equal(card.evidence, '2021-06-03 → 2021-07-19: 47 in-crop days without ≥1 mm (replay 2019–2021)');
  assert.equal(card.uncertainty, 'Gridded data (~50 km), not your field. Irrigation and soil storage are not modeled. Overlapping replays are not independent.');
  assert.equal(card.uncertainty, UNCERTAINTY);
  assert.deepEqual(card.notes, [IRRIGATION_NOTE]);
  assert.match(IRRIGATION_NOTE, /Irrigation.*may offset/);
  assert.deepEqual([card.howOftenChip, card.evidenceChip, card.assumptionChip, card.context.chip], [CHIPS.simulated, CHIPS.nasa, CHIPS.farmer, CHIPS.model]);
  assert.match(card.context.text, /^Modeled root-zone wetness in the crop months of 2021 averaged the 50th percentile of the same calendar months in 1991–2020 \(30 reference years\)\. Context only/);
  assert.equal(card.why, WHY.dry);
  assert.deepEqual(card.lever, { id: 'window', label: 'Try a different growing window' });
  assert.equal(card.flags.length, 43);
  assert.equal(card.flags.filter(Boolean).length, 21);
  assert.deepEqual(card.startYears, Array.from({ length: 43 }, (_, i) => 1981 + i));
  assert.equal(card.status, 'provisional');
  assert.deepEqual(result.notEvaluated.map(item => [item.family, item.reason]), [['exposed', REASONS.climateOnly]]);
  assert.deepEqual(result.belowBar.map(item => item.family), ['heat', 'frost']);
  assert.equal(result.message, null);
});

test('heat, frost and exposed evidence templates use the worst replay with dates and values', () => {
  const replay = fixture(f => {
    everyYear(f, 'T2M_MAX', '07-10', '07-15', 33);
    f.set('T2M_MAX', '2021-06-26', '2021-07-02', 39); f.set('T2M_MAX', '2021-06-29', '2021-06-29', 41.13);
    everyYear(f, 'T2M_MIN', '04-02', '04-02', -1);
    f.set('T2M_MIN', '1984-04-01', '1984-04-09', -2); f.set('T2M_MIN', '1984-10-31', '1984-10-31', -8.04);
    f.set('PRECTOTCORR', '1999-01-01', '1999-12-31', 2);
  });
  const months = syntheticCalendar('cash', 20);
  for (let i = 24; i < 36; i++) months[i] = { ...months[i], status: 'bare', exposed_percent: 100 };
  const simulation = simulate(replay, planFromCalendar(months, { source: 'illustrative_demo', label: 'SYNTHETIC demo label' }), simConfig);
  const cards = Object.fromEntries(evaluateConcerns(simulation).concerns.map(card => [card.family, card]));
  assert.deepEqual(Object.keys(cards), ['exposed', 'heat', 'frost']);
  assert.equal(cards.heat.evidence, '2021: 13 in-crop days ≥ 32 °C; hottest 2021-06-29 at 41.1 °C (plan year 2, replay 2020–2022)', 'plan year 3 is bare here, so the earliest tied replay has 2021 as plan year 2');
  assert.equal(cards.heat.rule, '5+ in-crop days ≥ 32 °C in any plan year — provisional screen');
  assert.equal(cards.frost.evidence, '1984: 10 in-crop days ≤ 0 °C in shoulder months, first 1984-04-01, last 1984-10-31; coldest 1984-10-31 at -8.0 °C (plan year 2, replay 1983–1985)');
  assert.equal(cards.frost.rule, '1+ in-crop day ≤ 0 °C in Apr, May, Jun, Sep, Oct in any plan year — provisional screen');
  // Exposed: plan year 3 is bare → 100%; worst metric ties at 1.0, earliest replay (1981 → calendar 1983) wins.
  assert.equal(cards.exposed.evidence, '1983: 1,825.0 mm of 1,825.0 mm precipitation (100%) fell on assumed-exposed soil (plan year 3, replay 1981–1983)');
  assert.equal(cards.exposed.rule, '25%+ of a plan year’s precipitation on assumed-exposed soil — provisional screen');
  assert.equal(cards.exposed.assumptionChip, CHIPS.demo, 'demo assumptions are labeled as illustrative, never as farmer input');
  assert.match(cards.exposed.assumption, /SYNTHETIC demo label/);
  assert.equal(cards.exposed.context, null, 'GWETROOT context appears on the Dry card only');
  assert.deepEqual(cards.exposed.lever, { id: 'cover', label: 'Try keeping cover or residue in the most-exposed months' });
  for (const card of Object.values(cards)) assert.match(card.rule, /provisional screen$/);
});

test('ranking: frequency descending, ties by familyOrder, at most three, never padded', () => {
  // SYNTHETIC: all four families flagged in all 43 replays.
  const replay = fixture(f => { everyYear(f, 'PRECTOTCORR', '07-01', '07-31', 0); everyYear(f, 'T2M_MAX', '08-01', '08-10', 35); everyYear(f, 'T2M_MIN', '05-01', '05-01', -1); });
  const simulation = simulate(replay, calendar(60), simConfig);
  const all = evaluateConcerns(simulation);
  assert.deepEqual(all.concerns.map(card => card.family), ['exposed', 'dry', 'heat']);
  assert.deepEqual(all.qualified, ['exposed', 'dry', 'heat', 'frost']);
  assert.deepEqual(all.alsoQualified.map(item => [item.family, item.howOften]), [['frost', '43 of 43 historical replays']]);
  assert.equal(all.concerns.length, 3);
  // The tie order is the configured planning convention and nothing else.
  const reversed = evaluateConcerns({ ...simulation, config: { ...simConfig, familyOrder: ['frost', 'heat', 'dry', 'exposed'] } });
  assert.deepEqual(reversed.concerns.map(card => card.family), ['frost', 'heat', 'dry']);
  assert.deepEqual(evaluateConcerns(simulation), all, 'stable and deterministic');
  // Frequency outranks family order: heat 43/43, exposed 43/43, dry 9/43 → dry last; frost absent.
  const mixed = fixture(f => { everyYear(f, 'T2M_MAX', '08-01', '08-10', 35); for (const year of [1985, 1995, 2005]) f.set('PRECTOTCORR', `${year}-07-01`, `${year}-07-31`, 0); });
  const ranked = evaluateConcerns(simulate(mixed, calendar(60), simConfig));
  assert.deepEqual(ranked.concerns.map(card => [card.family, card.flagged]), [['exposed', 43], ['heat', 43], ['dry', 9]]);
  assert.deepEqual(ranked.belowBar.map(item => item.family), ['frost']);
  // Lower-order family with higher frequency ranks first.
  const frostFirst = fixture(f => { everyYear(f, 'T2M_MIN', '05-01', '05-01', -1); for (const year of [1985, 1995, 2005]) f.set('PRECTOTCORR', `${year}-07-01`, `${year}-07-31`, 0); });
  assert.deepEqual(evaluateConcerns(simulate(frostFirst, allYear, simConfig)).concerns.map(card => card.family), ['frost', 'dry']);
});

test('no qualifying family → empty list and the exact "not evidence of low risk" message', () => {
  // SYNTHETIC: 8 of 43 replays (18.6%) is below the 1-in-5 bar.
  const replay = fixture(f => { for (const year of [1985, 2005]) f.set('T2M_MAX', `${year}-07-01`, `${year}-07-10`, 36); f.set('T2M_MAX', '1981-07-01', '1981-07-10', 36); f.set('T2M_MAX', '2025-07-01', '2025-07-10', 36); });
  const result = evaluateConcerns(simulate(replay, allYear, simConfig));
  assert.deepEqual(result.concerns, []);
  assert.equal(result.message, 'No screening concern met the bar in these replays. This is not evidence of low risk.');
  assert.equal(result.message, NO_CONCERN_MESSAGE);
  assert.deepEqual(result.belowBar.map(item => [item.family, item.howOften]), [['dry', '0 of 43 historical replays'], ['heat', '8 of 43 historical replays'], ['frost', '0 of 43 historical replays']]);
  assert.deepEqual(result.alsoQualified, []);
});

test('missing inputs are "Not evaluated" with a reason, never a card and never "low"', () => {
  // SYNTHETIC: precipitation missing on one in-crop day per year through 2006 → 17 valid dry replays.
  const replay = fixture(f => { for (let year = 1981; year <= 2006; year++) f.set('PRECTOTCORR', `${year}-06-01`, `${year}-06-01`, null); everyYear(f, 'PRECTOTCORR', '07-01', '07-31', 0); });
  const result = evaluateConcerns(simulate(replay, allYear, simConfig));
  assert.deepEqual(result.notEvaluated.map(item => item.family), ['exposed', 'dry']);
  assert.match(result.notEvaluated[1].reason, /Only 17 of 43 replays had complete inputs; at least 20 are required/);
  assert.ok(!result.concerns.some(card => card.family === 'dry'));
  assert.ok(!result.belowBar.some(item => item.family === 'dry'));
  const unknown = syntheticCalendar('cash', 30, { 4: { status: 'unknown', exposed_percent: null } });
  const partial = evaluateConcerns(simulate(fixture(), planFromCalendar(unknown, { source: 'farmer_whatif' }), simConfig));
  assert.deepEqual(partial.notEvaluated, [{ family: 'exposed', title: FAMILY_TITLES.exposed, reason: REASONS.incomplete }]);
  assert.match(REASONS.incomplete, /unknown is never treated as bare soil/);
  assert.match(REASONS.climateOnly, /Enter or confirm a field calendar below/);
});

test('levers, plan provenance and helper wording', () => {
  assert.equal(leverFor('exposed', calendar(30), 'palouse').id, 'cover');
  assert.equal(leverFor('dry', calendar(30), 'palouse').id, 'rotation');
  assert.equal(leverFor('heat', allYear, 'palouse').id, 'window');
  assert.equal(leverFor('frost', planFromWindow(4, 9), 'yakima').id, 'window');
  assert.equal(leverFor('dry', calendar(30), 'skagit'), null);
  assert.deepEqual(describePlan(planFromWindow(10, 7)), { kind: 'Climate-only growing window', label: 'Climate-only growing window Oct → Jul, repeated each plan year', chip: CHIPS.farmer });
  assert.equal(describePlan(calendar(30, 'illustrative_demo')).chip, CHIPS.demo);
  assert.equal(describePlan(calendar(30, 'farmer_confirmed')).chip, CHIPS.farmer);
  assert.match(describePlan(calendar(30, 'farmer_whatif')).label, /unconfirmed/);
  assert.equal(howOftenText(31, 43), '31 of 43 historical replays');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 39, 50.4, 100].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '39th', '50th', '100th']);
  assert.match(wetnessText(null), /unavailable/);
  assert.equal(ruleText('dry', { ...simConfig, dryDayMm: 2.5, drySpellDays: 14, status: 'approved' }), '14+ consecutive in-crop days < 2.5 mm — approved screen');
  assert.match(evidenceText('dry', { spell: null }, simConfig), /No in-crop day below 1 mm/);
  assert.match(evidenceText('heat', { value: 0 }, simConfig), /No in-crop day reached 32 °C/);
  assert.match(evidenceText('frost', { value: 0 }, simConfig), /No in-crop shoulder-month day at or below 0 °C/);
  const rows = thresholdRows(simConfig);
  assert.equal(rows.length, 10);
  assert.ok(rows.every(row => row.status === 'provisional'));
  assert.deepEqual(rows.find(row => row.label === 'Concern bar').value, 'screen met in at least 20% of valid replays');
  assert.deepEqual(Object.values(CHIPS), ['Historical NASA weather', 'Model estimate (GWETROOT)', 'Farmer assumption', 'Illustrative demo assumption', 'Simulated indicator']);
  // Generic wording: no crop-specific claims and "precipitation", not "rain impact".
  for (const text of [...Object.values(WHY), ...Object.values(FAMILY_TITLES), UNCERTAINTY]) assert.doesNotMatch(text, /wheat|pea|barley|corn|potato|rain impact|will (fail|die|be damaged)/i);
});
