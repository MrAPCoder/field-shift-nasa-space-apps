import React from 'react';

// Presents lib/grade.js#analyzeFarm only: overall score, biggest problem, best tested improvement.
// No category bars, weights or letter grades by design; the rubric lives in the documentation.
export default function ScorePanel({ analysis, pending, year, scenarioText, applied, onTry, onUndo, busy }) {
  if (pending || !analysis) return <section className="score-section" data-testid="score-section" aria-busy="true">
    <div className="score-card score-loading"><p className="eyebrow">Your farm score</p><p className="quiet">Calculating from the simulation and testing alternatives on the same {year} NASA weather…</p></div>
  </section>;
  if (analysis.status !== 'SCORED') return <section className="score-section" data-testid="score-section">
    <div className="score-card">
      <p className="eyebrow">Your farm score</p>
      <p className="scored-scenario">{scenarioText} · {year}</p>
      <p className="score-number not-scored" data-testid="score-total">Not scored</p>
      <ul className="score-reasons" data-testid="score-reasons">{analysis.reasons.map(r => <li key={r}>{r}</li>)}</ul>
    </div>
  </section>;
  const { problem, improvement: imp } = analysis;
  return <section className="score-section" data-testid="score-section">
    {applied && <div className="applied-banner" role="status" data-testid="applied-banner">
      <p><b>Applied:</b> {applied.action}. Score <strong>{applied.totalBefore} → {analysis.score}</strong>, recalculated on the same {year} NASA weather.</p>
      <button onClick={onUndo} disabled={busy}>Undo</button>
    </div>}
    <div className="score-card">
      <div className="score-top">
        <div>
          <p className="eyebrow">Your farm score</p>
          <p className="score-number" data-testid="score-total">{analysis.score}<small>/100</small></p>
        </div>
        <p className="score-caption"><span className="scored-scenario" data-testid="scored-scenario">Scored: {scenarioText}.</span> A provisional, educational rating of this simulated {year} season: crop water supply, irrigation use and rain on exposed soil. Not a validated assessment of a real farm.{analysis.startWaterNote && <span data-testid="start-water-note"> Depends on the assumed starting soil water (range {analysis.range.min}–{analysis.range.max}).</span>} <a href="./docs/how-it-works.html">How it works</a></p>
      </div>

      <div className="problem" data-testid="biggest-problem">
        <p className="label">Your biggest problem</p>
        {problem ? <>
          <h3 data-testid="problem-title">{problem.title}</h3>
          <p data-testid="problem-text">{problem.text}</p>
          <details className="evidence"><summary>NASA-driven model evidence</summary><ul>{problem.evidence.map(e => <li key={e}>{e}</li>)}</ul></details>
        </> : <>
          <h3 data-testid="problem-title">No major problem found</h3>
          <p data-testid="problem-text">Every part of the score is within a few points of its target in this simulated season.</p>
        </>}
      </div>

      <div className="fix" data-testid="how-to-improve">
        <p className="label">How to improve</p>
        {imp ? <>
          {problem && !imp.helpsProblem && <p className="fix-note" data-testid="fix-note">No tested change fixed the {problem.title.toLowerCase()} without lowering the score. This was the best change found.</p>}
          <p className="fix-action" data-testid="improve-action"><b>{imp.action}.</b> {imp.why}.</p>
          <p className="score-change" data-testid="improve-total">Your score: <strong>{imp.totalBefore} → {imp.totalAfter}</strong></p>
          {imp.tradeoffs.length > 0 && <div className="tradeoffs" data-testid="tradeoffs"><span>Tradeoffs</span><ul>{imp.tradeoffs.map(t => <li key={t}>{t}</li>)}</ul></div>}
          <button className="primary try-button" onClick={() => onTry(imp)} disabled={busy}>Try this improvement</button>
          <p className="improve-fine">Found by rerunning {analysis.candidatesTested} irrigation and ground-cover options on the same NASA weather, soil, crop and season. It holds whether the soil started the year empty, half full or full, and in a drier winter. A model result, not a farming recommendation.</p>
        </> : <p data-testid="improve-action">{problem ? <>None of the {analysis.candidatesTested} irrigation and ground-cover options we reran raised your score. {analysis.investigate}</> : 'No tested change raised the score further.'}</p>}
      </div>
    </div>
  </section>;
}
