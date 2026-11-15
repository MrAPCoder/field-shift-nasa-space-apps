import React, { useEffect, useRef, useState } from 'react';
import config from '../config/config.js';
import rotationData from '../../data/rotations.json';
import demoData from '../../data/demo-scenarios.json';
import { loadReplay, REPLAY_LOAD_ERROR } from '../lib/replay.js';
import { planFromCalendar, planFromWindow, simulate } from '../lib/simulate.js';
import { evaluateConcerns, describePlan, DEMO_BANNER, NOT_A_FORECAST, PROVISIONAL_NOTE } from '../lib/concerns.js';
import { managementIssues } from '../lib/management.js';
import SimSetup from './SimSetup.jsx';
import ConcernCard, { Chip } from './ConcernCard.jsx';

const palouseRotations = rotationData.rotations.filter(rotation => rotation.farm_id === 'palouse');
const RUN_COUNT = Number(config.period.end.slice(0, 4)) - Number(config.period.start.slice(0, 4)) - 1;
const demoPlan = id => planFromCalendar(demoData.scenarios[id].months, { source: 'illustrative_demo', label: demoData.scenarios[id].label, rotationId: demoData.rotation_id });

/**
 * M5 historical replay simulator. Reads `management` but never writes it; demo
 * assumptions live only in this component's state and never reach rotation scoring.
 */
