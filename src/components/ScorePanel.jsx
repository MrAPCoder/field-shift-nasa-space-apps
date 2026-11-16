import React from 'react';
import { PRIORITIES } from '../lib/grade.js';

// Presents lib/grade.js#analyzeFarm only. Methodology lives in the documentation.
const pct = v => v == null ? '—' : `${Math.round(100 * v)}%`;
const mm = v => v == null ? '—' : `${Math.round(v).toLocaleString('en-US')} mm`;
const SENTENCE = 'A model-based score of your farm setup using historical NASA weather.';

function OptionsTable({ analysis, priority }) {
  // One row per distinct tested scenario; an option chosen by several priorities is listed once.
  const rows = [{ labels: ['Current'], o: { totalAfter: analysis.score, metrics: analysis.current }, keys: [] }];
  for (const [k, label] of Object.entries(PRIORITIES)) {
    const o = analysis.options[k]; if (!o) continue;
    const row = rows.find(r => r.o.scenario && JSON.stringify(r.o.scenario) === JSON.stringify(o.scenario));
    if (row) { row.labels.push(label); row.keys.push(k); } else rows.push({ labels: [label], o, keys: [k] });
  }
  if (rows.length < 2) return null;
  return <details className="compare-options"><summary>Compare options</summary>
    <div className="table-wrap"><table className="options-table" data-testid="options-table">
      <thead><tr><th scope="col">Option</th><th scope="col">Score</th><th scope="col">Stress days</th><th scope="col">Demand met</th><th scope="col">Irrigation</th><th scope="col">Drainage</th></tr></thead>
      <tbody>{rows.map(({ labels, o, keys }) => <tr key={labels.join()} className={keys.includes(priority) ? 'is-selected' : undefined} data-testid={keys.length ? `option-${keys[0]}` : 'option-current'}>
        <th scope="row">{labels.join(' · ')}{o.shortage?.material && <span className="flag">more shortage</span>}{o.action && <small>{o.action}</small>}</th>
        <td>{o.totalAfter}</td><td>{o.metrics.stressDays}</td><td>{pct(o.metrics.demandMet)}</td><td>{mm(o.metrics.irrigation)}</td><td>{mm(o.metrics.drainage)}</td>
      </tr>)}</tbody>
    </table></div>
  </details>;
}

export default function ScorePanel({ analysis, year, applied, priority, onPriority, onTry, onUndo, busy }) {
  const head = <header className="score-head"><h2>Your Farm Score</h2></header>;
  if (!analysis) return <section className="score" data-testid="score-section" aria-busy="true">{head}
    <p className="score-number is-pending" aria-label="Calculating">––<small>/100</small></p><p className="score-line">Scoring the {year} season…</p></section>;
  if (analysis.status !== 'SCORED') return <section className="score" data-testid="score-section">{head}
    <p className="score-number not-scored" data-testid="score-total">Not scored</p>
    <ul className="score-reasons" data-testid="score-reasons">{analysis.reasons.map(r => <li key={r}>{r}</li>)}</ul>
  </section>;
  const { problem } = analysis, opt = analysis.options[priority];
  return <section className="score" data-testid="score-section">
    {head}
    {applied && <div className="applied" role="status" data-testid="applied-banner">
      <span>Applied: {applied.action}. Score {applied.totalBefore} → {analysis.score}.</span>
      <button className="btn btn-ghost" onClick={onUndo} disabled={busy}>Undo</button>
    </div>}
    <p className="score-number" data-testid="score-total">{analysis.score}<small>/100</small></p>
    <p className="score-line">{SENTENCE}{analysis.startWaterNote && <span className="caution" data-testid="start-water-note"> Sensitive to the assumed starting soil water ({analysis.range.min}–{analysis.range.max}).</span>}</p>

    <div className="score-grid">
      <div className="score-cell" data-testid="biggest-problem">
        <p className="micro">Biggest Problem</p>
        <h3 data-testid="problem-title">{problem ? problem.title : 'None found'}</h3>
        <p data-testid="problem-text">{problem ? problem.short : 'Every part of the score is close to its target.'}</p>
      </div>
      <div className="score-cell" data-testid="how-to-improve">
        <div className="cell-head"><p className="micro">How to Improve</p>
          <div className="switch" role="radiogroup" aria-label="Priority">
            {Object.entries(PRIORITIES).map(([k, label]) => <button key={k} role="radio" aria-checked={priority === k} onClick={() => onPriority(k)}>{label}</button>)}
          </div>
        </div>
        {opt ? <>
          {opt.shortage.material && <p className="caution-box" data-testid="shortage-warning">Saves water but worsens crop water shortage ({opt.shortage.stress >= 0 ? '+' : ''}{opt.shortage.stress} stress days). Not an unqualified improvement.</p>}
          <h3 data-testid="improve-action">{opt.action}</h3>
          <p className="score-change" data-testid="improve-total">Score {opt.totalBefore} → <strong>{opt.totalAfter}</strong></p>
          {opt.tradeoffs.length > 0 && <p className="tradeoffs" data-testid="tradeoffs">Tradeoffs: {opt.tradeoffs.map(t => t.replace(/\.$/, '')).join(' · ')}</p>}
          <button className="btn btn-primary" onClick={() => onTry(opt)} disabled={busy}>Try This Improvement</button>
        </> : <p data-testid="improve-action">{priority === 'water' ? (analysis.current.irrigation > 0 ? 'No irrigation cut keeps the score.' : 'Not irrigated: nothing to save.') : 'No tested change improved the score under this priority.'}</p>}
      </div>
    </div>
    <OptionsTable analysis={analysis} priority={priority}/>
  </section>;
}
