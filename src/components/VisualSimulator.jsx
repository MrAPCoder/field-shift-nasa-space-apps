import React, { useEffect, useRef, useState } from 'react';
import { MODEL, loadSoilWeather, runSoilSimulation, compareSoil } from '../lib/soilWater.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const COVER = { bare:'Bare between crops', residue:'Crop residue · 70% assumed cover', cover:'Cover crops · reference-grass scenario' };
const defaults = location => ({location,crop:'spring_wheat',soil:'loamy',irrigation:0,planting:4,harvest:8,cover:'bare'});
const number = (v,digits=1) => v == null || !Number.isFinite(v) ? 'Unavailable' : v.toLocaleString('en-US',{maximumFractionDigits:digits});
const dateLabel = date => new Date(date+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const openMethods = () => { document.getElementById('advanced-details').open=true; };

function WaterChart({ before, after, index, context=false }) {
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
    {!context&&<><line x1={x(index)} x2={x(index)} y1="35" y2="195" stroke="#576b57" strokeDasharray="3 4"/><circle cx={x(index)} cy={y(value(days[index]))} r="4" fill="#244f47"/></>}
  </svg>;
}

function SoilColumn({day,capacity}) {
  return <div className="soil-column" role="img" aria-label={`Calculated available water ${number(day.water)} of ${number(capacity)} millimetres`}>
    <div className="soil-column-fill" style={{height:`${day.availablePercent}%`}}/>
    <div className="soil-column-label"><strong>{number(day.availablePercent,0)}%</strong><span>available water<br/>remaining</span></div>
    <span className="soil-column-depth">0.6 m modeled layer</span>
  </div>;
}

export default function VisualSimulator({farms,selected,onSelect,year,onResult}) {
  const [draft,setDraft]=useState(()=>defaults(selected));
  const [before,setBefore]=useState(null),[after,setAfter]=useState(null);
  const [load,setLoad]=useState('idle'),[error,setError]=useState('');
  const [index,setIndex]=useState(0),[playing,setPlaying]=useState(false);
  const request=useRef(0),watch=useRef(null);
  const locationDraft={...draft,location:selected,year};
  const shown=before?.scenario.location===selected&&before.scenario.year===year?before:null;
  const compared=shown?after:null,current=compared??shown;
  const changed=current&&JSON.stringify(current.scenario)!==JSON.stringify(locationDraft);
  const day=current?.days[Math.min(index,current.days.length-1)];
  useEffect(()=>{request.current++;setBefore(null);setAfter(null);setPlaying(false);setIndex(0);setLoad('idle');setError('');},[selected,year]);
  useEffect(()=>{onResult(current);},[current,onResult]);
  useEffect(()=>{
    if(!playing||!current) return;
    const timer=setInterval(()=>setIndex(i=>{if(i>=current.days.length-1){setPlaying(false);return i;}return i+1;}),100);
    return ()=>clearInterval(timer);
  },[playing,current]);
  function edit(key,value){setDraft(p=>({...p,[key]:value}));setPlaying(false);}
  async function run({demo=false,newBaseline=false}={}) {
    const scenario=demo?{...defaults('palouse'),year}:locationDraft;
    if(demo){onSelect('palouse');setDraft(defaults('palouse'));}
    const id=++request.current;
    setLoad('loading');setError('');setPlaying(false);
    try {
      const weather=await loadSoilWeather(farms.find(f=>f.id===scenario.location));
      if(id!==request.current) return;
      const result=runSoilSimulation(weather,scenario);
      if(result.status!=='ready') throw new Error(result.reason);
      if(shown&&!newBaseline&&!demo){compareSoil(shown,result);setAfter(result);}else{setBefore(result);setAfter(null);}
      setLoad('idle');setIndex(0);
      watch.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    } catch(e){if(id===request.current){setError(e.message);setLoad('error');}}
  }
  // One-click demo across locations: wait for location reset before starting its request.
  const [demoPending,setDemoPending]=useState(false);
  useEffect(()=>{if(demoPending&&selected==='palouse'){setDemoPending(false);run({demo:true});}},[demoPending,selected]);
  function demo(){if(selected!=='palouse'){onSelect('palouse');setDemoPending(true);}else run({demo:true});}
  const farmName=farms.find(f=>f.id===selected).name;
  return <section id="visual-simulator" className="water-simulator">
    <div className="water-hero"><div><p className="eyebrow">HISTORICAL WEATHER. CALCULATED SOIL WATER.</p><h1>What keeps your<br/><em>soil from drying out?</em></h1><p>Run a daily water balance with real NASA weather. Change a farm choice and compare the difference.</p></div><button className="primary" onClick={demo} disabled={load==='loading'}>Try the Palouse demo</button></div>
    <section className="customize"><h2><b>01</b> Customize farm</h2><p className="quiet">Scenario inputs, not measurements or planting recommendations.</p>
      <div className="soil-inputs">
        <label>Location<select aria-label="Location" value={selected} onChange={e=>onSelect(e.target.value)}>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Crop type<select aria-label="Crop type" value={draft.crop} onChange={e=>edit('crop',e.target.value)}>{Object.entries(MODEL.crops).map(([id,c])=><option key={id} value={id}>{c.label}</option>)}<option disabled>Other crops / rotations: parameters unavailable</option></select></label>
        <label>Net irrigation (mm/week)<input aria-label="Net irrigation (mm/week)" type="number" min="0" max="200" step="1" value={draft.irrigation} onChange={e=>edit('irrigation',e.target.value===''?'':Number(e.target.value))}/><small>Added evenly each day in your crop season.</small></label>
        <label>Soil type<select aria-label="Soil type" value={draft.soil} onChange={e=>edit('soil',e.target.value)}>{Object.entries(MODEL.soils).map(([id,s])=><option key={id} value={id}>{s.label}</option>)}</select><small>Generic storage values, not a soil survey.</small></label>
        <fieldset><legend>Growing season</legend><div className="month-pair">{[['planting','Planting month'],['harvest','Harvest month']].map(([key,label])=><label key={key}><span className="sr-only">{label}</span><select aria-label={label} value={draft[key]} onChange={e=>edit(key,Number(e.target.value))}>{MONTHS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select></label>)}</div><small>First planting day → last harvest-month day.</small></fieldset>
        <label>Ground cover<select aria-label="Ground cover" value={draft.cover} onChange={e=>edit('cover',e.target.value)}>{Object.entries(COVER).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><small>Live cover grows only outside the crop season.</small></label>
      </div>
      <div className="run-row"><div><h2><b>02</b> Run simulation</h2><p className="quiet">{year} NASA weather · starts with 50% of available storage.<br/><a href="#soil-methods" onClick={openMethods}>Change historical year & review assumptions</a></p></div><button className="primary" onClick={()=>run()} disabled={load==='loading'}>{load==='loading'?'Loading NASA archive…':shown?'Run comparison':'Run simulation'}</button></div>
      {error&&<p className="error" role="alert">{error} <button onClick={()=>run()}>Retry simulation</button></p>}
      {changed&&<p className="pending-change" role="status">Inputs changed. Run comparison to calculate them; the chart still shows the last run.</p>}
    </section>
    <section className="water-watch" ref={watch}><div className="watch-heading"><h2><b>03</b> Watch soil conditions</h2><span>{farmName} · {year} historical scenario</span></div>
      {!current?<div className="water-empty"><strong>Rain in. Water used. Soil storage changes.</strong><p>Run your scenario to see the calculated daily balance.</p></div>:<>
        <div className="water-layout"><div className="water-plot-card"><div className="plot-title"><h3>Plant-available soil water</h3><span>Calculated · % of available capacity</span></div>
          <WaterChart before={shown} after={compared} index={index}/>
          <div className="chart-legend">{compared?<><span className="before-key">Before</span><span className="after-key">After</span></>:<span className="after-key">Your scenario</span>}<span>0% = wilting-point storage · 100% = field capacity</span></div>
          <div className="playback"><button aria-label={playing?'Pause simulation':'Play simulation'} onClick={()=>{if(index>=current.days.length-1)setIndex(0);setPlaying(!playing);}}>{playing?'Pause':'Play'}</button><input type="range" aria-label="Simulation day" aria-valuetext={dateLabel(day.date)} min="0" max={current.days.length-1} value={index} onChange={e=>{setIndex(Number(e.target.value));setPlaying(false);}}/><time>{dateLabel(day.date)}</time></div>
          <div className="daily-flows"><div><span>NASA precipitation</span><strong>+{number(day.rain)} mm</strong></div><div><span>User irrigation</span><strong>+{number(day.irrigation)} mm</strong></div><div><span>Calculated water loss</span><strong>−{number(day.actualET)} mm</strong></div><div><span>Calculated drainage</span><strong>−{number(day.drainage)} mm</strong></div></div>
          <p className="quiet daily-demand">NASA-driven reference demand: <strong>{number(day.et0)} mm/day</strong> · Crop/cover demand: <strong>{number(day.demand)} mm/day</strong></p>
        </div><aside className="water-conditions"><h3>Soil Conditions</h3><p className="quiet">{compared ? 'After scenario · ' : ''}Calculated water, not measured soil health.</p><div className="soil-reading"><SoilColumn day={day} capacity={current.capacity}/><div><strong>{number(day.water)} <small>mm</small></strong><span>available of {number(current.capacity)} mm capacity</span><p>{day.dry?'Below the crop depletion threshold':day.active?'Above the crop depletion threshold':'Outside the cash-crop season'}</p><small>Generic {MODEL.soils[current.scenario.soil].label.toLowerCase()} soil · hypothetical 0.6 m layer</small></div></div><div className="exposure-reading"><span>Today’s precipitation exposure</span><strong>{number(day.exposedRain)} mm</strong><small>Calculated rain × assumed exposed fraction ({number(day.exposedFraction*100,0)}%). Not erosion.</small></div><p className="quiet">{day.tMin<=0?'Freezing weather: snow and frozen soil are not modeled. Treat this period with extra caution.':'No crop damage, growth or yield is predicted.'}</p></aside></div>
        <p className="water-limit">Simplified historical scenario, not a forecast. Generic soil and crop parameters; no snow storage, runoff routing, groundwater, or field calibration. <a href="#soil-methods" onClick={openMethods}>Methods & NASA context</a></p>
      </>}
    </section>
    <section className="water-improve"><h2><b>04</b> Try an improvement</h2><div><p>Change irrigation, soil, crop dates or ground cover above, then run comparison. Live cover may use water as well as protect soil.</p>{shown&&<button onClick={()=>run({newBaseline:true})} disabled={load==='loading'}>Use current inputs as a new baseline</button>}</div></section>
    <section className="water-compare"><h2><b>05</b> Compare results</h2>{!compared?<p className="quiet">Run a second scenario to compare against your baseline on the same historical weather.</p>:<><p className="quiet">Before → after · identical {year} NASA weather, location and starting fraction. Calculated scenario results.</p><div className="water-comparison-cards" data-testid="soil-comparison">
      {[
        ['Annual mean available water','meanAvailablePercent','%',1],['Days below crop depletion threshold','dryDays',' days',0],['Precipitation exposure','exposedRain',' mm',1]
      ].map(([label,key,unit,digits])=><div key={key}><span>{label}</span><strong>{number(shown.summary[key],digits)}{unit} <i>→</i> {number(compared.summary[key],digits)}{unit}</strong></div>)}
      </div><p className="quiet">Irrigation applied: {number(shown.summary.irrigation)} → {number(compared.summary.irrigation)} mm. Drainage: {number(shown.summary.drainage)} → {number(compared.summary.drainage)} mm. Lower exposure is not proof of improved soil health.</p><div className="scenario-pair">{[['Before',shown],['After',compared]].map(([label,result])=><p key={label}><strong>{label}:</strong> {MODEL.crops[result.scenario.crop].label}, {result.scenario.soil}, {result.scenario.irrigation} mm/week, {MONTHS[result.scenario.planting-1]}–{MONTHS[result.scenario.harvest-1]}, {COVER[result.scenario.cover]}.</p>)}</div></>}</section>
  </section>;
}

export function SoilMethods({year,onYear,result}) {
  return <section id="soil-methods" className="soil-methods"><h2>Daily soil-water model: methods & sources</h2><label>Historical weather year<select aria-label="Historical weather year" value={year} onChange={e=>onYear(Number(e.target.value))}>{[2021,2022,2023,2024,2025].map(y=><option key={y}>{y}</option>)}</select></label><p>Changing location or year starts a new comparison. Daily soil weather covers 2021–2025; the original 1981–2025 climate and M5 archives remain below.</p>
    <h3>What NASA contributes</h3><ul><li><strong>POWER precipitation:</strong> daily water input to the bucket and precipitation-exposure calculation.</li><li><strong>POWER maximum/minimum temperature, RH2M humidity, solar radiation, WS2M wind and PS pressure:</strong> drive daily FAO-56 Penman–Monteith reference evapotranspiration. These are gridded satellite/reanalysis products, not field weather-station observations.</li><li><strong>POWER GWETROOT:</strong> dimensionless modeled root-zone wetness shown only as regional context. It neither initializes nor validates our soil bucket; the units and spatial support differ.</li><li><strong>SMAP SPL3SMP v9:</strong> unavailable. The metadata request was blocked (HTTP 403); Earthdata-authenticated granules were not retrieved or quality-validated. <a href="./data/smap-status.json">Access record</a> · <a href="https://nsidc.org/data/spl3smp/versions/9">NSIDC product documentation</a>. The 36 km surface retrieval would be independent regional context, not a measurement of this field.</li></ul>
    <h3>Transparent assumptions</h3><p>{MODEL.assumptions.note}</p><p>Spring wheat, dry peas and potatoes use FAO-56 table 12 coefficients, with unadjusted standard-climate values. Assumed stage fractions are 20/30/30/20% of the chosen season, not a plant-growth calculation. Soil field capacity / wilting point: sand 0.12 / 0.05, loam 0.36 / 0.16, clay 0.39 / 0.27 m³/m³ (generic published values). The 0.6 m layer is fixed across crops to isolate demand; it is not a crop-specific root-depth estimate.</p>
    <p>Crop-season exposure is assumed 20%. Residue covers 70% of otherwise exposed ground; outside the crop season, live cover leaves 30% exposed and uses reference-grass demand. These cover fractions are hypothetical. Residue adjusts initial Kc and the Kc−Kcb mid/end differences using FAO’s approximate organic-mulch rule. Live cover is terminated at planting; mixed cropping and cover-crop species are not modeled.</p>
    <h3>Daily calculation</h3><p>Available capacity = 1,000 × (field capacity − wilting point) × 0.6 m. Rain and net irrigation refill it; excess drains immediately. Potential demand = reference ET × the crop/cover coefficient. A FAO-style depletion factor reduces actual loss when water becomes limiting, and loss cannot exceed available water. Remaining water = previous water + rain + irrigation − drainage − actual loss.</p><p>Daily mean humidity approximates FAO equation 19; daily ground heat flux is zero. The model has one well-mixed store and no separate surface-evaporation layer. The single-coefficient stress adjustment also limits evaporation, an approximation; off-season bare Kc = 0.3 is hypothetical. Cloud and net-demand terms are bounded to avoid negative loss. Initial storage, stage timing and cover can materially affect results. No measured soil health, crop damage or yield is inferred.</p>
    {result&&<><p><a href={`./data/${result.scenario.location}/soil-weather.json`}>NASA weather, units & archive provenance</a> · Model {result.modelVersion} · Annual balance residual: {number(result.summary.massBalanceError,9)} mm · {result.summary.coldDays} days with minimum temperature ≤ 0°C (snow and frozen soil omitted).</p><h3>NASA modeled wetness context · index 0–1</h3><WaterChart before={result} index={0} context/><p>This chart is not the model’s plant-available-water percentage and is not a field validation.</p><h3>Daily calculation for the first day</h3><p>{result.days[0].date}: precipitation {number(result.days[0].rain)} mm; Tmin / Tmax {number(result.days[0].tMin)} / {number(result.days[0].tMax)} °C; humidity {number(result.days[0].rh)}%; solar {number(result.days[0].solar)} MJ/m²/day; wind {number(result.days[0].wind)} m/s; pressure {number(result.days[0].pressure)} kPa; reference ET {number(result.days[0].et0)} mm/day.</p></>}
    <ul className="method-sources">{Object.values(MODEL.sources).map(source=><li key={source.url}><a href={source.url}>{source.title}</a></li>)}</ul>
  </section>;
}
