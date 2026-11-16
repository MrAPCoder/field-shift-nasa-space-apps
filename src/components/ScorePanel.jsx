import React from 'react';
import { PRIORITIES } from '../lib/grade.js';

// Presents lib/grade.js#analyzeFarm only. No category bars, weights or letter grades by design;
// the rubric lives in the documentation.
const pct = v => v == null ? '—' : `${Math.round(100 * v)}%`;
const mm = v => v == null ? '—' : `${Math.round(v).toLocaleString('en-US')} mm`;

function OptionsTable({ analysis, priority }) {
  // One row per distinct tested scenario; an option chosen by several priorities is listed once.
  const rows = [{ labels: ['Current'], o: { totalAfter: analysis.score, metrics: analysis.current }, keys: [] }];
  for (const [k, label] of Object.entries(PRIORITIES)) {
    const o = analysis.options[k]; if (!o) continue;
    const row = rows.find(r => r.o.scenario && JSON.stringify(r.o.scenario) === JSON.stringify(o.scenario));
    if (row) { row.labels.push(label); row.keys.push(k); } else rows.push({ labels: [label], o, keys: [k] });
  }
  if (rows.length < 2) return null;
  return <div className="table-wrap"><table className="options-table" data-testid="options-table">
    <caption>Tested options, same weather</caption>
    <thead><tr><th scope="col">Option</th><th scope="col">Score</th><th scope="col">Stress days</th><th scope="col">Demand met</th><th scope="col">Irrigation</th><th scope="col">Drainage</th></tr></thead>
    <tbody>{rows.map(({ labels, o, keys }) => <tr key={labels.join()} className={keys.includes(priority) ? 'is-selected' : undefined} data-testid={keys.length ? `option-${keys[0]}` : 'option-current'}>
      <th scope="row">{labels.join(' · ')}{o.shortage?.material && <span className="flag">shortage worse</span>}{o.action && <small>{o.action}</small>}</th>
      <td>{o.totalAfter}</td><td>{o.metrics.stressDays}</td><td>{pct(o.metrics.demandMet)}</td><td>{mm(o.metrics.irrigation)}</td><td>{mm(o.metrics.drainage)}</td>
    </tr>)}</tbody>
  </table></div>;
}

export default function ScorePanel({ analysis, year, scenarioText, applied, priority, onPriority, onTry, onUndo, busy }) {
  if (!analysis) return <section className="results" data-testid="score-section" aria-busy="true">
    <h2 className="section-title">Your farm score</h2>
    <div className="results-card is-loading"><p className="muted">Scoring this season and testing alternatives on the same {year} NASA weather…</p></div>
  </section>;
  if (analysis.status !== 'SCORED') return <section className="results" data-testid="score-section">
    <h2 className="section-title">Your farm score</h2>
    <div className="results-card"><div className="score-block">
      <p className="label">Score</p>
      <p className="score-number not-scored" data-testid="score-total">Not scored</p>
      <p className="scored-scenario">{scenarioText} · {year}</p>
      <ul className="score-reasons" data-testid="score-reasons">{analysis.reasons.map(r => <li key={r}>{r}</li>)}</ul>
    </div></div>
  </section>;
  const { problem } = analysis, opt = analysis.options[priority];
  const doesntFix = problem && opt && priority === 'balanced' && !opt.helpsProblem;
  return <section className="results" data-testid="score-section">
    <h2 className="section-title">Your farm score</h2>
    {applied && <div className="applied" role="status" data-testid="applied-banner">
      <p><b>Applied:</b> {applied.action}. Score <strong>{applied.totalBefore} → {analysis.score}</strong>, recalculated on the same weather.</p>
      <button className="btn btn-quiet" onClick={onUndo} disabled={busy}>Undo</button>
    </div>}
    <div className="results-card">
      <div className="score-block">
        <p className="label">Score</p>
        <p className="score-number" data-testid="score-total">{analysis.score}<small>/100</small></p>
        <p className="scored-scenario" data-testid="scored-scenario">{scenarioText} · {year}</p>
        <p className="score-caption">A provisional rating of this simulated season: crop water supply (50), irrigation efficiency (30) and rain on exposed soil (20). Not an assessment of a real farm.{analysis.startWaterNote && <span data-testid="start-water-note"> Depends on the assumed starting soil water: {analysis.range.min}–{analysis.range.max}.</span>} <a href="./docs/how-it-works.html">How it’s scored</a></p>
      </div>
      <div className="problem-block" data-testid="biggest-problem">
        <p className="label label-warn">Biggest problem</p>
        <h3 data-testid="problem-title">{problem ? problem.title : 'No major problem found'}</h3>
        <p data-testid="problem-text">{problem ? problem.text : 'Every part of the score is within a few points of its target this season.'}</p>
        {problem && <details className="evidence"><summary>NASA data behind this</summary><ul>{problem.evidence.map(e => <li key={e}>{e}</li>)}</ul></details>}
      </div>
    </div>

    <div className="improve" data-testid="how-to-improve">
      <div className="improve-head">
        <h3>How to improve</h3>
        <div className="segmented" role="radiogroup" aria-label="What matters most">
          {Object.entries(PRIORITIES).map(([k, label]) => <button key={k} role="radio" aria-checked={priority === k} onClick={() => onPriority(k)}>{label}</button>)}
        </div>
      </div>
      {opt ? <div className="option">
        {doesntFix && <p className="note" data-testid="fix-note">No tested change fixed the {problem.title.toLowerCase()} without hurting the crop, so this is the best safe change found. {analysis.investigate}</p>}
        {opt.shortage.material && <p className="warn" data-testid="shortage-warning">Tradeoff: this saves irrigation water, but crop water shortage gets worse ({opt.shortage.stress >= 0 ? '+' : ''}{opt.shortage.stress} stress days; demand met {pct(analysis.current.demandMet)} → {pct(opt.metrics.demandMet)}). It is not an unqualified improvement.</p>}
        <p className="fix-action" data-testid="improve-action"><b>{opt.action}.</b> {opt.why}.</p>
        <p className="score-change" data-testid="improve-total">Score <strong>{opt.totalBefore} → {opt.totalAfter}</strong></p>
        {opt.tradeoffs.length > 0 ? <ul className="tradeoffs" data-testid="tradeoffs">{opt.tradeoffs.map(t => <li key={t}>{t}</li>)}</ul>
          : <p className="muted small">No tradeoff in crop water, irrigation, drainage or exposure.</p>}
        <button className="btn btn-primary" onClick={() => onTry(opt)} disabled={busy}>Try this change</button>
      </div> : <p className="option" data-testid="improve-action">{priority === 'water' ? (analysis.current.irrigation > 0 ? 'No irrigation cut keeps the score from falling.' : 'This farm is not irrigated, so there is no irrigation to save.') : problem ? `None of the ${analysis.candidatesTested} options we reran helped under this priority. ${analysis.investigate}` : 'No tested change raised the score further.'}</p>}
      <OptionsTable analysis={analysis} priority={priority}/>
      <p className="fine">Each option is a full rerun with the same NASA weather, soil, crop and season, changing only irrigation and ground cover. Balanced options never add 7 or more stress days. Every gain holds whether the soil started the year empty or full, and in a drier winter. These are model results, not farming advice.</p>
    </div>
  </section>;
}
