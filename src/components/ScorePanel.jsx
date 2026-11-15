import React from 'react';
import { MODEL } from '../lib/soilWater.js';
import { CATEGORY_IDS } from '../lib/grade.js';

// Presents lib/grade.js output only. Every number shown here was calculated by a model run.
const G = MODEL.grading;
const signed = v => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}`;
const openMethods = () => { const d = document.getElementById('advanced-details'); if (d) d.open = true; };

function Bar({ c, after }) {
  const scored = c.status === 'SCORED';
  return <div className="score-bar" data-testid={`category-${c.id}`}>
    <div className="score-bar-head"><span>{c.label}</span>
      <strong>{scored ? <>{c.points}<small>/{c.max}</small></> : 'Not scored'}{after && after.points !== c.points && <em className="bar-delta"> → {after.points} ({signed(after.points - c.points)})</em>}</strong></div>
    <div className="bar-track" aria-hidden="true">
      {scored && <i style={{ width: `${100 * c.points / c.max}%` }}/>}
      {after && after.points > c.points && <i className="bar-gain" style={{ left: `${100 * c.points / c.max}%`, width: `${100 * (after.points - c.points) / c.max}%` }}/>}
    </div>
  </div>;
}

function Improvement({ imp, label, onTry, busy, primary }) {
  return <div className="improve" data-testid={primary ? 'how-to-improve' : undefined}>
    {primary && <h4>How to Improve</h4>}
    <p className="fix-action" data-testid={primary ? 'improve-action' : undefined}><b>{imp.action}.</b> {imp.why}</p>
    <dl className="improve-gains">
      <div><dt>{label}</dt><dd data-testid={primary ? 'improve-category' : undefined}>{imp.categoryBefore} → {imp.categoryAfter} <em>{signed(imp.categoryGain)}</em></dd></div>
      <div><dt>Total score</dt><dd data-testid={primary ? 'improve-total' : undefined}>{imp.totalBefore} → {imp.totalAfter} <em>{signed(imp.totalGain)}</em> <span className="grade-shift">{imp.gradeBefore} → {imp.gradeAfter}</span></dd></div>
    </dl>
    {imp.tradeoffs.length
      ? <div className="tradeoffs"><span>Tradeoffs</span><ul>{imp.tradeoffs.map(t => <li key={t}>{t}</li>)}</ul></div>
      : <p className="tradeoffs none">No tradeoff in the other two categories or in crop stress days.</p>}
    <button className={primary ? 'primary try-button' : 'try-button secondary'} onClick={() => onTry(imp)} disabled={busy}>Try this improvement</button>
  </div>;
}

export default function ScorePanel({ analysis, year, farmName, applied, onTry, onUndo, busy }) {
  if (!analysis) return null;
  const score = analysis.before.score;
  if (score.status !== 'SCORED') return <section className="score-section" data-testid="score-section">
    <h2><b>04</b> Your farm score</h2>
    <div className="score-card not-scored"><div className="score-total"><strong data-testid="score-total">Not scored</strong></div>
      <ul className="score-reasons">{score.reasons.map(r => <li key={r}>{r}</li>)}</ul></div>
  </section>;
  const b = analysis.biggest;
  return <section className="score-section" data-testid="score-section">
    <div className="score-heading"><h2><b>04</b> Your farm score</h2><span>{farmName} · {year} NASA weather · this scenario</span></div>
    {applied && <div className="applied-banner" role="status" data-testid="applied-banner">
      <p><b>Applied:</b> {applied.action}. Score <strong>{applied.totalBefore} → {score.total}</strong> ({applied.gradeBefore} → {score.grade}), recalculated on the same weather.</p>
      <button onClick={onUndo} disabled={busy}>Undo</button>
    </div>}
    <div className="score-card">
      <div className="score-total">
        <strong data-testid="score-total">{score.total}<small>/100</small></strong>
        <span className={`grade grade-${score.grade}`} data-testid="score-grade">{score.grade}</span>
      </div>
      <div className="score-bars">{CATEGORY_IDS.map(id => <Bar key={id} c={score.categories[id]}/>)}</div>
    </div>
    <p className="score-note">100 means this scenario meets all three model targets, not that the farm is perfect. It is calculated from the simulation above, not a field inspection or a soil-health test. <a href="#score-methods" onClick={openMethods}>How the score works</a></p>

    {b ? <article className="weakness-card" data-testid="biggest-weakness">
      <p className="eyebrow">Your Biggest Weakness</p>
      <h3 data-testid="weakness-name">{b.label} <span>({b.points}/{b.max})</span></h3>
      <p className="lost">{b.lost} points lost</p>
      <p className="weakness-why" data-testid="weakness-why">{b.why}</p>
      <details className="evidence"><summary>NASA-driven model evidence</summary><ul>{b.evidence.map(e => <li key={e}>{e}</li>)}</ul></details>
      <Improvement imp={b.improvement} label={b.label} onTry={onTry} busy={busy} primary/>
      <p className="improve-fine">Found by rerunning {analysis.candidatesTested} single-setting changes on the same {year} NASA weather, location, soil and assumptions. A model result, not a guarantee for a real field.</p>
    </article>
      : <article className="weakness-card calm" data-testid="biggest-weakness">
        <p className="eyebrow">Your Biggest Weakness</p>
        <h3>{analysis.status === 'MEETS_TARGETS' ? 'No meaningful weakness' : 'No model-supported fix found'}</h3>
        <p className="weakness-why" data-testid="weakness-why">{analysis.message}</p>
      </article>}

    <div className="other-weaknesses">
      <p className="other-title">Other categories</p>
      {analysis.others.map(c => <details key={c.id} className="other" data-testid={`other-${c.id}`}>
        <summary><span>{c.label}</span><b>{c.status === 'SCORED' ? `${c.points}/${c.max}` : 'Not scored'}</b></summary>
        <p>{c.why}</p>
        {c.evidence.length > 0 && <ul className="evidence-list">{c.evidence.map(e => <li key={e}>{e}</li>)}</ul>}
        {c.improvement ? <Improvement imp={c.improvement} label={c.label} onTry={onTry} busy={busy}/>
          : c.lost > 0 && <p className="quiet">No tested single change raised this category without lowering the total score by at least {G.minMeaningfulGain} point.</p>}
      </details>)}
    </div>
  </section>;
}

export function ScoreMethods() {
  return <section id="score-methods" className="soil-methods score-methods">
    <h2>How the farm score works</h2>
    <p>{G.note} Category points are linear between a zero point and a target, rounded to whole points; the total is the sum of the rounded categories. If any category cannot be calculated, the total shows “Not scored”. Targets are provisional scoring conventions.</p>
    <div className="table-scroll"><table className="month-balance"><thead><tr><th>Category</th><th>Points</th><th>What is measured in the model</th><th>Full points</th><th>Zero points</th></tr></thead>
      <tbody>{CATEGORY_IDS.map(id => { const c = G.categories[id]; const less = id !== 'cropWaterSupply';
        return <tr key={id}><th>{c.label}</th><td>{c.max}</td><td style={{ whiteSpace: 'normal', textAlign: 'left' }}>{c.metric}</td><td>{less ? '≤' : '≥'} {Math.round(100 * c.fullAt)}%</td><td>{less ? '≥' : '≤'} {Math.round(100 * c.zeroAt)}%</td></tr>; })}</tbody></table></div>
    <p>With no irrigation, Irrigation Efficiency earns full points because no applied water drained away. Crop Water Supply still loses points if the crop runs short.</p>
    <p><strong>Biggest weakness.</strong> Each scored category is tested against single-setting changes that act on it: less irrigation (efficiency), more irrigation (crop water), ground cover (exposure), and a one-month season shift that keeps the season length (efficiency and crop water). Every change is a full rerun on the same NASA weather, location, year, soil and model. The biggest weakness is the category, among those losing at least {G.minMeaningfulLoss} points, whose best change raises the <em>total</em> score most, so tradeoffs in other categories count. It is not simply the lowest score. Soil type is never offered as a fix. If no change raises the total by at least {G.minMeaningfulGain} point, the tool says so.</p>
  </section>;
}
