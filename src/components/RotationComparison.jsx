import React, { useState } from 'react';
import cropData from '../../data/crops.json';
import rotationData from '../../data/rotations.json';
import config from '../config/config.js';
import ManagementCalendar from './ManagementCalendar.jsx';
import { emptyManagement } from '../lib/management.js';
import { scoreRotation, demonstrationApproved } from '../lib/score.js';
import { formatValue, MONTHS } from '../lib/climate.js';
const labels = { water: 'Water savings', soil: 'Soil health', erosion: 'Rainfall-exposure index', income: 'Extra income' };
const sourceByUrl = Object.fromEntries(Object.values(cropData.sources).map(source => [source.url, source]));
function Card({ rotation, role, climate, result, management, onManagementChange }) {
  const summer = config.scoring.summerMonths.map(month => climate.monthly.find(row => row.month === month)?.rainfall_normal_mm);
  const summerRain = summer.every(Number.isFinite) ? summer.reduce((a,b) => a+b,0) : null;
  const reasons = [...new Set(Object.values(result.scores).filter((_,i) => i < 3).flatMap(score => score.reasons))];
  return <article className="rotation-card" data-testid="rotation-card">
    <div className="section-kicker">{role}</div><h3>{rotation.name}</h3><span className="review-badge">{demonstrationApproved(rotation) ? 'Published sequence approved · demonstration only' : rotation.verified ? 'Team reviewed' : 'Proposed · awaiting review'}</span>
    {demonstrationApproved(rotation) && <p>Research-based scenario, not a confirmed farm history or recommendation. Local suitability, dates, traits and management remain unverified.</p>}
    <div className="rotation-total"><span>Overall comparative score</span><strong>{result.total.status === 'SCORED' ? `${formatValue(result.total.value)} / 100` : 'Not scored'}</strong></div>
    <dl className="subscores">{Object.entries(labels).map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{result.scores[key].status === 'SCORED' ? `${formatValue(result.scores[key].value)} / 100` : key === 'income' ? 'Not scored yet' : 'Not scored'}</dd></div>)}</dl>
    {result.scores.erosion.status === 'SCORED' && <div className="exposure-result" data-testid="exposure-result"><strong>{result.scores.erosion.evidence.mode === 'proposed' ? 'Scenario estimate' : 'Farmer-reported management estimate'}</strong><p>{formatValue(100 * result.scores.erosion.evidence.rainExposureFraction)}% rainfall-weighted exposure. Index: {formatValue(result.scores.erosion.value)} / 100 (higher = less assumed exposure).</p><p>Cached NASA rainfall × farmer-entered exposure assumptions. Not measured erosion, soil loss or independently verified cover.</p></div>}
    <ol className="crop-sequence">{rotation.years.map(year => <li key={year.year}><strong>Year {year.year}: </strong>{year.crop_ids.length ? year.crop_ids.map(id => cropData.crops.find(crop => crop.id === id)?.name ?? 'TODO crop').join(' + ') : 'TODO — crop sequence not established'}</li>)}</ol>
    {rotation.sequence_status === 'annual_pattern' && <p className="sequence-note">Annual pattern repeated as a proposed three-year planning window. “+” includes multiple crops, not necessarily simultaneous planting.</p>}
    <ManagementCalendar rotation={rotation} value={management} onChange={onManagementChange}/>
    <section><h4>Why</h4><p>{rotation.why}</p></section>
    <section><h4>Evidence</h4><p>Cached NASA data: {formatValue(summerRain)} mm of {config.scoring.summerMonths.map(month => MONTHS[month - 1]).join(' / ')} rain; {formatValue(climate.summary.mean_frost_free_days)} mean frost-free days ({climate.summary.frost_free_days_valid_years} valid years). These are climate context, not proof of crop suitability.</p><ul>{rotation.source_urls.map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer">{sourceByUrl[url]?.title ?? 'Agricultural source'} ↗</a></li>)}</ul></section>
    <section><h4>Benefits</h4><p>{rotation.benefits}</p></section>
    <section><h4>Data gaps</h4><ul>{[...rotation.data_gaps, ...reasons].map((gap,i) => <li key={i}>{gap}</li>)}</ul></section>
    <section><h4>Risks to check locally</h4><p>{rotation.risks}</p></section>
    {result.total.status === 'SCORED' && <p className="score-explanation">Included priorities: {result.total.evidence.included.map(key => labels[key]).join(', ')}. Excluded: {result.total.evidence.excluded.map(key => labels[key]).join(', ') || 'none'}.</p>}
    <details className="score-details"><summary>Score calculation and eligibility</summary>{Object.entries(labels).map(([key,label]) => <p key={key}><strong>{label}: </strong>{result.scores[key].reasons.join(' ') || `${formatValue(result.scores[key].value)} / 100 using the method below.`}</p>)}
      {result.scores.water.status === 'SCORED' && <p>Summer rain: {formatValue(result.scores.water.evidence.summerRainMm)} mm; summer share: {formatValue(100 * result.scores.water.evidence.summerShare)}%; average category index: {formatValue(result.scores.water.evidence.demandIndex, 2)}.</p>}
      {result.scores.soil.status === 'SCORED' && <p>Soil components (0–1): nitrogen-fixing crop presence {formatValue(result.scores.soil.evidence.components.legume, 2)}, cover-crop share {formatValue(result.scores.soil.evidence.components.cover, 2)}, root diversity {formatValue(result.scores.soil.evidence.components.rootDiversity, 2)}, non-bare share {formatValue(result.scores.soil.evidence.components.nonBare, 2)}. Relative weights: {Object.values(result.scores.soil.evidence.weights).join(', ')} in that order.</p>}
      {result.scores.erosion.status === 'SCORED' && <p>Rain weighted by assumed exposed-soil share over three years: {formatValue(result.scores.erosion.evidence.exposedRainMmOverThreeYears)} mm. Denominator: 3 × {formatValue(result.scores.erosion.evidence.annualRainMm)} mm.</p>}</details>
  </article>;
}
export default function RotationComparison({ climate, priorities, management, onManagementChange }) {
  const rotations = rotationData.rotations.filter(rotation => rotation.farm_id === climate.farm.id);
  const [current, setCurrent] = useState(rotations.find(rotation => rotation.slot === 'current')?.id);
  const baseline = rotations.find(rotation => rotation.id === current) ?? rotations[0];
  const ordered = [baseline, ...rotations.filter(rotation => rotation.id !== baseline.id)];
  const calendars = Object.fromEntries(ordered.map(rotation => [rotation.id, management[rotation.id] ?? emptyManagement(rotation.id)]));
  const results = Object.fromEntries(ordered.map(rotation => [rotation.id, scoreRotation(rotation, cropData.crops, climate, priorities, config.scoring, calendars[rotation.id])]));
  const scoredCount = Object.values(results).filter(result => result.total.status === 'SCORED').length;
  const pendingCount = rotations.filter(rotation => !rotation.verified && !demonstrationApproved(rotation)).length;
  return <section className="rotation-section" aria-labelledby="rotation-title">
    <div className="section-kicker">ROTATION COMPARISON</div><h2 id="rotation-title">Explore options. Check the evidence.</h2>
    <p className="muted">These are demonstration candidates, not confirmed farm histories or planting recommendations. {pendingCount} of these entries still await team approval.</p>
    <div className="rotation-controls"><label htmlFor="current-rotation">Current rotation / comparison baseline</label><select id="current-rotation" value={baseline.id} onChange={event => setCurrent(event.target.value)}>{rotations.map(rotation => <option key={rotation.id} value={rotation.id}>{rotation.name}</option>)}</select><p>Choose a baseline for comparison; this does not approve a proposal or establish what is grown on your farm.</p></div>
    <p className="weight-summary" role="status">Selected importance: Water {priorities.water}/10 · Soil {priorities.soil}/10 · Income {priorities.income}/10 · Erosion {priorities.erosion}/10.</p>
    <div className="soft-note">Published sequences need team approval. Farmer calendars need complete inputs and explicit confirmation; they remain separate from research evidence. Missing inputs are not zeros. {scoredCount === 0 ? 'All current candidates remain unscored.' : `${scoredCount} candidates have an eligible overall score; check which priorities are included before comparing.`} {priorities.income > 0 && 'Income is excluded: crop prices and production costs are not included.'} {Object.values(priorities).every(value => value === 0) && 'All priority weights are zero; no overall score is available.'}</div>
    <p className="soft-note">When only rainfall exposure is eligible, the total reflects only that index. Water, soil and income sliders cannot change it yet. Setting erosion importance to zero removes the overall score. Compare scenarios only when their input basis and eligible metrics match.</p>
    <div className="rotation-grid">{ordered.map((rotation,i) => <Card key={rotation.id} rotation={rotation} role={['Current / baseline','Alternative A','Alternative B'][i]} climate={climate} result={results[rotation.id]} management={calendars[rotation.id]} onManagementChange={value => onManagementChange(rotation.id, value)}/>)}</div>
    <details className="method-summary"><summary>How the comparative scores work</summary><p>Overall = sum of each available score × its importance, divided by the sum of importance for those available scores. Income and unavailable scores are excluded from both sums. No positive eligible weight means no overall score.</p><p>Water: crop water-demand categories compared with summer’s share of annual rain. Soil: documented nitrogen fixation, cover-crop months, root-depth diversity and non-bare months. Rainfall-exposure index: 100 × (1 − sum of monthly NASA rainfall × entered exposed-soil fraction / three years’ total rainfall). Every month must be known and confirmed. A higher index means less assumed exposure, not a measured reduction in erosion.</p><p>These are provisional comparison rules, not irrigation prescriptions, measured soil health, erosion forecasts, probabilities or profitability estimates. A crop’s presence does not prove protective cover. Different score availability can make totals unsuitable for direct ranking.</p></details>
  </section>;
}
