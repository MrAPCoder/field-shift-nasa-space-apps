import React, { useEffect, useMemo, useState } from 'react';
import config from '../config/config.js';
import demo from '../../data/demo-scenarios.json';
import { loadReplay } from '../lib/replay.js';
import { planFromCalendar, planFromWindow, simulate } from '../lib/simulate.js';
import { visualMonth, meanExposure } from '../lib/visual.js';
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const format = (n, suffix = '') => n === null ? 'Unavailable' : `${Math.round(n)}${suffix}`;
const demoPlan = improved => planFromCalendar(demo.scenarios[improved ? 'improved' : 'baseline'].months, { source: 'illustrative_demo', label: improved ? 'With cover crops' : 'Baseline', rotationId: demo.rotation_id });

function FarmScene({ frame, playing, farm }) {
  const planted = ['cash', 'cover', 'window'].includes(frame?.status);
  const rain = frame?.rain !== null && frame?.rain > 0;
  const heat = frame?.temperature !== null && frame?.temperature >= config.simulation.hotDayC;
  return <svg className={`farm-scene ${playing ? 'animating' : ''}`} viewBox="0 0 800 440" role="img" aria-label={`${farm} illustrative farm: ${frame ? `${frame.status}, ${format(frame.rain, ' mm monthly precipitation')}` : 'choose a plan to replay'}`}>
    <defs><linearGradient id="sky" x2="0" y2="1"><stop stopColor={rain ? '#d3e3e6' : '#cce8ea'}/><stop offset="1" stopColor="#f5f1d9"/></linearGradient><pattern id="soil-lines" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)"><path d="M0 0H36" stroke="#715233" strokeWidth="3"/></pattern></defs>
    <rect width="800" height="440" fill="url(#sky)"/>
    <circle className={heat ? 'heat-sun' : ''} cx="655" cy="80" r="36" fill={heat ? '#eea352' : '#f7d780'}/>
    <g fill="#fff" opacity=".75" className="cloud"><ellipse cx="175" cy="83" rx="70" ry="19"/><ellipse cx="147" cy="70" rx="30" ry="27"/><ellipse cx="193" cy="67" rx="37" ry="30"/></g>
    <path d="M0 238Q140 100 310 221Q480 100 800 217V440H0Z" fill="#9fac7f"/><path d="M0 260Q200 173 430 242Q630 170 800 257V440H0Z" fill="#788b62"/>
    <g transform="translate(580 185)"><path d="M0 35L45 0 90 35V93H0Z" fill="#b8664c"/><path d="M-8 36L45 -7 98 36" fill="none" stroke="#f6e9cd" strokeWidth="8"/><rect x="34" y="53" width="25" height="40" fill="#684c3b"/></g>
    <path d="M0 294Q330 226 800 302V440H0Z" fill={frame?.protection === null || !frame ? '#a38b69' : frame.protection > 0 ? '#90945c' : '#ad8458'}/>
    <path d="M0 294Q330 226 800 302V440H0Z" fill="url(#soil-lines)"/>
    {planted && Array.from({length: 55}, (_, i) => { const x = 35 + (i % 11) * 72, y = 290 + Math.floor(i / 11) * 33; return <g key={i} transform={`translate(${x} ${y})`}><g className="crop" stroke={frame.status === 'cover' ? '#52713c' : '#e4cf82'} strokeWidth="3" fill="none"><path d="M0 10V-17M0 0Q-15 -1 -12 -12Q0 -10 0 0M0 -7Q13 -8 11 -19Q0 -17 0 -7"/></g></g>; })}
    {rain && Array.from({length: 22}, (_, i) => <path className="rain-streak" key={i} d={`M${20 + i * 37} ${115 + i % 4 * 27}l-7 19`} stroke="#6f9ca9" strokeWidth="2" opacity=".65" style={{animationDelay: `${i % 5 * -.2}s`}}/>)}
    <rect x="22" y="20" rx="15" width="210" height="32" fill="#fff" opacity=".88"/><text x="38" y="41" fill="#435646" fontSize="13">ILLUSTRATIVE · NOT CROP GROWTH</text>
  </svg>;
}

