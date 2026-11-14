import React from 'react';
import { calendarRows, STATUS_LABELS } from '../lib/plan.js';
import { formatValue, MONTHS } from '../lib/climate.js';

export default function RainfallCalendar({ climate, management, score }) {
  const rows=calendarRows(climate,management);
  const available=score?.status==='SCORED';
  return <section className="rainfall-calendar" aria-label="Three-year management and rainfall visualization">
    <h4>Soil exposure alongside rainfall</h4>
    <p><strong>{management.mode==='observed' ? 'Observed management — farmer-reported, not independently verified' : 'Proposed scenario — farmer assumptions, not farm observations'}</strong><br/>{management.confirmed ? 'Calendar confirmed by its author.' : 'Draft calendar — unconfirmed inputs.'}</p>
    <div className="rainfall-overlap" data-testid="rainfall-overlap" role="status">
      {available ? <><strong>{formatValue(100*score.evidence.rainExposureFraction)}%</strong><p>of historical rainfall overlaps with the field’s estimated exposed-soil conditions.</p></> : <><strong>Exposure unavailable</strong><p>Complete and confirm all 36 months. Published sequence approval and valid rainfall data are also required.</p></>}
      <p>Calculated from 1981–2025 NASA rainfall normals and farmer inputs. This is an exposure estimate, not soil loss or an erosion reduction percentage.</p>
    </div>
    <p className="calendar-legend">{Object.entries(STATUS_LABELS).map(([key,label])=><span className={`status-key status-${key}`} key={key}>{label}</span>)}</p>
    <p>Each year uses the same historical monthly normals. High rainfall = at least the third-highest monthly normal, including ties. Outlined months combine high rainfall with entered exposure above 0%; draft highlights remain assumptions. Unknown exposure is never treated as zero.</p>
    {[1,2,3].map(year=><section className="rainfall-year" key={year} aria-label={`Year ${year} rainfall calendar`}><h5>Year {year}</h5><div className="rainfall-months">
      {rows.filter(r=>r.year===year).map(row=><div key={row.month} className={`rainfall-month status-${row.status} ${row.highlight?'exposure-highlight':''}`} data-highlight={row.highlight} data-month={`${year}-${row.month}`}>
        <strong>{MONTHS[row.month-1]}</strong><span>{STATUS_LABELS[row.status]}</span>
        <span>Rain: {formatValue(row.rainfall)} mm</span><span>Exposed soil: {row.known?`${formatValue(row.exposedPercent)}%`:'Unknown'}</span>
        {row.highRain&&<span className="rain-marker">High rainfall</span>}{row.highlight&&<strong className="exposure-marker">Rain + exposed soil</strong>}
      </div>)}
    </div></section>)}
  </section>;
}
