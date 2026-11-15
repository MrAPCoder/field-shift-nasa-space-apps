import React, { useState } from 'react';
import demoData from '../../data/demo-scenarios.json';
import { planFromCalendar, planFromWindow, topExposedMonths } from '../lib/simulate.js';
import { describePlan, planMonthLabel, monthName, CHIPS } from '../lib/concerns.js';
import { managementIssues, rangeEdit } from '../lib/management.js';
import { STATUS_LABELS } from '../lib/plan.js';
import { Chip } from './ConcernCard.jsx';
import { WindowSelects } from './SimSetup.jsx';

const LEVER_LABELS = { cover: 'Keep cover or residue in selected months', rotation: 'Choose a different Palouse research rotation', window: 'Change the growing window' };
const windowLabel = (start, end) => `${monthName(Number(start))} → ${monthName(Number(end))}`;

/** Which of the three allowed levers apply to the plan that was simulated. */
export function availableLevers(before) {
  const levers = [];
  if (before.simulation.families.exposed.status === 'evaluated') levers.push('cover');
  if (before.farmId === 'palouse') levers.push('rotation');
  if (before.simulation.plan.kind === 'window') levers.push('window');
  return levers;
}

// Lever A. Demo: apply the illustrative improved calendar. Farmer: a what-if range edit of the
// three plan months with the most precipitation on assumed-exposed soil; the farmer enters every value.
function CoverLever({ before, onApply }) {
  const top = topExposedMonths(before.simulation, 3);
  const [rows, setRows] = useState(() => Object.fromEntries(top.map(index => [index, { status: 'cover', exposure: '' }])));
  const [error, setError] = useState(null);
  if (before.demo) {
    const improved = demoData.scenarios.improved;
    return <div className="lever-panel">
      <p>{improved.description} <Chip label={CHIPS.demo}/></p>
      <p className="sim-fine">Baseline non-crop months are bare (100% exposed). These are illustrative values pending team review, not measured cover or a recommendation.</p>
      <button type="button" className="lever-apply" onClick={() => onApply(planFromCalendar(improved.months, { source: 'illustrative_demo', label: improved.label, rotationId: demoData.rotation_id }), LEVER_LABELS.cover)}>Apply the illustrative improved calendar</button>
    </div>;
  }
  const calendar = before.calendarRef;
  const apply = () => {
    try {
      let edited = calendar;
      for (const index of top) {
        const { status, exposure } = rows[index];
        if (exposure === '' || !Number.isFinite(Number(exposure))) throw new Error('Enter an explicit exposure from 0 to 100 for every listed month.');
        edited = rangeEdit(edited, index, index, status, Number(exposure));
      }
      setError(null);
      const summary = top.map(index => `${planMonthLabel(index)} → ${STATUS_LABELS[rows[index].status].toLowerCase()} at ${Number(rows[index].exposure)}%`).join('; ');
      onApply(planFromCalendar(edited.months, { source: 'farmer_whatif', rotationId: before.rotationId, label: `What-if edit of your confirmed calendar (unconfirmed): ${summary}` }), LEVER_LABELS.cover);
    } catch (problem) { setError(problem.message); }
  };
  return <div className="lever-panel">
    <p>These are the {top.length} plan months with the most precipitation on assumed-exposed soil across the replays. Enter the status and exposed-soil percentage you would aim for; nothing is prefilled or assumed for you. <Chip label={CHIPS.farmer}/></p>
    <div className="lever-months">{top.map(index => {
      const current = before.simulation.plan.months[index];
      return <fieldset key={index}><legend>{planMonthLabel(index)}</legend>
        <p className="sim-fine">Now: {STATUS_LABELS[current.status]} · {current.exposedPercent}% exposed <Chip label={CHIPS.farmer}/></p>
        <label>What-if status<select aria-label={`${planMonthLabel(index)} what-if status`} value={rows[index].status} onChange={event => setRows({ ...rows, [index]: { ...rows[index], status: event.target.value } })}><option value="cover">Cover crop</option><option value="cash">Planted crop (residue retained)</option></select></label>
        <label>What-if exposed soil (%)<input type="number" min="0" max="100" step="any" aria-label={`${planMonthLabel(index)} what-if exposed soil percent`} value={rows[index].exposure} onChange={event => setRows({ ...rows, [index]: { ...rows[index], exposure: event.target.value } })}/></label>
      </fieldset>;
    })}</div>
    {error && <p className="sim-hint" role="status">{error}</p>}
    <p className="sim-fine">This what-if is not saved to your field calendar and is not confirmed. To keep it, edit and confirm the calendar in the rotation comparison below.</p>
    <button type="button" className="lever-apply" onClick={apply}>Replay with these what-if months</button>
  </div>;
}

