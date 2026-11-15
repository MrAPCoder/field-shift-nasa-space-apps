// Research archive: the earlier Field Shift tools (1981–2025 climate profile, M5 historical replay
// simulator, soil profile, rotation evidence and scoring, management calendars), preserved unchanged
// and removed from the main simulator page. Not linked from the main navigation; reached from the
// documentation. The legacy browser suites target this page.
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import config from './config/config.js';
import { Brand, Footer } from './App.jsx';
import FarmSelector from './components/FarmSelector.jsx';
import PrioritySliders from './components/PrioritySliders.jsx';
import SoilProfile from './components/SoilProfile.jsx';
import RotationComparison from './components/RotationComparison.jsx';
import Simulator from './components/Simulator.jsx';
import { formatValue, loadClimate } from './lib/climate.js';
import './style.css';
const ClimateCharts = lazy(() => import('./components/ClimateCharts.jsx'));

function Metric({ label, value, unit, detail, tone, id }) {
  return <article className={`metric ${tone ?? ''}`}><p className="metric-label">{label}</p><div className="metric-value" data-testid={id}>{formatValue(value)}<span>{Number.isFinite(value) ? unit : ''}</span></div><p>{detail}</p></article>;
}
function Research() {
  const [selected, setSelected] = useState('palouse');
  const [priorities, setPriorities] = useState({ water: 5, soil: 5, income: 5, erosion: 5 });
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [management, setManagement] = useState({});
  const farm = config.farms.find(item => item.id === selected);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    loadClimate(farm, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ status: 'ready', data });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error.message });
    });
    return () => controller.abort();
  }, [farm, attempt]);
  const data = state.status === 'ready' && state.data.farm.id === selected ? state.data : null;
  return <>
    <Brand/>
    <main>
      <section className="research-intro"><p className="eyebrow">RESEARCH ARCHIVE</p><h1>Earlier Field Shift research tools</h1>
        <p>These tools come from earlier project milestones and are kept for transparency: the 1981–2025 NASA POWER climate profile, the historical replay screen, the soil profile and rotation evidence. The main simulator is on the <a href="./">home page</a>.</p></section>
      <details className="advanced-details" id="advanced-details"><summary>Open the research tools <span>Climate, calendars & research</span></summary>
      <Simulator farms={config.farms} selected={selected} onSelect={setSelected} management={management}/>
      <section className="location-bar" aria-label="Choose a location"><FarmSelector farms={config.farms} selected={selected} onChange={setSelected}/><div className="location-coordinates"><span>REPRESENTATIVE LOCATION</span><strong>{farm.latitude.toFixed(4)}° N · {Math.abs(farm.longitude).toFixed(4)}° W</strong><span>Regional data may differ from your field.</span></div></section>
      <div className="dashboard-layout"><div id="climate" tabIndex="-1" aria-busy={!data && state.status !== 'error'}>
        <div className="profile-heading"><div><div className="section-kicker">YOUR CLIMATE PROFILE</div><h2>{farm.name}</h2></div><span className="period-label">1981–2025 averages</span></div>
        {!data && state.status !== 'error' && <div className="panel loading" role="status">Loading saved climate data for {farm.name}…</div>}
        {state.status === 'error' && <div className="panel error" role="alert"><h3>Climate data could not be shown</h3><p>{state.message}</p><button onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
        {data && <>
          <p className="sr-only" role="status">Climate data loaded for {data.farm.name}.</p>
          <div className="metrics">
            <Metric label="Mean annual rainfall" id="rain-value" value={data.summary.mean_rainfall_mm} unit="mm / year" detail={`Average of ${data.summary.rainfall_mm_valid_years} complete years.`}/>
            <Metric label="Mean frost-free season" id="frost-value" value={data.summary.mean_frost_free_days} unit="days" detail={`Days between spring and fall frosts · ${data.summary.frost_free_days_valid_years} valid years.`}/>
            <Metric label="Mean hot days" id="hot-value" value={data.summary.mean_hot_days} unit="days / year" tone="warm" detail={`Daily high ≥ ${data.thresholds.hot_day_c}°C · ${data.summary.hot_days_valid_years} valid years. Threshold is provisional.`}/>
          </div>
          {data.summary.frost_free_days_valid_years < data.annual.length && <p className="boundary-note">Some years have no qualifying spring or fall frost boundary. Those years are excluded from the frost-free average; no frost dates are assumed.</p>}
          <Suspense fallback={<div className="panel loading" role="status">Loading climate charts…</div>}><ClimateCharts data={data}/></Suspense>
          <section className="source-note" aria-labelledby="source-title"><span className="source-symbol" aria-hidden="true">i</span><div><h3 id="source-title">A longer view of your local climate</h3><p>These averages describe historical patterns, not next year’s weather. NASA POWER uses gridded data that may not represent individual fields. Root-zone wetness has {formatValue(data.coverage.GWETROOT.percent)}% coverage ({data.coverage.GWETROOT.valid_days.toLocaleString()} of {data.coverage.GWETROOT.expected_days.toLocaleString()} days).</p><details><summary>Data source and limitations</summary><p>Period: {data.period.start} to {data.period.end}. Rainfall totals use complete months; frost and hot-day averages use valid years. Frost-free days are counted strictly between the last January–June frost and first July–December frost, using minimum temperature ≤ {data.thresholds.frost_day_c}°C.</p><p>Solar radiation is not used in these charts. Its historical gaps are recorded in the saved data. Irrigation, soils, and local management also affect farm conditions.</p><a href={`./data/${farm.id}/climate.json`}>View this location’s cached NASA data ↗</a></details></div></section>
        </>}
      </div><aside className="sidebar"><PrioritySliders values={priorities} onChange={(id, value) => setPriorities(previous => ({ ...previous, [id]: value }))}/><div className="next-note"><span>REVIEW BEFORE SCORING</span><h3>Evidence comes first.</h3><p>Explore rotation candidates below. Missing or unapproved agricultural inputs remain unscored.</p></div></aside></div>
      <SoilProfile farm={farm}/>
      {data && <RotationComparison key={farm.id} climate={data} priorities={priorities} management={management} onManagementChange={(id, value) => setManagement(previous => ({ ...previous, [id]: value }))}/>}
      </details>
      <Footer/>
    </main>
  </>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Research/></React.StrictMode>);
