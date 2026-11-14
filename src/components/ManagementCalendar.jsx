import React from 'react';
import { MONTHS } from '../lib/climate.js';
import { editManagement, managementIssues } from '../lib/management.js';

export default function ManagementCalendar({ rotation, value, onChange }) {
  const edit = patch => onChange(editManagement(value, patch));
  const issues = managementIssues(value, rotation.id, false);
  const updateMonth = (index, patch) => edit({ months: value.months.map((row, i) => i === index ? { ...row, ...patch } : row) });
  return <details className="management-calendar">
    <summary>Enter three-year management calendar</summary>
    <p><strong>Farmer-supplied inputs · not published research.</strong> All months start Unknown. Entries stay in this tab while switching farms; reloading clears them.</p>
    <label>Calendar describes<select value={value.mode} onChange={e => edit({ mode: e.target.value })}>
      <option value="proposed">Proposed scenario — assumptions, not observations</option>
      <option value="observed">Observed management — farmer-reported, not independently verified</option>
    </select></label>
    <label>Field and actual years, or scenario description<input value={value.context} onChange={e => edit({ context: e.target.value })} placeholder="Describe the scenario and what years 1–3 mean" /></label>
    <label>Confirmed by<input value={value.confirmed_by} onChange={e => edit({ confirmed_by: e.target.value })} /></label>
    <p>For each month, estimate the average soil surface exposed to rain, allowing for canopy, retained residue and changes within the month: 0% = none exposed; 100% = fully exposed. Leave it blank if unknown. A planted crop does not imply protection. After harvest, retain crop/cover status if residue remains; do not automatically choose Bare soil. This simplified estimate cannot model storm timing or erosion.</p>
    {[1, 2, 3].map(year => <fieldset key={year}><legend>Year {year}</legend>
      <div className="calendar-months">{value.months.map((row, index) => row.year !== year ? null : <div className="calendar-month" key={row.month}>
        <strong>{MONTHS[row.month - 1]}</strong>
        <label><span className="sr-only">Year {year} {MONTHS[row.month - 1]} </span>Status<select aria-label={`Year ${year} ${MONTHS[row.month - 1]} status`} value={row.status} onChange={e => updateMonth(index, { status: e.target.value, exposed_percent: e.target.value === 'bare' ? 100 : null })}>
          <option value="unknown">Unknown</option><option value="cash">Planted crop</option><option value="cover">Cover crop</option><option value="bare">Bare soil</option>
        </select></label>
        <label>Exposed soil (%)<input aria-label={`Year ${year} ${MONTHS[row.month - 1]} exposed soil percent`} type="number" min="0" max="100" step="any" value={row.exposed_percent ?? ''} disabled={row.status === 'unknown' || row.status === 'bare'} onChange={e => updateMonth(index, { exposed_percent: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      </div>)}</div>
    </fieldset>)}
    <p>Bare soil explicitly means 100% exposed. Changing any input removes confirmation and hides its score until you confirm again.</p>
    {issues.length > 0 && <ul className="calendar-issues">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    <button type="button" disabled={issues.length > 0 || value.confirmed} onClick={() => onChange({ ...value, confirmed: true, confirmed_at: new Date().toISOString() })}>Confirm complete calendar</button>
    <p role="status">{value.confirmed ? `Farmer-confirmed ${value.mode === 'proposed' ? 'scenario assumptions' : 'reported management'}; not independently verified. Historical rainfall is used, not actual weather in the entered years.` : 'Unconfirmed — no exposure estimate from this calendar.'}</p>
  </details>;
}
