import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MODEL, loadSoilWeather, runSoilSimulation, compareSoil, startupSensitivity, periodBalance, monthlyBalance } from '../lib/soilWater.js';
import { sceneFrame, mm } from '../lib/scene.js';
import FarmScene, { FlowLegend } from './FarmScene.jsx';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const COVER = { bare:'Bare between crops', residue:'Crop residue · 70% assumed cover', cover:'Cover crops · reference-grass scenario' };
const OFF_SEASON = { bare:'Bare soil between crops', residue:'Crop residue on the surface', cover:'Live cover crop (outside the cash-crop season)' };
const defaults = location => ({location,crop:'spring_wheat',soil:'loamy',irrigation:0,planting:4,harvest:8,cover:'bare'});
const number = (v,digits=1) => v == null || !Number.isFinite(v) ? 'Unavailable' : v.toLocaleString('en-US',{maximumFractionDigits:digits});
const fixed = (v,digits=1) => v == null || !Number.isFinite(v) ? 'Unavailable' : v.toLocaleString('en-US',{maximumFractionDigits:digits,minimumFractionDigits:digits});
const signed = (v,digits=1) => `${v>0?'+':v<0?'−':'±'}${fixed(Math.abs(v),digits)}`;
const dateLabel = date => new Date(date+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const openMethods = () => { document.getElementById('advanced-details').open=true; };
const reducedMotion = () => typeof window!=='undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Annual line chart. Lives in Advanced Details: the main view is the farm illustration.
function WaterChart({ before, after, index=null, context=false }) {
  const chartRef=useRef(null), [width,setWidth]=useState(760);
  useEffect(()=>{ const observer=new ResizeObserver(([entry])=>setWidth(Math.max(260,entry.contentRect.width))); observer.observe(chartRef.current); return ()=>observer.disconnect(); },[]);
  const days=(after??before).days, height=235, x=i=>46+i/(days.length-1)*(width-70), y=v=>195-v*1.55;
  const value=d=>context ? d.nasaWetness===null?null:d.nasaWetness*100:d.availablePercent;
  const path=result=>result.days.reduce((s,d,i)=>{ const v=value(d);return v===null?s:`${s} ${i===0||value(result.days[i-1])===null?'M':'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`; },'');
  return <svg ref={chartRef} className="water-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={context?'NASA POWER modeled root-zone wetness index over the historical year, scale zero to one':'Calculated plant-available soil water across the historical year, zero to one hundred percent of capacity'}>
    {[0,25,50,75,100].map(v=><g key={v}><line x1="46" x2={width-24} y1={y(v)} y2={y(v)} stroke="#e2e6dd"/><text x="37" y={y(v)+4} textAnchor="end">{context?v/100:`${v}%`}</text></g>)}
    {MONTHS.map((m,i)=>width<500&&i%2?null:<text key={m} x={x(days.findIndex(d=>Number(d.date.slice(5,7))===i+1))} y="221" textAnchor="middle">{m}</text>)}
    <path d={path(before)} fill="none" stroke={after&&!context?'#a58c65':'#376e64'} strokeWidth="2" strokeDasharray={after&&!context?'5 4':undefined}/>
    {after&&!context&&<path d={path(after)} fill="none" stroke="#376e64" strokeWidth="2.5"/>}
    {index!==null&&!context&&<><line x1={x(index)} x2={x(index)} y1="35" y2="195" stroke="#576b57" strokeDasharray="3 4"/><circle cx={x(index)} cy={y(value(days[index]))} r="4" fill="#244f47"/></>}
  </svg>;
}

function WeatherStrip({ day }) {
  return <div className="weather-strip" data-testid="weather-strip">
    <time className="weather-date" dateTime={day.date}>{dateLabel(day.date)}</time>
    <div className="weather-values"><span className="tag tag-nasa">NASA POWER daily</span>
      <span>Precip. <b>{fixed(day.rain)} mm</b></span>
      <span>High / low <b>{fixed(day.tMax)} / {fixed(day.tMin)} °C</b></span>
      <span>Humidity <b>{number(day.rh,0)}%</b></span>
      <span>Sunlight <b>{fixed(day.solar)} MJ/m²</b></span>
      <span>Wind <b>{fixed(day.wind)} m/s</b></span>
      <span>Pressure <b>{fixed(day.pressure)} kPa</b></span>
      <span className="calc">→ Drying demand <b>{fixed(day.et0)} mm</b> <i className="tag tag-calc">calculated</i></span>
    </div>
  </div>;
}

function SoilPanel({ frame, result, compareDay, compareLabel, startup, monthToDate }) {
  const { day } = frame, s=result.scenario;
  const status = !day.active ? {cls:'off',text:'Outside the crop season. No crop stress line applies.'}
    : day.dry ? {cls:'dry',text:'Dryness concern: water is below the crop stress line, so crop water use is being limited.'}
    : {cls:'ok',text:'Above the crop stress line: the crop can use water at the full calculated rate.'};
  const cautions = [];
  if (day.freezing) cautions.push(day.rain>0?'Freezing day with precipitation. Snow, snowmelt and frozen ground are not modeled; the soil-water change today is unreliable.':'Freezing day (low ≤ 0 °C). Frozen-ground effects are not modeled.');
  if (frame.startupActive) cautions.push(startup.date?`Until ${dateLabel(startup.date)}, results still depend on the assumed starting water (50% on Jan 1).`:'All year, results still depend on the assumed starting water (50% on Jan 1).');
  if (result.wrapsYear && day.active && Number(day.date.slice(5,7))<=s.harvest) cautions.push(`This crop was planted in ${MONTH_NAMES[s.planting-1]} ${s.year-1}. That autumn is not simulated, so Jan 1 storage is assumed, not carried over.`);
  const m = monthToDate;
  return <aside className="soil-panel" data-testid="soil-panel" aria-live="off">
    <h3>Soil conditions</h3>
    <p className="quiet">{dateLabel(day.date)} · calculated, not measured</p>
    <div className="panel-big"><strong data-testid="panel-percent">{number(day.availablePercent,0)}%</strong><span>{fixed(day.water)} of {number(result.capacity)} mm plant-available water</span></div>
    {compareDay&&<p className="panel-compare">{compareLabel} on this date: <b>{number(compareDay.availablePercent,0)}%</b> ({signed(day.availablePercent-compareDay.availablePercent,0)} pts)</p>}
    <p className={`panel-status status-${status.cls}`} data-testid="panel-status">{status.text}</p>
    <dl className="today-flows" data-testid="today-flows">
      <div><dt><i className="key key-nasa"/>NASA precipitation</dt><dd>+{mm(day.rain)} mm</dd></div>
      <div><dt><i className="key key-input"/>Irrigation</dt><dd>+{mm(day.irrigation)} mm</dd></div>
      <div><dt><i className="key key-calc"/>Water loss (evapotranspiration)</dt><dd>{day.actualET>0?'−':''}{mm(day.actualET)} mm</dd></div>
      <div><dt><i className="key key-drain"/>Drainage below layer</dt><dd>{day.drainage>0?'−':''}{mm(day.drainage)} mm</dd></div>
      <div className="net"><dt>Change in stored water</dt><dd>{signed(frame.change)} mm</dd></div>
    </dl>
    <p className="panel-explain" data-testid="panel-explain">{frame.explanation}</p>
    <div className="panel-exposure"><span>Soil exposure</span><strong>{number(100*day.exposedFraction,0)}% of surface</strong><small>Assumed for {day.active?'the crop season':OFF_SEASON[s.cover].toLowerCase()}{s.cover==='residue'?' with residue':''}. {fixed(day.exposedRain)} mm of today’s precipitation hit exposed soil. Not an erosion measurement.</small></div>
    {cautions.length>0&&<ul className="panel-cautions" data-testid="panel-cautions">{cautions.map(c=><li key={c}>{c}</li>)}</ul>}
    {m&&<div className="month-readout" data-testid="month-readout"><span>{MONTH_NAMES[Number(day.date.slice(5,7))-1]} 1–{Number(day.date.slice(8,10))}, summed from daily values</span>
      <p>Stored {fixed(m.start)} → {fixed(m.end)} mm · rain +{fixed(m.rain)} · irrigation +{fixed(m.irrigation)} · water loss −{mm(m.actualET)} · drainage {m.drainage>0?'−':''}{mm(m.drainage)}</p>
      <small>Balance check: {fixed(Math.abs(m.residual),3)} mm unexplained{m.dryDays?` · ${m.dryDays} day${m.dryDays>1?'s':''} below the stress line`:''}</small></div>}
  </aside>;
}

export default function VisualSimulator({farms,selected,onSelect,year,onResult}) {
  const [draft,setDraft]=useState(()=>defaults(selected));
  const [before,setBefore]=useState(null),[after,setAfter]=useState(null);
  const [load,setLoad]=useState('idle'),[error,setError]=useState('');
  const [index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[view,setView]=useState('after');
  const request=useRef(0),watch=useRef(null);
  const locationDraft={...draft,location:selected,year};
  const shown=before?.scenario.location===selected&&before.scenario.year===year?before:null;
  const compared=shown?after:null,current=compared??shown;
  const viewing=compared&&view==='before'?shown:current, other=compared?(viewing===shown?compared:shown):null;
  const changed=current&&JSON.stringify(current.scenario)!==JSON.stringify(locationDraft);
  const last=current?current.days.length-1:0, i=Math.min(index,last);
  const frame=useMemo(()=>viewing?sceneFrame(viewing,i,viewing.startup):null,[viewing,i]);
  const monthFirst=useMemo(()=>viewing?monthlyBalance(viewing).map(m=>m.first):[],[viewing]);
  const monthToDate=frame?periodBalance(viewing,monthFirst[Number(frame.date.slice(5,7))-1],i):null;
  const animate=playing&&!reducedMotion();
  useEffect(()=>{request.current++;setBefore(null);setAfter(null);setPlaying(false);setIndex(0);setLoad('idle');setError('');},[selected,year]);
  useEffect(()=>{onResult(current?{current,baseline:compared?shown:null}:null);},[current,compared,shown,onResult]);
  useEffect(()=>{
    if(!playing||!current) return;
    const timer=setInterval(()=>setIndex(k=>{if(k>=current.days.length-1){setPlaying(false);return k;}return k+1;}),110);
    return ()=>clearInterval(timer);
  },[playing,current]);
  function edit(key,value){setDraft(p=>({...p,[key]:value}));setPlaying(false);}
  function go(k){setPlaying(false);setIndex(Math.max(0,Math.min(last,k)));}
  async function run({demo=false,newBaseline=false}={}) {
    const scenario=demo?{...defaults('palouse'),year}:locationDraft;
    if(demo){onSelect('palouse');setDraft(defaults('palouse'));}
    const id=++request.current;
    setLoad('loading');setError('');setPlaying(false);
    try {
      const weather=await loadSoilWeather(farms.find(f=>f.id===scenario.location));
      if(id!==request.current) return;
      const simulated=runSoilSimulation(weather,scenario);
      if(simulated.status!=='ready') throw new Error(simulated.reason);
      const result={...simulated,startup:startupSensitivity(weather,scenario)};
      if(shown&&!newBaseline&&!demo){compareSoil(shown,result);setAfter(result);setView('after');}else{setBefore(result);setAfter(null);}
      setLoad('idle');setIndex(0);
      watch.current?.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'start'});
    } catch(e){if(id===request.current){setError(e.message);setLoad('error');}}
  }
  // One-click demo across locations: wait for location reset before starting its request.
  const [demoPending,setDemoPending]=useState(false);
  useEffect(()=>{if(demoPending&&selected==='palouse'){setDemoPending(false);run({demo:true});}},[demoPending,selected]);
  function demo(){if(selected!=='palouse'){onSelect('palouse');setDemoPending(true);}else run({demo:true});}
  const farmName=farms.find(f=>f.id===selected).name;
  const currentMonth=frame?Number(frame.date.slice(5,7)):0;
  const startup=viewing?.startup, startupEnd=startup?.status==='ready'?(startup.index??last+1):0;
  const comparison=compared?compareSoil(shown,compared):null, delta=key=>comparison?.find(c=>c.key===key);
  return <section id="visual-simulator" className="water-simulator">
    <div className="water-hero"><div><p className="eyebrow">REAL NASA WEATHER. CALCULATED SOIL WATER.</p><h1>Watch your field<br/><em>gain and lose water.</em></h1><p>Pick a farm setup, run a historical year of daily NASA weather through a soil-water model, then try a change and compare.</p></div><button className="primary" onClick={demo} disabled={load==='loading'}>Try the Palouse demo</button></div>
    <section className="customize"><h2><b>01</b> Customize farm</h2><p className="quiet">Scenario inputs, not measurements or planting recommendations.</p>
      <div className="soil-inputs">
        <label>Location<select aria-label="Location" value={selected} onChange={e=>onSelect(e.target.value)}>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Crop type<select aria-label="Crop type" value={draft.crop} onChange={e=>edit('crop',e.target.value)}>{Object.entries(MODEL.crops).map(([id,c])=><option key={id} value={id}>{c.label}</option>)}<option disabled>Other crops / rotations: parameters unavailable</option></select></label>
        <label>Net irrigation (mm/week)<input aria-label="Net irrigation (mm/week)" type="number" min="0" max="200" step="1" value={draft.irrigation} onChange={e=>edit('irrigation',e.target.value===''?'':Number(e.target.value))}/><small>Added evenly each day in your crop season.</small></label>
        <label>Soil type<select aria-label="Soil type" value={draft.soil} onChange={e=>edit('soil',e.target.value)}>{Object.entries(MODEL.soils).map(([id,s])=><option key={id} value={id}>{s.label}</option>)}</select><small>Generic storage values, not a soil survey.</small></label>
        <fieldset><legend>Growing season</legend><div className="month-pair">{[['planting','Planting month'],['harvest','Harvest month']].map(([key,label])=><label key={key}><span className="sr-only">{label}</span><select aria-label={label} value={draft[key]} onChange={e=>edit(key,Number(e.target.value))}>{MONTHS.map((m,k)=><option key={m} value={k+1}>{m}</option>)}</select></label>)}</div><small>{draft.planting>draft.harvest?`Crosses New Year: Jan–${MONTHS[draft.harvest-1]} belongs to a crop planted the previous autumn, which is not simulated.`:'First planting day → last harvest-month day.'}</small></fieldset>
        <label>Ground cover<select aria-label="Ground cover" value={draft.cover} onChange={e=>edit('cover',e.target.value)}>{Object.entries(COVER).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><small>Live cover grows only outside the crop season.</small></label>
      </div>
      <div className="run-row"><div><h2><b>02</b> Run simulation</h2><p className="quiet">{year} NASA weather · starts with 50% of available storage.<br/><a href="#soil-methods" onClick={openMethods}>Change historical year & review assumptions</a></p></div><button className="primary" onClick={()=>run()} disabled={load==='loading'}>{load==='loading'?'Loading NASA archive…':shown?'Run comparison':'Run simulation'}</button></div>
      {error&&<p className="error" role="alert">{error} <button onClick={()=>run()}>Retry simulation</button></p>}
      {changed&&<p className="pending-change" role="status">Inputs changed. Run comparison to calculate them; the farm still shows the last run.</p>}
    </section>
    <section className="water-watch" ref={watch}><div className="watch-heading"><h2><b>03</b> Watch your farm</h2><span>{farmName} · {year} historical weather</span></div>
      {!frame?<div className="water-empty"><strong>Rain in. Water used. Soil storage changes.</strong><p>Run your scenario to watch the calculated daily balance on your farm.</p></div>:<>
        {compared&&<div className="view-toggle" role="group" aria-label="Scenario shown in the farm view">{[['after','After (your change)'],['before','Before (baseline)']].map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</button>)}</div>}
        <div className="farm-layout"><div className="farm-card">
          <WeatherStrip day={frame.day}/>
          <FarmScene frame={frame} ghostPercent={other?other.days[i].availablePercent:null} ghostLabel={view==='before'?'After':'Before'} animate={animate}/>
          <p className="mobile-readout" aria-hidden="true"><b>{number(frame.percent,0)}% water</b> <span>+{mm(frame.flows.rain)} rain</span> <span>+{mm(frame.flows.irrigation)} irr.</span> <span>−{mm(frame.flows.actualET)} loss</span> <span>−{mm(frame.flows.drainage)} drain</span></p>
          <p className="stage-line" data-testid="stage-line">{frame.stage?<><b>{MODEL.crops[viewing.scenario.crop].label}: {frame.stage.label}</b> · assumed calendar stage, not predicted growth</>:<b>{OFF_SEASON[viewing.scenario.cover]}</b>}{frame.freezingPrecip&&<span className="freeze-flag"> · * Freezing-day precipitation: phase not modeled</span>}</p>
          <div className="playback" data-testid="playback">
            <button className="play" aria-label={playing?'Pause simulation':'Play simulation'} onClick={()=>{if(i>=last)setIndex(0);setPlaying(!playing);}}>{playing?'Pause':'Play'}</button>
            <button className="step" aria-label="Previous day" onClick={()=>go(i-1)} disabled={i===0}>‹</button>
            <div className="scrubber"><div className="startup-band" style={{width:`${100*Math.min(startupEnd,last)/Math.max(1,last)}%`}} title="Starting-water assumption still affects results" aria-hidden="true"/>
              <input type="range" aria-label="Simulation day" aria-valuetext={dateLabel(frame.date)} min="0" max={last} value={i} onChange={e=>go(Number(e.target.value))}/></div>
            <button className="step" aria-label="Next day" onClick={()=>go(i+1)} disabled={i===last}>›</button>
            <time dateTime={frame.date} data-testid="playback-date">{dateLabel(frame.date)}</time>
          </div>
          <div className="month-jump" role="group" aria-label="Jump to month">{MONTHS.map((m,k)=><button key={m} aria-label={`Jump to ${MONTH_NAMES[k]}`} aria-pressed={currentMonth===k+1} onClick={()=>go(monthFirst[k])}>{m}</button>)}</div>
          {startupEnd>0&&<p className="startup-key"><i aria-hidden="true"/>Shaded timeline: results still depend on the assumed Jan 1 starting water{startup.date?` (until ${dateLabel(startup.date)})`:' (all year)'}.</p>}
          <FlowLegend/>
        </div>
        <SoilPanel frame={frame} result={viewing} compareDay={other?.days[i]} compareLabel={view==='before'?'After':'Before'} startup={startup} monthToDate={monthToDate}/></div>
        <p className="water-limit">Illustration of modeled daily values, not an observed field. Plants follow the assumed season calendar; roots are a fixed schematic. Historical scenario, not a forecast. Generic soil and crop parameters; no snow, frozen ground, runoff routing, groundwater or field calibration. <a href="#soil-methods" onClick={openMethods}>Methods, yearly graph & NASA context</a></p>
      </>}
    </section>
    <section className="water-improve"><h2><b>04</b> Try an improvement</h2><div><p>Change irrigation, soil, crop dates or ground cover above, then run comparison. Live cover may use water as well as protect soil.</p>{shown&&<button onClick={()=>run({newBaseline:true})} disabled={load==='loading'}>Use current inputs as a new baseline</button>}</div></section>
    <section className="water-compare"><h2><b>05</b> Compare results</h2>{!compared?<p className="quiet">Run a second scenario to compare against your baseline on the same historical weather.</p>:<><p className="quiet">Before → after · identical {year} NASA weather, location and starting fraction. Calculated scenario results.</p><div className="water-comparison-cards" data-testid="soil-comparison">
      {[
        ['Annual mean available water','meanAvailablePercent','%',1,' pts'],['Days below crop stress line','dryDays',' days',0,' days'],['Precipitation on exposed soil','exposedRain',' mm',1,' mm']
      ].map(([label,key,unit,digits,deltaUnit])=><div key={key}><span>{label}</span><strong>{number(shown.summary[key],digits)}{unit} <i>→</i> {number(compared.summary[key],digits)}{unit}</strong><em className="delta">{signed(delta(key).delta,digits)}{deltaUnit}</em></div>)}
      </div><p className="quiet">Irrigation applied: {number(shown.summary.irrigation)} → {number(compared.summary.irrigation)} mm. Water loss: {number(shown.summary.actualET)} → {number(compared.summary.actualET)} mm. Drainage: {number(shown.summary.drainage)} → {number(compared.summary.drainage)} mm. Lower exposure is not proof of improved soil health.</p>
      {[shown,compared].some(r=>r.startup?.status==='ready'&&r.days.slice(0,r.startup.index??r.days.length).some(d=>d.active))&&<p className="quiet compare-caution">Caution: in at least one scenario the assumed starting water still matters during the crop season, so part of this difference reflects that assumption.</p>}
      <div className="scenario-pair">{[['Before',shown],['After',compared]].map(([label,result])=><p key={label}><strong>{label}:</strong> {MODEL.crops[result.scenario.crop].label}, {result.scenario.soil}, {result.scenario.irrigation} mm/week, {MONTHS[result.scenario.planting-1]}–{MONTHS[result.scenario.harvest-1]}, {COVER[result.scenario.cover]}.</p>)}</div></>}</section>
  </section>;
}

