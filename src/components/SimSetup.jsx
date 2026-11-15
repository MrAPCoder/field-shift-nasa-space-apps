import React from 'react';
import { MONTHS } from '../lib/climate.js';
import { Chip } from './ConcernCard.jsx';
import { CHIPS } from '../lib/concerns.js';

/** Start/end month selects for a climate-only growing window (wrapping allowed). */
export function WindowSelects({ idPrefix, start, end, onChange }) {
  const options = <>
    <option value="">Choose…</option>
    {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
  </>;
  return <div className="sim-window">
    <label htmlFor={`${idPrefix}-start`}>First crop month<select id={`${idPrefix}-start`} value={start} onChange={event => onChange(event.target.value, end)}>{options}</select></label>
    <span aria-hidden="true">→</span>
    <label htmlFor={`${idPrefix}-end`}>Last crop month<select id={`${idPrefix}-end`} value={end} onChange={event => onChange(start, event.target.value)}>{options}</select></label>
  </div>;
}

export default function SimSetup({ farms, selected, onSelect, rotations, rotationId, onRotation, calendarConfirmed, calendarStarted, useCalendar, onUseCalendar,
  windowStart, windowEnd, onWindow, usingCalendar, canSimulate, loading, onSimulate, onDemo, runCount }) {
  const isPalouse = selected === 'palouse';
  const wraps = windowStart && windowEnd && Number(windowStart) > Number(windowEnd);
  return <>
    <div className="sim-hero">
      <div className="section-kicker">HISTORICAL FARM SIMULATOR</div>
      <h2 id="simulator-title">Replay your farm plan through 45 years of NASA weather</h2>
      <p>See how often dry spells, heat, frost and precipitation on exposed soil showed up when a three-year plan is run through real past weather, 1981–2025. A replay of history — not a forecast, and not a yield, water-savings, profit or erosion model.</p>
      <div className="sim-hero-actions">
        <button type="button" className="sim-demo-button" onClick={onDemo} disabled={loading}>▶ Try the illustrative Palouse demo</button>
        <span className="sim-badge">HYPOTHETICAL DEMO</span>
      </div>
    </div>
    <section className="sim-step" aria-labelledby="sim-step-1">
      <h3 id="sim-step-1"><span className="sim-step-number">1</span>Your farm</h3>
      <div className="sim-tiles" role="group" aria-label="Choose a region">
        {farms.map(farm => <button type="button" key={farm.id} className="sim-tile" aria-pressed={farm.id === selected} onClick={() => onSelect(farm.id)}>
          <strong>{farm.name}</strong><span>{farm.latitude.toFixed(2)}° N · {Math.abs(farm.longitude).toFixed(2)}° W</span>
        </button>)}
      </div>
      <p className="sim-fine">Representative regional locations. NASA POWER weather is gridded (~50 km) and may differ from your field.</p>
      <div className="sim-inputs">
        {isPalouse && <div className="sim-field">
          <label htmlFor="sim-rotation">Palouse research rotation</label>
          <select id="sim-rotation" value={rotationId} onChange={event => onRotation(event.target.value)}>{rotations.map(rotation => <option key={rotation.id} value={rotation.id}>{rotation.name}</option>)}</select>
          <p className="sim-fine">Published research sequences, approved for demonstration only — not a farm history or recommendation.</p>
          {calendarConfirmed
            ? <label className="sim-check"><input type="checkbox" checked={useCalendar} onChange={event => onUseCalendar(event.target.checked)}/> Use my confirmed field calendar <Chip label={CHIPS.farmer}/></label>
            : <p className="sim-status" data-testid="sim-calendar-status">{calendarStarted ? 'Your field calendar for this rotation is not complete and confirmed yet.' : 'No confirmed field calendar for this rotation.'} Weather screens will use the crop months below; exposed-soil precipitation will not be evaluated. <a href="#rotation-title">Enter or confirm a field calendar below ↓</a></p>}
        </div>}
        {usingCalendar
          ? <div className="sim-field"><p className="sim-status" data-testid="sim-calendar-status">Crop months, cover months and exposed-soil percentages come from your confirmed 36-month calendar. Cash-crop and cover-crop months count as crop months.</p></div>
          : <div className="sim-field">
            <span className="sim-label">Growing window <Chip label={CHIPS.farmer}/></span>
            <WindowSelects idPrefix="sim-window" start={windowStart} end={windowEnd} onChange={onWindow}/>
            <p className="sim-fine">{isPalouse ? 'Used when no confirmed calendar is selected. ' : 'Climate-only: no field calendar is used for this region. '}Your choice of crop months, repeated in each plan year.{wraps ? ` ${MONTHS[windowStart - 1]} → ${MONTHS[windowEnd - 1]} wraps the new year, so fall weather comes from the preceding calendar year.` : ' A window may wrap the new year, for example Oct → Jul.'}</p>
          </div>}
      </div>
      <p className="sim-fine">The plan starts January 1 of year 1 and runs 36 months. It is replayed through every complete three-year stretch of the archive — 1981–1983, 1982–1984 … 2023–2025{runCount ? ` (${runCount} replays)` : ''}. Overlapping replays are not independent trials.</p>
      <div className="sim-actions">
        <button type="button" className="sim-primary" onClick={onSimulate} disabled={!canSimulate || loading} aria-describedby={canSimulate ? undefined : 'sim-hint'}>{loading ? 'Simulating…' : 'Simulate My Farm'}</button>
        {!canSimulate && <p id="sim-hint" className="sim-hint">Choose the first and last crop month to simulate.</p>}
      </div>
    </section>
  </>;
}
