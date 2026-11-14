import React, { useEffect, useRef } from 'react';
import cropData from '../../data/crops.json';
import { formatValue } from '../lib/climate.js';
import { knownMonthNames, DISCLAIMER } from '../lib/plan.js';
import { demonstrationApproved } from '../lib/score.js';
import RainfallCalendar from './RainfallCalendar.jsx';

export default function RotationPlan({ rotation, climate, priorities, management, result, onClose }) {
  const panel=useRef(null);
  useEffect(()=>{panel.current?.focus();},[rotation.id]);
  const sources=[...new Set([...rotation.source_urls,...rotation.years.flatMap(y=>y.source_urls??[])])];
  const gaps=[...new Set([...rotation.data_gaps,...Object.values(result.scores).flatMap(s=>s.reasons)])];
  return <section className="print-plan" aria-label="Printable three-year rotation plan" tabIndex="-1" ref={panel}>
    <div className="plan-actions"><button onClick={()=>window.print()}>Print this plan</button><button onClick={onClose}>Close print view</button><p>Uses your current inputs. Select your browser’s Save as PDF or printer. Incomplete plans print with their gaps clearly marked.</p></div>
    <header><p className="section-kicker">FIELD SHIFT · NASA SPACE APPS 2026</p><h2>Three-year rotation plan</h2><h3>{climate.farm.name} · {rotation.name}</h3>
      <p>{demonstrationApproved(rotation)?'Published sequence approved for research demonstration only.':'Incomplete research candidate — sequence not approved.'} Not a confirmed farm history or planting recommendation.</p></header>
    <section><h3>Management provenance</h3><p><strong>{management.mode==='observed'?'Observed management — farmer-reported':'Proposed scenario — farmer assumptions'}</strong>; not independently verified.</p>
      <p>{management.confirmed?'Confirmed by its author':'Unconfirmed draft'} · {management.context||'Field, years or scenario description not supplied'}</p><p>Confirmed by: {management.confirmed_by||'Not supplied'} · Confirmation time (UTC): {management.confirmed_at||'Not confirmed'}</p></section>
    <section><h3>Crop sequence and known timing</h3><ol>{rotation.years.map(year=><li key={year.year}><strong>Year {year.year}: </strong>{year.crop_ids.map(id=>cropData.crops.find(c=>c.id===id)?.name??'Unknown crop').join(' + ')||'Unknown — sequence missing'}<br/>Planting: {knownMonthNames(year.planting_months)}<br/>Harvest: {knownMonthNames(year.harvest_months)}</li>)}</ol><p>No planting or harvest dates are inferred from monthly status. All current catalog timing is unknown. Crop/cover status may include retained residue after harvest.</p></section>
    <section><h3>Historical climate context</h3><p>NASA POWER · {climate.period.start} to {climate.period.end}. Representative regional location; gridded estimates may differ from fields.</p>
      <dl className="plan-metrics"><div><dt>Mean annual rainfall</dt><dd>{formatValue(climate.summary.mean_rainfall_mm)} mm/year ({climate.summary.rainfall_mm_valid_years} valid years)</dd></div><div><dt>Mean frost-free season</dt><dd>{formatValue(climate.summary.mean_frost_free_days)} days ({climate.summary.frost_free_days_valid_years} valid years)</dd></div><div><dt>Mean hot days (daily high ≥ {climate.thresholds.hot_day_c}°C)</dt><dd>{formatValue(climate.summary.mean_hot_days)} days/year ({climate.summary.hot_days_valid_years} valid years)</dd></div></dl></section>
    <section><h3>Your priorities and scores</h3><p>Importance, 0–10: Water {priorities.water} · Soil {priorities.soil} · Income {priorities.income} · Erosion {priorities.erosion}.</p><p>Water savings: Not scored. Soil health: Not scored. Extra income: Not scored yet. Required agricultural traits, prices and costs are missing.</p><p>Overall comparative index: {result.total.status==='SCORED'?`${formatValue(result.total.value)} / 100`:'Not scored'}. Currently only the rainfall-exposure index can contribute. Other sliders cannot change an erosion-only total.</p></section>
    <RainfallCalendar climate={climate} management={management} score={result.scores.erosion}/>
    <section><h3>Calculation and assumptions</h3><p>Exposure (%) = 100 × sum(monthly NASA rain × farmer exposed-soil percentage / 100) / (3 × annual sum of monthly NASA rain). Index = 100 − exposure (%). Higher index means less assumed exposure, not less measured erosion.</p>
      {result.scores.erosion.status==='SCORED'&&<p>Rain weighted by exposure across three years: {formatValue(result.scores.erosion.evidence.exposedRainMmOverThreeYears)} mm. Denominator: 3 × {formatValue(result.scores.erosion.evidence.annualRainMm)} mm.</p>}
      <p>Monthly averages cannot resolve storm timing, slope, soil erodibility or residue effectiveness. Even farmer-observed management is combined with historical normals, not actual rainfall in the reported years. No assumption is independently verified by confirmation.</p></section>
    <section><h3>Evidence and source references</h3><ol className="plan-sources"><li>NASA POWER daily point API: <a href="https://power.larc.nasa.gov/api/temporal/daily/point">https://power.larc.nasa.gov/api/temporal/daily/point</a>. Cached data and archive provenance: <a href={`./data/${climate.farm.id}/climate.json`}>data/{climate.farm.id}/climate.json</a>. Monthly normals: 1981–2025.</li>{sources.map(url=><li key={url}><a href={url}>{url}</a></li>)}</ol><p>Farmer calendar entries are a separate source of assumptions/reports; the publications do not establish this field’s monthly exposure.</p></section>
    <section><h3>Data gaps and uncertainties</h3><ul>{gaps.map(gap=><li key={gap}>{gap}</li>)}</ul><h3>Risks to check locally</h3><p>{rotation.risks}</p></section>
    <footer className="plan-disclaimer"><strong>Planning support, not a prescription.</strong><p>{DISCLAIMER}</p></footer>
  </section>;
}