// Lever B (Palouse only). Uses the target rotation's confirmed farmer calendar when one exists
// (never in the demo); otherwise climate-only with a growing window, and exposed is not evaluated.
function RotationLever({ before, rotations, management, defaultWindow, onApply }) {
  const others = rotations.filter(rotation => rotation.id !== before.rotationId);
  const [target, setTarget] = useState(others[0]?.id ?? '');
  const [months, setMonths] = useState(defaultWindow);
  const calendar = before.demo ? null : management?.[target];
  const confirmed = Boolean(calendar) && managementIssues(calendar, target).length === 0;
  const name = rotations.find(rotation => rotation.id === target)?.name;
  const ready = confirmed || (months.start && months.end);
  const apply = () => onApply(confirmed
    ? planFromCalendar(calendar.months, { source: 'farmer_confirmed', rotationId: target, label: `Farmer-confirmed field calendar — ${name}` })
    : planFromWindow(Number(months.start), Number(months.end), { rotationId: target, label: `${name}: climate-only growing window ${windowLabel(months.start, months.end)}, repeated each plan year` }),
  `${LEVER_LABELS.rotation}: ${name}`);
  return <div className="lever-panel">
    <label htmlFor="lever-rotation">Research rotation to replay</label>
    <select id="lever-rotation" value={target} onChange={event => setTarget(event.target.value)}>{others.map(rotation => <option key={rotation.id} value={rotation.id}>{rotation.name}</option>)}</select>
    {confirmed
      ? <p className="sim-status">This rotation has a confirmed field calendar; it will be replayed as entered. <Chip label={CHIPS.farmer}/></p>
      : <><p className="sim-status">{before.demo ? 'The demo has no illustrative calendar for this rotation.' : 'No confirmed field calendar for this rotation.'} Weather screens will use the crop months you choose here, and exposed-soil precipitation will not be evaluated. A research sequence alone does not supply crop months or cover. <Chip label={CHIPS.farmer}/></p>
        <WindowSelects idPrefix="lever-rotation-window" start={months.start} end={months.end} onChange={(start, end) => setMonths({ start, end })}/></>}
    <button type="button" className="lever-apply" disabled={!ready} onClick={apply}>Replay this rotation</button>
  </div>;
}

// Lever C (climate-only plans).
function WindowLever({ before, onApply }) {
  const current = before.simulation.plan.window;
  const [months, setMonths] = useState({ start: String(current.start), end: String(current.end) });
  const same = Number(months.start) === current.start && Number(months.end) === current.end;
  return <div className="lever-panel">
    <p>Now: {windowLabel(current.start, current.end)}. Choose different crop months and replay the same weather. <Chip label={CHIPS.farmer}/></p>
    <WindowSelects idPrefix="lever-window" start={months.start} end={months.end} onChange={(start, end) => setMonths({ start, end })}/>
    <button type="button" className="lever-apply" disabled={!months.start || !months.end || same} onClick={() => onApply(planFromWindow(Number(months.start), Number(months.end), { rotationId: before.rotationId }), LEVER_LABELS.window)}>Replay with this growing window</button>
  </div>;
}