export function SoilMethods({year,onYear,result,baseline}) {
  const months=useMemo(()=>result?monthlyBalance(result):[],[result]);
  return <section id="soil-methods" className="soil-methods"><h2>Daily soil-water model: methods & sources</h2><label>Historical weather year<select aria-label="Historical weather year" value={year} onChange={e=>onYear(Number(e.target.value))}>{[2021,2022,2023,2024,2025].map(y=><option key={y}>{y}</option>)}</select></label><p>Changing location or year starts a new comparison. Daily soil weather covers 2021–2025; the original 1981–2025 climate and M5 archives remain below.</p>
    {result&&<><h3>Yearly graph · plant-available soil water</h3><WaterChart before={baseline??result} after={baseline?result:null}/><p className="quiet">{baseline?'Dashed: before (baseline). Solid: after.':'Your scenario.'} 0% = wilting-point storage, 100% = field capacity of the modeled layer.</p>
      <h3>Monthly water balance · summed from daily values</h3>
      <div className="table-scroll"><table className="month-balance" data-testid="month-balance"><thead><tr><th>Month</th><th>Start mm</th><th>+ Rain</th><th>+ Irrigation</th><th>− Water loss</th><th>− Drainage</th><th>End mm</th><th>Residual</th></tr></thead>
        <tbody>{months.map(m=><tr key={m.month}><th>{MONTHS[m.month-1]}</th><td>{fixed(m.start)}</td><td>{fixed(m.rain)}</td><td>{fixed(m.irrigation)}</td><td>{fixed(m.actualET)}</td><td>{fixed(m.drainage)}</td><td>{fixed(m.end)}</td><td>{Math.abs(m.residual)<1e-9?'0':m.residual.toExponential(1)}</td></tr>)}</tbody></table></div>
      <p className="quiet">Start/end are storage states (never summed); fluxes are sums of each month’s daily records. {fixed(result.summary.freezingPrecip)} of {fixed(result.summary.rain)} mm precipitation fell on freezing days and is treated as immediate liquid input.</p>
      {result.startup?.status==='ready'&&<p className="quiet" data-testid="startup-note">Starting-water sensitivity: the year was re-run from an empty and from a full store. {result.startup.date?`The two runs agree within ${result.startup.tolerance} mm from ${dateLabel(result.startup.date)}; earlier days depend on the assumed 50% Jan 1 storage.`:'The two runs never agree this year, so every day depends on the assumed 50% Jan 1 storage.'}</p>}</>}
    <h3>What NASA contributes</h3><ul><li><strong>POWER precipitation:</strong> daily water input to the bucket and precipitation-exposure calculation.</li><li><strong>POWER maximum/minimum temperature, RH2M humidity, solar radiation, WS2M wind and PS pressure:</strong> drive daily FAO-56 Penman–Monteith reference evapotranspiration. These are gridded satellite/reanalysis products, not field weather-station observations.</li><li><strong>POWER GWETROOT:</strong> dimensionless modeled root-zone wetness shown only as regional context. It neither initializes nor validates our soil bucket; the units and spatial support differ.</li><li><strong>SMAP SPL3SMP v9:</strong> unavailable. The metadata request was blocked (HTTP 403); Earthdata-authenticated granules were not retrieved or quality-validated. <a href="./data/smap-status.json">Access record</a> · <a href="https://nsidc.org/data/spl3smp/versions/9">NSIDC product documentation</a>. The 36 km surface retrieval would be independent regional context, not a measurement of this field.</li></ul>
    <h3>How the farm illustration is driven</h3><p>Each frame draws one calculated day. Soil colour blends from a dry to a moist tone in proportion to that day’s plant-available percentage; the whole layer has one colour because the model is one well-mixed store. Arrow widths are linear in that day’s millimetres (1.6 drawing units per mm, at least 2.5 units for any non-zero flow, capped visually at 25 mm with the true value labelled). Falling marks appear only on days with NASA precipitation, in five classes (none, under 1, 1–5, 5–15, 15+ mm). On days with a low ≤ 0 °C, precipitation is drawn grey and dashed because its phase is not modeled. Sky brightness follows NASA solar radiation. Plant size and colour follow the assumed 20/30/30/20% stage calendar, not simulated growth; roots are a fixed schematic.</p>
    <h3>Transparent assumptions</h3><p>{MODEL.assumptions.note}</p><p>Spring wheat, dry peas and potatoes use FAO-56 table 12 coefficients, with unadjusted standard-climate values. Assumed stage fractions are 20/30/30/20% of the chosen season, not a plant-growth calculation. Soil field capacity / wilting point: sand 0.12 / 0.05, loam 0.36 / 0.16, clay 0.39 / 0.27 m³/m³ (generic published values). The 0.6 m layer is fixed across crops to isolate demand; it is not a crop-specific root-depth estimate.</p>
    <p>Crop-season exposure is assumed 20%. Residue covers 70% of otherwise exposed ground; outside the crop season, live cover leaves 30% exposed and uses reference-grass demand. These cover fractions are hypothetical. Residue adjusts initial Kc and the Kc−Kcb mid/end differences using FAO’s approximate organic-mulch rule. Live cover is terminated at planting; mixed cropping and cover-crop species are not modeled.</p>
    <p>Seasons that cross New Year (planting month after harvest month): January through the harvest month belong to a crop planted the previous autumn. That autumn is not simulated; each selected year still starts on Jan 1 from the assumed storage.</p>
    <h3>Daily calculation</h3><p>Available capacity = 1,000 × (field capacity − wilting point) × 0.6 m. Rain and net irrigation refill it; excess drains immediately. Potential demand = reference ET × the crop/cover coefficient. A FAO-style depletion factor reduces actual loss when water becomes limiting, and loss cannot exceed available water. Remaining water = previous water + rain + irrigation − drainage − actual loss.</p><p>Daily mean humidity approximates FAO equation 19; daily ground heat flux is zero. The model has one well-mixed store and no separate surface-evaporation layer. The single-coefficient stress adjustment also limits evaporation, an approximation; off-season bare Kc = 0.3 is hypothetical. Cloud and net-demand terms are bounded to avoid negative loss. Initial storage, stage timing and cover can materially affect results. No measured soil health, crop damage or yield is inferred.</p>
    {result&&<><p><a href={`./data/${result.scenario.location}/soil-weather.json`}>NASA weather, units & archive provenance</a> · Model {result.modelVersion} · Annual balance residual: {number(result.summary.massBalanceError,9)} mm · {result.summary.coldDays} days with minimum temperature ≤ 0°C (snow and frozen soil omitted).</p><h3>NASA modeled wetness context · index 0–1</h3><WaterChart before={result} context/><p>This chart is not the model’s plant-available-water percentage and is not a field validation.</p><h3>Daily calculation for the first day</h3><p>{result.days[0].date}: precipitation {number(result.days[0].rain)} mm; Tmin / Tmax {number(result.days[0].tMin)} / {number(result.days[0].tMax)} °C; humidity {number(result.days[0].rh)}%; solar {number(result.days[0].solar)} MJ/m²/day; wind {number(result.days[0].wind)} m/s; pressure {number(result.days[0].pressure)} kPa; reference ET {number(result.days[0].et0)} mm/day.</p></>}
    <ul className="method-sources">{Object.values(MODEL.sources).map(source=><li key={source.url}><a href={source.url}>{source.title}</a></li>)}</ul>
  </section>;
}