export default function VisualSimulator({ farms, selected, onSelect }) {
  const [choice, setChoice] = useState('demo');
  const [windowMonths, setWindowMonths] = useState([4, 8]);
  const [loadedReplay, setReplay] = useState(null);
  const replay = loadedReplay?.farm.id === selected ? loadedReplay : null;
  const [alternative, setAlternative] = useState([5, 8]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [year, setYear] = useState(1981);
  const [improved, setImproved] = useState(false);
  const farm = farms.find(f => f.id === selected);
  const isDemo = selected === 'palouse' && choice === 'demo';
  useEffect(() => {
    if (!active) return;
    let current = true; setReplay(null); setError('');
    loadReplay(farm).then(data => { if (current) setReplay(data); }).catch(e => { if (current) { setError(e.message); setPlaying(false); } });
    return () => { current = false; };
  }, [farm, active, attempt]);
  const baseline = useMemo(() => isDemo ? demoPlan(false) : planFromWindow(...windowMonths), [isDemo, windowMonths]);
  const plan = useMemo(() => improved ? (isDemo ? demoPlan(true) : planFromWindow(...alternative)) : baseline, [isDemo, improved, baseline, alternative]);
  const simulation = useMemo(() => replay ? simulate(replay, plan, config.simulation) : null, [replay, plan]);
  const before = useMemo(() => replay ? simulate(replay, baseline, config.simulation) : null, [replay, baseline]);
  const frame = replay ? visualMonth(replay, plan, year, index) : null;
  useEffect(() => {
    if (!playing || !replay) return;
    const timer = setInterval(() => setIndex(i => { if (i >= 35) { setPlaying(false); return i; } return i + 1; }), 950);
    return () => clearInterval(timer);
  }, [playing, replay]);
  function showScene() { document.querySelector('.watch-section')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
  function reset() { setIndex(0); setPlaying(false); setImproved(false); }
  function startDemo() { showScene(); onSelect('palouse'); setChoice('demo'); reset(); setActive(true); setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  const concerns = frame ? [frame.protection === null ? 'Soil cover is unknown for this growing-season plan.' : frame.protection === 0 ? 'Bare soil is assumed this month.' : null, frame.exposedRain > 0 ? `${format(frame.exposedRain, ' mm')} precipitation weighted by assumed exposed soil.` : null, 'Soil health measurements are unavailable.'].filter(Boolean) : [];
  return <section id="visual-simulator" className="visual-simulator">
    <div className="visual-hero"><div><p className="eyebrow">A LITTLE WEATHER. A DIFFERENT PLAN.</p><h1>See your farm<br/><em>through the seasons.</em></h1><p>Replay real NASA weather. Explore what keeping soil covered could change.</p></div><button className="primary demo-button" onClick={startDemo}>▶ Try the Palouse demo <span>One click · three years of seasons</span></button></div>
    <div className="choices-grid"><section><h2><b>01</b> Choose Farm</h2><div className="farm-options">{['palouse','yakima','skagit'].map(id => <button key={id} aria-pressed={selected === id} onClick={() => { onSelect(id); reset(); }}><span>{id === 'palouse' ? '◒' : id === 'yakima' ? '☀' : '≈'}</span><strong>{farms.find(f => f.id === id).name.split(/[—,]/)[0]}</strong><small>{id === 'palouse' ? 'Rolling dryland fields' : id === 'yakima' ? 'Warm inland valley' : 'Cool coastal valley'}</small></button>)}</div></section>
    <section><h2><b>02</b> Choose Plan</h2><label className="plan-label">Farming strategy or season<select value={isDemo ? 'demo' : 'window'} onChange={e => { setChoice(e.target.value); reset(); }} >{selected === 'palouse' && <option value="demo">Palouse demonstration calendar</option>}<option value="window">Choose a growing season</option></select></label>{!isDemo && <div className="season-selects">{['First crop month','Last crop month'].map((label, i) => <label key={label}>{label}<select value={windowMonths[i]} onChange={e => { setWindowMonths(windowMonths.map((v, k) => k === i ? Number(e.target.value) : v)); reset(); }}>{months.map((m, j) => <option value={j+1} key={m}>{m}</option>)}</select></label>)}</div>}<p className="quiet">{isDemo ? 'Illustrative crop dates and cover assumptions, pending review.' : 'Your assumed crop months repeat each year. Soil cover stays unknown.'}</p><button className="primary" onClick={() => { showScene(); setActive(true); setIndex(0); setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches); }}>Watch simulation →</button></section></div>
    <section className="watch-section"><div className="watch-heading"><h2><b>03</b> Watch Simulation</h2><span>Historical weather · not a forecast</span></div>
    {error && <p role="alert">{error} <button onClick={() => setAttempt(a => a + 1)}>Retry</button></p>}
    <div className="scene-layout"><div className="scene-card"><div className="scene-caption"><strong>{frame ? `${months[frame.month - 1]} ${frame.year}` : 'Your seasons start here'}</strong><span>{frame ? ({cash:'Cash crop assumed',cover:'Cover crop assumed',bare:'Bare soil assumed',window:'Crop season assumed',outside:'Cover unknown',unknown:'Cover unknown'}[frame.status]) : active && !error ? 'Loading archived weather…' : 'Choose a plan or try the demo'}</span></div><FarmScene frame={frame} playing={playing} farm={farm.name}/><div className="weather-strip"><span>Precipitation <strong>{frame ? format(frame.rain,' mm') : '—'}</strong></span><span>Mean daily high <strong>{frame ? format(frame.temperature,' °C') : '—'}</strong></span><small>Historical NASA weather · monthly</small></div><div className="playback"><button disabled={!frame} aria-label={playing ? 'Pause simulation' : 'Play simulation'} onClick={() => { if(index === 35) setIndex(0); setPlaying(!playing); }}>{playing ? 'Ⅱ Pause' : '▶ Play'}</button><input aria-label="Simulation month" type="range" min="0" max="35" value={index} disabled={!frame} onChange={e => { setIndex(Number(e.target.value)); setPlaying(false); }}/><span>{index + 1} / 36</span></div><label className="replay-year">Historical replay<select aria-label="Historical replay" value={year} onChange={e => { setYear(Number(e.target.value)); setPlaying(false); }}>{Array.from({length:43}, (_,i) => <option key={i} value={1981+i}>{1981+i}–{1983+i}</option>)}</select></label></div>
    <aside className="soil-status"><p className="eyebrow">THE GROUND BENEATH YOUR PLAN</p><h3>Soil Status</h3><p className="quiet">Protection indicators, not measured soil health.</p><div className="soil-metric"><span>Assumed soil protection</span><strong>{frame ? format(frame.protection,'%') : '—'}</strong>{frame?.protection != null && <meter min="0" max="100" value={frame.protection} aria-label="Assumed soil protection"/>}<small>{isDemo ? 'Illustrative demo assumption' : 'Unavailable without a field calendar'}</small></div><div className="soil-metric"><span>Precipitation exposure</span><strong>{frame ? format(frame.exposedRain,' mm') : '—'}</strong><small>Simulated indicator · rain × exposed fraction</small></div><ul className="soil-concerns">{concerns.map(c => <li key={c}>{c}</li>)}</ul></aside></div>
    <p className="scene-note">Crop symbols show planned presence, not growth or damage. Rain animation indicates a month with precipitation, not continuous rain. Soil color shows assumed cover, not moisture or soil health.</p></section>
    <section className="improvement"><h2><b>04</b> Try Improvement</h2>{isDemo ? <><div className="improve-action"><div><h3>Keep soil covered between crops.</h3><p>Try the existing illustrative cover-crop calendar using exactly the same weather.</p></div><button className="primary" disabled={!replay} aria-pressed={improved} onClick={() => { setImproved(!improved); setPlaying(false); }}>{improved ? 'Return to baseline' : 'Add cover crops'}</button></div>{simulation && <div className="simple-comparison"><div><span>Before · baseline</span><strong>{format(meanExposure(before),'%')}</strong></div><span aria-hidden="true">→</span><div><span>{improved ? 'After · cover crops' : 'Current · baseline'}</span><strong>{format(meanExposure(simulation),'%')}</strong></div><p>Mean precipitation exposure across 43 overlapping three-year replays. Simulated indicator, not erosion. Cash-crop weather exposure stays unchanged.</p></div>}</> : <><p>Try different cash-crop months against the same historical weather. These are your assumptions, not planting recommendations.</p><div className="season-selects">{['Alternative first month','Alternative last month'].map((label,i) => <label key={label}>{label}<select value={alternative[i]} onChange={e => { setAlternative(alternative.map((v,k) => k === i ? Number(e.target.value) : v)); setImproved(false); }}>{months.map((m,j) => <option key={m} value={j+1}>{m}</option>)}</select></label>)}</div><button className="primary" disabled={!replay} onClick={() => { setImproved(!improved); setPlaying(false); }}>{improved ? 'Return to baseline' : 'Compare growing seasons'}</button>{improved && simulation && <div className="season-comparison">{['dry','heat','frost'].map(family => <p key={family}><strong>{{dry:'Dry-spell screen',heat:'Heat screen',frost:'Frost screen'}[family]}</strong><br/>{before.families[family].status === 'evaluated' ? before.families[family].flaggedRuns : 'Unavailable'} → {simulation.families[family].status === 'evaluated' ? `${simulation.families[family].flaggedRuns} of ${simulation.families[family].validRuns}` : 'Unavailable'} historical replays</p>)}<small>Simulated indicators under provisional thresholds. Overlapping three-year windows are not independent or probabilities of damage. Soil protection remains unavailable.</small></div>}</>}</section>
    <p className="visual-source">Powered by <a href="https://power.larc.nasa.gov/">NASA POWER</a> · 1981–2025 gridded weather. No yield, damage, irrigation or soil-health model. <a href="#advanced-details" onClick={() => { document.getElementById('advanced-details').open = true; }}>Sources & methods ↓</a></p>
  </section>;
}