export default function Simulator({ farms, selected, onSelect, management }) {
  const [rotationId, setRotationId] = useState(palouseRotations.find(rotation => rotation.slot === 'current')?.id ?? palouseRotations[0].id);
  const [useCalendar, setUseCalendar] = useState(true);
  const [windowMonths, setWindowMonths] = useState({ start: '', end: '' });
  const [load, setLoad] = useState({ status: 'idle' });
  const [before, setBefore] = useState(null);
  const [scrollTick, setScrollTick] = useState(0);
  const results = useRef(null);
  const requestId = useRef(0);

  const isPalouse = selected === 'palouse';
  const farmerCalendar = isPalouse ? management?.[rotationId] ?? null : null;
  const calendarConfirmed = Boolean(farmerCalendar) && managementIssues(farmerCalendar, rotationId).length === 0;
  const calendarStarted = Boolean(farmerCalendar?.months?.some(row => row.status !== 'unknown'));
  const usingCalendar = isPalouse && calendarConfirmed && useCalendar;
  const windowReady = Boolean(windowMonths.start && windowMonths.end);
  const canSimulate = usingCalendar || windowReady;
  const shown = before && before.farmId === selected ? before : null;

  useEffect(() => {
    if (scrollTick && results.current) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      results.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      results.current.focus({ preventScroll: true });
    }
  }, [scrollTick]);

  async function run(farmId, plan, extra = {}) {
    const farm = farms.find(item => item.id === farmId), id = ++requestId.current;
    setLoad({ status: 'loading' });
    try {
      const replay = await loadReplay(farm);
      if (id !== requestId.current) return;
      const simulation = simulate(replay, plan, config.simulation);
      setBefore({ farmId, replay, simulation, concerns: evaluateConcerns(simulation), demo: false, calendarRef: null, ...extra });
      setLoad({ status: 'idle' });
      setScrollTick(tick => tick + 1);
    } catch (error) {
      if (id !== requestId.current) return;
      setBefore(null);
      setLoad({ status: 'error', message: error?.message?.startsWith(REPLAY_LOAD_ERROR) ? error.message.slice(REPLAY_LOAD_ERROR.length + 2) : 'The simulation could not be completed.', retry: () => run(farmId, plan, extra) });
    }
  }
  const simulateMine = () => run(selected, usingCalendar
    ? planFromCalendar(farmerCalendar.months, { source: 'farmer_confirmed', rotationId, label: `Farmer-confirmed field calendar — ${palouseRotations.find(rotation => rotation.id === rotationId)?.name}` })
    : planFromWindow(Number(windowMonths.start), Number(windowMonths.end), { rotationId: isPalouse ? rotationId : null }),
    { calendarRef: usingCalendar ? farmerCalendar : null, rotationId: isPalouse ? rotationId : null });
  const simulateDemo = () => { onSelect('palouse'); return run('palouse', demoPlan('baseline'), { demo: true, rotationId: demoData.rotation_id }); };

  const farm = farms.find(item => item.id === selected);
  const plan = shown ? describePlan(shown.simulation.plan) : null;
  const stale = shown && shown.calendarRef && management?.[shown.rotationId] !== shown.calendarRef;
  return <section className="simulator" aria-labelledby="simulator-title">
    <SimSetup farms={farms} selected={selected} onSelect={onSelect} rotations={palouseRotations} rotationId={rotationId} onRotation={setRotationId}
      calendarConfirmed={calendarConfirmed} calendarStarted={calendarStarted} useCalendar={useCalendar} onUseCalendar={setUseCalendar}
      windowStart={windowMonths.start} windowEnd={windowMonths.end} onWindow={(start, end) => setWindowMonths({ start, end })}
      usingCalendar={usingCalendar} canSimulate={canSimulate} loading={load.status === 'loading'} onSimulate={simulateMine} onDemo={simulateDemo} runCount={RUN_COUNT}/>
    {load.status === 'error' && <div className="sim-error" role="alert"><h3>{REPLAY_LOAD_ERROR}</h3><p>{load.message} The climate dashboard below still works.</p><button type="button" onClick={load.retry}>Retry</button></div>}
    {shown && <div className="sim-results" ref={results} tabIndex="-1" data-testid="sim-results">
      {shown.demo && <p className="sim-demo-banner" data-testid="demo-banner"><strong>HYPOTHETICAL DEMO</strong> {DEMO_BANNER}</p>}
      <section className="sim-step" aria-labelledby="sim-step-2">
        <h3 id="sim-step-2"><span className="sim-step-number">2</span>Top concerns</h3>
        <p className="sim-summary" data-testid="sim-summary"><strong>{farm.name}</strong> · {plan.label} <Chip label={plan.chip}/> · {shown.simulation.startYears.length} replays, {shown.simulation.startYears[0]}–{shown.simulation.startYears[0] + 2} to {shown.simulation.startYears.at(-1)}–{shown.simulation.startYears.at(-1) + 2}</p>
        {stale && <p className="sim-hint">Your field calendar changed after this simulation. Select Simulate My Farm again to use the current calendar.</p>}
        {shown.concerns.concerns.length > 0
          ? <div className="concern-grid">{shown.concerns.concerns.map((card, i) => <ConcernCard key={card.family} card={card} rank={i + 1}/>)}</div>
          : <p className="sim-empty" data-testid="no-concern">{shown.concerns.message}</p>}
        <ul className="sim-other">
          {shown.concerns.alsoQualified.map(item => <li key={item.family}><strong>Also met the bar (only the top three are shown as cards):</strong> {item.title} — {item.howOften}. {item.rule}. <Chip label="Simulated indicator"/></li>)}
          {shown.concerns.belowBar.map(item => <li key={item.family}><strong>Screened, below the bar:</strong> {item.title} — {item.howOften}. {item.rule}. <Chip label="Simulated indicator"/> Not evidence of low risk.</li>)}
          {shown.concerns.notEvaluated.map(item => <li key={item.family} data-testid="not-evaluated"><strong>Not evaluated:</strong> {item.title} — {item.reason}{item.family === 'exposed' && selected === 'palouse' && <> <a href="#rotation-title">Go to the field calendars ↓</a></>}</li>)}
        </ul>
        <p className="sim-fine">{PROVISIONAL_NOTE} A concern is listed when its screen was met in at least {Math.round(config.simulation.concernMinFrequency * 100)}% of valid replays; order is by frequency, then a fixed planning convention, not a measure of harm. {NOT_A_FORECAST}</p>
      </section>
    </div>}
    <div className="sim-details-divider"><span aria-hidden="true">▼</span><div><strong>Explore the details</strong><p>The climate dashboard, soil context, rotation comparison, field calendars and printable plans continue below, unchanged.</p></div></div>
  </section>;
}
