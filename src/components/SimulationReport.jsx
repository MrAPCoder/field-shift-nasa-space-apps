import React, { useEffect, useRef } from 'react';
import { MONTHS } from '../lib/climate.js';
import { DISCLAIMER, STATUS_LABELS } from '../lib/plan.js';
import { describePlan, thresholdRows, CHIPS, DEMO_BANNER, NOT_A_FORECAST, PROVISIONAL_NOTE } from '../lib/concerns.js';
import { Chip } from './ConcernCard.jsx';
import { ComparisonSummary } from './SimComparison.jsx';

const SOURCE_KIND = { illustrative_demo: 'Demo — illustrative calendar, not farm data', farmer_confirmed: 'Farmer-confirmed field calendar', farmer_whatif: 'What-if edit of a farmer calendar (unconfirmed)', growing_window: 'Climate-only — farmer-chosen growing window' };

function PlanTable({ plan, title }) {
  const info = describePlan(plan);
  return <div className="report-plan">
    <p><strong>{title}:</strong> {SOURCE_KIND[plan.source]}. {info.label} <Chip label={info.chip}/></p>
    {plan.kind === 'window'
      ? <p>Crop months in every plan year: {plan.months.slice(0, 12).filter(month => month.inCrop).map(month => MONTHS[month.month - 1]).join(', ')}. No field calendar, so exposed-soil precipitation is not evaluated.</p>
      : <div className="table-scroll"><table className="report-calendar"><caption>36-month plan: status and assumed exposed soil (%). Cash-crop and cover-crop months count as crop months. <Chip label={info.chip}/></caption>
        <thead><tr><th scope="col">Plan year</th>{MONTHS.map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead>
        <tbody>{[0, 1, 2].map(year => <tr key={year}><th scope="row">Year {year + 1}</th>{plan.months.slice(year * 12, year * 12 + 12).map(month => <td key={month.index} title={STATUS_LABELS[month.status]}>{month.status === 'unknown' ? 'Unknown' : `${{ cash: 'Crop', cover: 'Cover', bare: 'Bare' }[month.status]} ${month.exposedPercent ?? '?'}%`}</td>)}</tr>)}</tbody>
      </table></div>}
  </div>;
}

/** Print view of the current simulation. Uses window.print(); no PDF library. */
export default function SimulationReport({ farm, before, after, onClose }) {
  const panel = useRef(null);
  useEffect(() => {
    document.body.classList.add('sim-report-open');
    panel.current?.focus();
    return () => document.body.classList.remove('sim-report-open');
  }, []);
  const { simulation, concerns, replay } = before, c = simulation.config, years = simulation.startYears;
  return <section className="sim-report" aria-label="Printable simulation report" tabIndex="-1" ref={panel} data-testid="sim-report">
    <div className="plan-actions"><button type="button" onClick={() => window.print()}>Print this report</button><button type="button" onClick={onClose}>Close report view</button><p>Uses the simulation shown above. Select your browser’s Save as PDF or a printer.</p></div>
    <header><p className="section-kicker">FIELD SHIFT · NASA SPACE APPS 2026</p><h2>Historical replay simulation report</h2>
      <h3>{farm.name} · {farm.latitude.toFixed(4)}° N, {Math.abs(farm.longitude).toFixed(4)}° W (representative regional location)</h3>
      {before.demo && <p className="report-demo"><strong>HYPOTHETICAL DEMO.</strong> {DEMO_BANNER}</p>}
      <p>{NOT_A_FORECAST} The three-year plan is replayed through {years.length} overlapping historical windows, {years[0]}–{years[0] + 2} to {years.at(-1)}–{years.at(-1) + 2}; overlapping replays are not independent trials. The plan starts January 1 of plan year 1.</p></header>
    <section><h3>Plan source</h3>
      <PlanTable plan={simulation.plan} title="Simulated plan"/>
      {after && <PlanTable plan={after.simulation.plan} title="Compared plan (after)"/>}
    </section>
    <section><h3>Screening thresholds — {c.status}</h3><p>{PROVISIONAL_NOTE}</p>
      <table className="report-thresholds"><thead><tr><th scope="col">Screen</th><th scope="col">Rule</th><th scope="col">Status</th></tr></thead>
        <tbody>{thresholdRows(c).map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value}</td><td>{row.status}</td></tr>)}</tbody></table></section>
    <section><h3>Top concerns ({concerns.concerns.length} of at most 3)</h3>
      {concerns.concerns.length === 0 && <p><strong>{concerns.message}</strong></p>}
      {concerns.concerns.map((card, i) => <article className="report-concern" key={card.family}>
        <h4>{i + 1}. {card.title}</h4>
        <p><strong>How often:</strong> {card.howOften} <Chip label={card.howOftenChip}/> — {card.rule}.</p>
        <p><strong>Why it matters:</strong> {card.why}</p>
        <p><strong>NASA evidence, worst replay:</strong> {card.evidence} <Chip label={card.evidenceChip}/></p>
        {card.context && <p><strong>Soil wetness context:</strong> {card.context.text} <Chip label={card.context.chip}/></p>}
        <p><strong>Plan input:</strong> {card.assumption} <Chip label={card.assumptionChip}/></p>
        <p><strong>Uncertainty:</strong> {card.uncertainty} {card.notes.join(' ')}</p>
      </article>)}
      <ul>
        {concerns.alsoQualified.map(item => <li key={item.family}>Also met the bar (not in the top three): {item.title} — {item.howOften}; {item.rule}. <Chip label={CHIPS.simulated}/></li>)}
        {concerns.belowBar.map(item => <li key={item.family}>Screened, below the bar: {item.title} — {item.howOften}; {item.rule}. <Chip label={CHIPS.simulated}/> Not evidence of low risk.</li>)}
        {concerns.notEvaluated.map(item => <li key={item.family}>Not evaluated: {item.title} — {item.reason}</li>)}
      </ul></section>
    {after && <section><h3>Before / after comparison</h3><p>Change tried: {after.description}.</p><ComparisonSummary before={before} after={after}/></section>}
    <section><h3>Provenance and labels</h3>
      <ul className="plan-sources">
        <li>Daily weather: NASA POWER daily point data, community AG, {replay.time_standard}, {replay.start} to {replay.end} ({replay.days.toLocaleString()} days): precipitation (PRECTOTCORR, includes frozen-precipitation water equivalent), daily maximum and minimum 2 m air temperature, and modeled root-zone wetness (GWETROOT).</li>
        <li>Replay file: <a href={`./data/${farm.id}/replay.json`}>data/{farm.id}/replay.json</a>, built {replay.provenance.built_at} by {replay.provenance.builder} from {replay.provenance.raw_files.length} archived NASA responses (SHA-256 recorded in the file). Replay fingerprint: {simulation.replayHash}. No NASA request is made while using the app.</li>
        <li><Chip label={CHIPS.nasa}/> dates and values read from the archived weather. <Chip label={CHIPS.model}/> a model estimate of relative wetness, not measured soil water. <Chip label={CHIPS.farmer}/> entered or chosen by the user. <Chip label={CHIPS.demo}/> hypothetical values for demonstration only. <Chip label={CHIPS.simulated}/> a count or sum computed from the weather and the plan under provisional screens.</li>
        <li>Gridded data (~50 km), not a field measurement. Irrigation, soil storage, crop growth stage, slope and storm intensity are not modeled.</li>
      </ul></section>
    <footer className="plan-disclaimer"><strong>Planning support, not a prescription.</strong><p>{DISCLAIMER}</p>
      <p>Weather data were obtained from the NASA Langley Research Center (LaRC) POWER Project, funded through the NASA Earth Science/Applied Science Program. https://power.larc.nasa.gov/</p></footer>
  </section>;
}