function Side({ value }) {
  return value.status === 'evaluated' ? <>{value.flagged} of {value.valid}</> : <span title={value.reason ?? undefined}>Not evaluated</span>;
}

export function ComparisonTable({ comparison }) {
  return <div className="table-scroll"><table className="compare-table" data-testid="compare-table">
    <caption>Replays that met each provisional screen, before and after — same weather, same {comparison.runCount} start years. <Chip label={CHIPS.simulated}/></caption>
    <thead><tr><th scope="col">Screen</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Change in these replays</th></tr></thead>
    <tbody>{comparison.families.map(row => <tr key={row.family} data-family={row.family}>
      <th scope="row">{row.title}</th><td><Side value={row.before}/></td><td><Side value={row.after}/></td>
      <td><strong>{row.frequencyText}</strong>{row.paired && <><br/>{row.paired.metric}: {row.paired.medianText}; {row.paired.text}.</>}{row.after.status !== 'evaluated' && row.after.reason && <><br/>{row.after.reason}</>}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function ComparisonSummary({ before, after }) {
  const { comparison } = after, was = describePlan(before.simulation.plan), now = describePlan(after.simulation.plan);
  return <>
    <dl className="compare-plans">
      <div><dt>Before</dt><dd>{was.label} <Chip label={was.chip}/></dd></div>
      <div><dt>After</dt><dd>{now.label} <Chip label={now.chip}/></dd></div>
    </dl>
    <ComparisonTable comparison={comparison}/>
    <ul className="sim-other" data-testid="compare-changes">
      {comparison.disappeared.map(item => <li key={item.family}><strong>No longer meets the concern bar:</strong> {item.title}.{comparison.noLongerEvaluated.some(lost => lost.family === item.family) ? ' It is no longer evaluated in the “after” plan, which is not an improvement.' : ''}</li>)}
      {comparison.appeared.map(item => <li key={item.family}><strong>Newly meets the concern bar:</strong> {item.title}.</li>)}
      {!comparison.appeared.length && !comparison.disappeared.length && <li>The same screens meet the concern bar before and after.</li>}
      <li><strong>Meeting the concern bar after, most frequent first:</strong> {after.concerns.qualified.length ? after.concerns.qualified.map(family => { const row = comparison.families.find(item => item.family === family); return `${row.title} (${row.after.flagged} of ${row.after.valid})`; }).join(' · ') : after.concerns.message} <Chip label={CHIPS.simulated}/></li>
    </ul>
    <p className="sim-fine">{comparison.note} These are counts of historical replays under the stated assumptions, not predicted outcomes for a field.</p>
  </>;
}

export default function SimComparison({ before, after, lever, onLever, onApply, rotations, management, defaultWindow, error }) {
  const levers = availableLevers(before);
  return <>
    <div className="lever-tabs" role="group" aria-label="Choose one change to try">
      {levers.map(id => <button type="button" key={id} className="lever-tab" aria-pressed={lever === id} onClick={() => onLever(id)}>{LEVER_LABELS[id]}</button>)}
    </div>
    {!levers.includes(lever) && <p className="sim-fine">Choose one change. The same {before.simulation.startYears.length} weather replays are used, so only your plan differs.</p>}
    {lever === 'cover' && levers.includes('cover') && <CoverLever key={before.simulation.replayHash + before.simulation.plan.label} before={before} onApply={onApply}/>}
    {lever === 'rotation' && levers.includes('rotation') && <RotationLever before={before} rotations={rotations} management={management} defaultWindow={defaultWindow} onApply={onApply}/>}
    {lever === 'window' && levers.includes('window') && <WindowLever before={before} onApply={onApply}/>}
    {error && <p className="sim-hint" role="status">{error}</p>}
    {after && <div className="sim-compare" data-testid="sim-comparison">
      <h4>Before / after</h4>
      <ComparisonSummary before={before} after={after}/>
    </div>}
  </>;
}
