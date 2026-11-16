import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MODEL, loadSoilWeather, runSoilSimulation, compareSoil, startupSensitivity, monthlyBalance } from '../lib/soilWater.js';
import { sceneFrame, mm } from '../lib/scene.js';
import { analyzeFarm, gradeScenario } from '../lib/grade.js';
import FarmScene, { FLOW_COLORS } from './FarmScene.jsx';
import ScorePanel from './ScorePanel.jsx';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const YEARS = [2021,2022,2023,2024,2025];
const COVER = { bare:'Bare between crops', residue:'Crop residue (70% cover)', cover:'Cover crop between seasons' };
const OFF_SEASON = { bare:'Bare soil between crops', residue:'Crop residue on the surface', cover:'Cover crop growing between seasons' };
const DEMO = MODEL.demo;
const defaults = location => ({location,crop:'spring_wheat',soil:'loamy',irrigation:0,planting:4,harvest:8,cover:'bare'});
const demoScenario = irrigation => ({location:DEMO.location,crop:DEMO.crop,soil:DEMO.soil,irrigation,planting:DEMO.planting,harvest:DEMO.harvest,cover:DEMO.cover});
const number = (v,digits=1) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US',{maximumFractionDigits:digits});
const fixed = (v,digits=1) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US',{maximumFractionDigits:digits,minimumFractionDigits:digits});
// Values that round to zero are shown as ±0, never as −0.0.
const signed = (v,digits=1) => { const r=Number(Math.abs(v).toFixed(digits)); return `${r===0?'±':v>0?'+':'−'}${fixed(r,digits)}`; };
const pct = v => v == null ? '—' : `${Math.round(100*v)}%`;
const dateLabel = date => new Date(date+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const reducedMotion = () => typeof window!=='undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const SCENARIO_KEYS = ['location','crop','soil','irrigation','planting','harvest','cover','year'];
const describe = s => `${MODEL.crops[s.crop].label}, ${MODEL.soils[s.soil].label.toLowerCase()} soil, ${s.irrigation} mm/week, ${MONTHS[s.planting-1]}–${MONTHS[s.harvest-1]}, ${COVER[s.cover].toLowerCase()}`;
const dayOfYear = (year,month) => Math.round((Date.UTC(year,month-1,1)-Date.UTC(year,0,1))/864e5);

// The day's numbers, keyed by the same colours as the scene.
function Readout({ frame, result, compareDay, compareLabel, startup }) {
  const { day } = frame, s = result.scenario;
  const notes = [];
  // Freezing-day precipitation is already explained in the day's sentence; only frost needs a note.
  // Only warnings that make today's result unreliable are shown here.
  // Freezing-day precipitation is already flagged in the day's sentence; frost alone gets a note.
  if (day.freezing && !(day.rain>0)) notes.push('Freezing day: frozen ground is not modeled.');
  if (result.wrapsYear && day.active && Number(day.date.slice(5,7))<=s.harvest) notes.push(`Planted in ${MONTH_NAMES[s.planting-1]} ${s.year-1}. That autumn is not simulated.`);
  return <div className="readout" data-testid="soil-panel">
    <div className="readout-main">
      <p className="micro">Soil water</p>
      <p className="readout-value"><strong data-testid="panel-percent">{number(day.availablePercent,0)}%</strong> <span>{fixed(day.water)} / {number(result.capacity)} mm</span></p>
      {compareDay&&<p className="readout-compare">{compareLabel}: {number(compareDay.availablePercent,0)}%</p>}
      <p className={`pill pill-${!day.active?'off':day.dry?'stress':'ok'}`} data-testid="panel-status">{!day.active?'Between crops':day.dry?'Water stress':'No stress'}</p>
      {day.drainage>0&&<p className="pill pill-water" data-testid="panel-overflow">Soil full · {mm(day.drainage)} mm drained</p>}
    </div>
    <dl className="readout-flows" data-testid="today-flows">
      <div><dt><i style={{background:FLOW_COLORS.rain}}/>Rain (NASA)</dt><dd>+{mm(day.rain)} mm</dd></div>
      <div><dt><i style={{background:FLOW_COLORS.irrigation}}/>Irrigation</dt><dd>+{mm(day.irrigation)} mm</dd></div>
      <div><dt><i style={{background:FLOW_COLORS.et}}/>Water use</dt><dd>−{mm(day.actualET)} mm{frame.waterLimited&&<small> of {mm(day.demand)}</small>}</dd></div>
      <div><dt><i style={{background:FLOW_COLORS.drainage}}/>Drainage</dt><dd>−{mm(day.drainage)} mm</dd></div>
      <div className="net"><dt>Net change</dt><dd>{signed(frame.change)} mm</dd></div>
    </dl>
    <p className="readout-explain" data-testid="panel-explain">{frame.explanation}</p>
    {notes.length>0&&<ul className="readout-notes" data-testid="panel-cautions">{notes.map(c=><li key={c}>{c}</li>)}</ul>}
  </div>;
}

// Five calculated steps that tell the demo story; every number comes from the two runs and the analysis.
function DemoStory({ base, irrigated, analysis, year }) {
  const b=base.score.metrics, a=irrigated.score.metrics, opt=analysis?.status==='SCORED'?analysis.options.balanced:null;
  const steps=[
    ['Farm',`Palouse wheat · Apr–Aug ${year} · ${number(b.seasonRain,0)} mm rain`],
    ['No irrigation',`${pct(b.demandMet)} of demand met · ${b.stressDays} stress days`],
    [`${DEMO.illustrativeIrrigation} mm/week (illustrative)`,`${a.stressDays} stress days · ${number(irrigated.result.summary.drainage,0)} mm drained`],
    ['Problem',analysis?.problem?.title??'…'],
    ['Tested fix',opt?`${opt.action} · score ${opt.totalBefore} → ${opt.totalAfter}`:analysis?'None found':'…'],
  ];
  return <ol className="demo-story" data-testid="demo-story" aria-label="Demo walkthrough">{steps.map(([k,v])=><li key={k}><b>{k}</b><span>{v}</span></li>)}</ol>;
}

export default function VisualSimulator({farms,selected,onSelect,year,onYear}) {
  const [draft,setDraft]=useState(()=>defaults(selected));
  const [before,setBefore]=useState(null),[after,setAfter]=useState(null);
  const [load,setLoad]=useState('idle'),[error,setError]=useState('');
  const [index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[view,setView]=useState('after');
  const [weather,setWeather]=useState(null),[demoMode,setDemoMode]=useState(false),[applied,setApplied]=useState(null);
  const [analysis,setAnalysis]=useState(null),[priority,setPriority]=useState('balanced');
  const request=useRef(0),scoreRef=useRef(null),farmRef=useRef(null),demoPending=useRef(false);
  const locationDraft={...draft,location:selected,year};
  const shown=before?.scenario.location===selected&&before.scenario.year===year?before:null;
  const compared=shown?after:null,current=compared??shown;
  const viewing=compared&&view==='before'?shown:current, other=compared?(viewing===shown?compared:shown):null;
  const changed=current&&SCENARIO_KEYS.some(k=>current.scenario[k]!==locationDraft[k]);
  const last=current?current.days.length-1:0, i=Math.min(index,last);
  const frame=useMemo(()=>viewing?sceneFrame(viewing,i,viewing.startup):null,[viewing,i]);
  const monthFirst=useMemo(()=>viewing?monthlyBalance(viewing).map(m=>m.first):[],[viewing]);
  const weatherOk=r=>r&&weather?.farm.id===r.scenario.location&&weather.fingerprint===r.weatherFingerprint;
  // Score, biggest problem and tested options for the scenario on screen; deferred so the farm paints first.
  useEffect(()=>{
    setAnalysis(null);
    if(!weatherOk(current)) return;
    const t=setTimeout(()=>setAnalysis({key:current,value:analyzeFarm(weather,current.scenario)}),20);
    return ()=>clearTimeout(t);
  },[current,weather]);
  const shownAnalysis=analysis?.key===current?analysis.value:null;
  const graded=useMemo(()=>compared&&weatherOk(shown)&&weatherOk(compared)?(compareSoil(shown,compared),[gradeScenario(weather,shown.scenario),gradeScenario(weather,compared.scenario)]):null,[shown,compared,weather]);
  const animate=playing&&!reducedMotion();
  // New location or year: clear the old run and simulate the current settings there (or the demo).
  useEffect(()=>{
    request.current++;setBefore(null);setAfter(null);setPlaying(false);setIndex(0);setLoad('idle');setError('');setDemoMode(false);setApplied(null);
    if(demoPending.current&&selected===DEMO.location){demoPending.current=false;run({mode:'demo'});}
    else run({mode:'baseline',scenario:{...draft,location:selected,year}});
  },[selected,year]);
  useEffect(()=>{
    if(!playing||!current) return;
    const timer=setInterval(()=>setIndex(k=>{if(k>=current.days.length-1){setPlaying(false);return k;}return k+1;}),reducedMotion()?220:90);
    return ()=>clearInterval(timer);
  },[playing,current]);
  function edit(key,value){setDraft(p=>({...p,[key]:value}));setPlaying(false);}
  function go(k){setPlaying(false);setIndex(Math.max(0,Math.min(last,k)));}
  async function simulate(scenario) {
    const w=await loadSoilWeather(farms.find(f=>f.id===scenario.location));
    const simulated=runSoilSimulation(w,scenario);
    if(simulated.status!=='ready') throw new Error(simulated.reason);
    return {w,result:{...simulated,startup:startupSensitivity(w,scenario)}};
  }
  // mode: 'compare' (after vs. frozen baseline), 'baseline' (replace), 'demo', or 'apply' (try a tested option).
  async function run({mode='compare',scenario=null,label=null}={}) {
    const id=++request.current;
    setLoad('loading');setError('');setPlaying(false);
    try {
      if(mode==='demo'){
        const base={...demoScenario(DEMO.baselineIrrigation),year}, illus={...demoScenario(DEMO.illustrativeIrrigation),year};
        const a=await simulate(base), b=await simulate(illus);
        if(id!==request.current) return;
        compareSoil(a.result,b.result);
        setWeather(a.w);setBefore(a.result);setAfter(b.result);setView('after');setDraft(demoScenario(DEMO.illustrativeIrrigation));setDemoMode(true);setApplied(null);setPriority('balanced');
        setIndex(dayOfYear(year,DEMO.planting));
      } else {
        const next=scenario??locationDraft, baseline=current;
        const {w,result}=await simulate(next);
        if(id!==request.current) return;
        setWeather(w);
        if(mode==='apply'){
          compareSoil(baseline,result);
          setApplied({action:label,totalBefore:shownAnalysis?.score,undo:{before,after,draft,view,demoMode,applied}});
          setBefore(baseline);setAfter(result);setView('after');setDraft(next);setDemoMode(false);
        } else {
          setApplied(null);setDemoMode(false);
          if(mode==='compare'&&shown){compareSoil(shown,result);setAfter(result);setView('after');}else{setBefore(result);setAfter(null);}
        }
        setIndex(k=>mode==='baseline'&&!baseline?dayOfYear(next.year,next.planting):k);
      }
      setLoad('idle');
      if(mode==='apply') scoreRef.current?.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'start'});
      if(mode==='demo') farmRef.current?.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'start'});
    } catch(e){if(id===request.current){setError(e.message);setLoad('error');}}
  }
  function tryOption(opt){run({mode:'apply',scenario:{...opt.scenario,year},label:opt.action});}
  function undo(){
    if(!applied) return;
    const u=applied.undo;request.current++;
    setBefore(u.before);setAfter(u.after);setDraft(u.draft);setView(u.view);setDemoMode(u.demoMode);setApplied(u.applied);setPlaying(false);setLoad('idle');
  }
  function demo(){if(selected!==DEMO.location){demoPending.current=true;onSelect(DEMO.location);}else run({mode:'demo'});}
  const farmName=farms.find(f=>f.id===selected).name;
  const currentMonth=frame?Number(frame.date.slice(5,7)):0;
  const startup=viewing?.startup, startupEnd=startup?.status==='ready'?(startup.index??last+1):0;
  const views=demoMode?[['after',`${DEMO.illustrativeIrrigation} mm/week (illustrative)`],['before','No irrigation']]:[['after','After'],['before','Before']];
  const ghost=demoMode?(view==='before'?'Irrigated':'No irr.'):view==='before'?'After':'Before';
  const compareLabel=demoMode?(view==='before'?`${DEMO.illustrativeIrrigation} mm/week`:'No irrigation'):(view==='before'?'After':'Before');
  const busy=load==='loading';
  return <section id="visual-simulator" className="fs-sim">
    <header className="fs-intro">
      <div className="brandmark"><h1>Field Shift</h1><p>Powered by NASA Earth data</p></div>
      <div className="intro-actions"><a className="text-link only-narrow" href="#settings">Settings</a><button className="btn btn-primary" onClick={demo} disabled={busy}>Try Demo</button></div>
    </header>

    {demoMode&&graded&&<DemoStory base={graded[0]} irrigated={graded[1]} analysis={shownAnalysis} year={year}/>}

    <div className="fs-grid">
      <section className="farm-panel" ref={farmRef} aria-labelledby="farm-title" aria-busy={busy} data-run={viewing?`${viewing.scenario.location}-${viewing.scenario.year}`:"none"}>
        <div className="farm-head">
          <h2 id="farm-title" className="sr-only">Farm simulation</h2>
          {frame?<>
            <time className="farm-date" dateTime={frame.date}>{dateLabel(frame.date)}</time>
            <div className="weather-strip" data-testid="weather-strip"><span className="tag">NASA</span>
              <span>Rain <b>{mm(frame.day.rain)} mm</b></span>
              <span>ET demand <b>{fixed(frame.day.et0)} mm</b></span>
              <details className="weather-more"><summary>All inputs</summary><p>High / low <b>{fixed(frame.day.tMax)} / {fixed(frame.day.tMin)} °C</b> · Humidity <b>{number(frame.day.rh,0)}%</b> · Sunlight <b>{fixed(frame.day.solar)} MJ/m²</b> · Wind <b>{fixed(frame.day.wind)} m/s</b> · Pressure <b>{fixed(frame.day.pressure)} kPa</b></p></details>
            </div>
          </>:null}
          <span className="farm-where">{farmName} · {year}</span>
        </div>
        {compared&&<div className="view-toggle" role="group" aria-label="Scenario shown on the farm">{views.map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</button>)}</div>}
        {!frame?<div className={`farm-empty ${load==='error'?'is-error':''}`} role={load==='error'?undefined:'status'}>{load==='error'?<p>The simulation could not run.</p>:<p>Loading {year} NASA weather for {farmName}…</p>}</div>:<>
          <FarmScene frame={frame} ghostPercent={other?other.days[i].availablePercent:null} ghostLabel={ghost} animate={animate}/>
          <p className="stage-line" data-testid="stage-line">{frame.stage?<>{MODEL.crops[viewing.scenario.crop].label} · {frame.stage.label.toLowerCase()}</>:OFF_SEASON[viewing.scenario.cover]}</p>
          <div className="timeline" data-testid="playback">
            <button className="btn btn-play" aria-label={playing?'Pause simulation':'Play simulation'} onClick={()=>{if(i>=last)setIndex(0);setPlaying(!playing);}}>{playing?'Pause':'Play'}</button>
            <button className="btn-step" aria-label="Previous day" onClick={()=>go(i-1)} disabled={i===0}>‹</button>
            <div className="scrubber"><div className="startup-band" style={{width:`${100*Math.min(startupEnd,last)/Math.max(1,last)}%`}} aria-hidden="true"/>
              <input type="range" aria-label="Simulation day" aria-valuetext={dateLabel(frame.date)} min="0" max={last} value={i} onChange={e=>go(Number(e.target.value))}/></div>
            <button className="btn-step" aria-label="Next day" onClick={()=>go(i+1)} disabled={i===last}>›</button>
            <time dateTime={frame.date} data-testid="playback-date">{dateLabel(frame.date)}</time>
          </div>
          <div className="month-jump" role="group" aria-label="Jump to month">{MONTHS.map((m,k)=><button key={m} aria-label={`Jump to ${MONTH_NAMES[k]}`} aria-pressed={currentMonth===k+1} className={viewing.scenario.planting<=viewing.scenario.harvest&&k+1>=viewing.scenario.planting&&k+1<=viewing.scenario.harvest?'in-season':undefined} onClick={()=>go(monthFirst[k])}>{m}</button>)}</div>
          {startupEnd>0&&<p className="startup-key"><i aria-hidden="true"/>Depends on assumed starting water{startup.date?` until ${dateLabel(startup.date)}`:' all year'}</p>}
          <Readout frame={frame} result={viewing} compareDay={other?.days[i]} compareLabel={compareLabel} startup={startup}/>
        </>}
      </section>

      <aside className="settings" id="settings" aria-labelledby="settings-title">
        <h2 id="settings-title">Your farm</h2>
        <div className="fields">
          <label>Location<select aria-label="Location" value={selected} onChange={e=>onSelect(e.target.value)}>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label>NASA weather year<select aria-label="Historical weather year" value={year} onChange={e=>onYear(Number(e.target.value))}>{YEARS.map(y=><option key={y}>{y}</option>)}</select></label>
          <label>Crop<select aria-label="Crop type" value={draft.crop} onChange={e=>edit('crop',e.target.value)}>{Object.entries(MODEL.crops).map(([id,c])=><option key={id} value={id}>{c.label}</option>)}</select></label>
          <label>Soil<select aria-label="Soil type" value={draft.soil} onChange={e=>edit('soil',e.target.value)}>{Object.entries(MODEL.soils).map(([id,s])=><option key={id} value={id}>{s.label}</option>)}</select></label>
          <fieldset><legend>Season</legend><div className="month-pair">{[['planting','Planting month'],['harvest','Harvest month']].map(([key,label])=><label key={key}><span className="sr-only">{label}</span><select aria-label={label} value={draft[key]} onChange={e=>edit(key,Number(e.target.value))}>{MONTHS.map((m,k)=><option key={m} value={k+1}>{m}</option>)}</select></label>)}</div>{draft.planting>draft.harvest&&<small className="field-note">Crosses New Year. The autumn before is not simulated.</small>}</fieldset>
          <label>Irrigation, mm/week<input aria-label="Net irrigation (mm/week)" type="number" inputMode="numeric" min="0" max="200" step="1" value={draft.irrigation} onChange={e=>edit('irrigation',e.target.value===''?'':Number(e.target.value))}/></label>
          <label className="wide">Cover between crops<select aria-label="Ground cover" value={draft.cover} onChange={e=>edit('cover',e.target.value)}>{Object.entries(COVER).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        </div>
        <button className="btn btn-primary btn-block" onClick={()=>run({mode:shown?'compare':'baseline'})} disabled={busy||(shown&&!changed)}>{busy?'Simulating…':!shown?'Run simulation':changed?'Compare this change':'Up to date'}</button>
        {changed&&<p className="pending" role="status">Settings changed. Compare to see the result.</p>}
        {shown&&changed&&<button className="text-button" onClick={()=>run({mode:'baseline'})} disabled={busy}>Start over with these settings</button>}
        {error&&<p className="error" role="alert">{error} <button className="text-button" onClick={()=>run({mode:shown?'compare':'baseline'})}>Retry simulation</button></p>}
        <a className="settings-note" href="./docs/limitations.html">Model assumptions</a>
      </aside>
    </div>

    <div ref={scoreRef} className="results-anchor">{current&&<ScorePanel analysis={shownAnalysis} year={year} applied={applied} priority={priority} onPriority={setPriority} onTry={tryOption} onUndo={undo} busy={busy}/>}</div>

    {compared&&graded&&<section className="compare" aria-labelledby="compare-title">
      <h2 id="compare-title" className="section-title">Before &amp; After</h2>
      <p className="section-sub">Same {year} NASA weather, soil and crop.</p>
      <div className="table-wrap"><table className="fs-table" data-testid="soil-comparison"><thead><tr><th scope="col">Measure</th><th scope="col">{demoMode?'No irrigation':'Before'}</th><th scope="col">{demoMode?'Illustrative':'After'}</th><th scope="col">Change</th></tr></thead>
        <tbody>{[
          ['Farm score','score',r=>r.score.total,0,''],
          ['Stress days','stress',r=>r.score.metrics?.stressDays,0,' days'],
          ['Crop demand met','met',r=>r.score.metrics?.demandMet==null?null:100*r.score.metrics.demandMet,0,'%'],
          ['Irrigation applied','irr',r=>r.result.summary.irrigation,0,' mm'],
          ['Drainage (model)','drain',r=>r.result.summary.drainage,0,' mm'],
          ['Rain on exposed soil','exposed',r=>r.score.metrics?.liquidExposed,0,' mm'],
        ].map(([label,key,get,d,unit])=>{const b=get(graded[0]),a=get(graded[1]);return <tr key={key} data-testid={`compare-${key}`}><th scope="row">{label}</th><td>{b==null?'Not scored':`${number(b,d)}${unit}`}</td><td>{a==null?'Not scored':`${number(a,d)}${unit}`}</td><td className="delta">{a!=null&&b!=null?`${signed(a-b,d)}${unit}`:''}</td></tr>;})}</tbody></table></div>
      <dl className="scenario-list"><div><dt>{demoMode?'No irrigation':'Before'}</dt><dd>{describe(shown.scenario)}</dd></div><div><dt>{demoMode?'Illustrative':'After'}</dt><dd>{describe(compared.scenario)}</dd></div></dl>
      {[shown,compared].some(r=>r.startup?.status==='ready'&&r.days.slice(0,r.startup.index??r.days.length).some(d=>d.active))&&<p className="caution">Partly reflects the assumed starting soil water.</p>}
    </section>}
  </section>;
}
