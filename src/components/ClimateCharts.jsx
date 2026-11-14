import React from 'react';
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { chartRows, formatValue } from '../lib/climate.js';

function DataTable({ rows, wetness }) {
  return <details className="data-table"><summary>View monthly values and coverage</summary><div className="table-scroll"><table>
    <caption>{wetness ? 'Monthly modeled root-zone soil wetness' : 'Monthly historical rainfall averages'}</caption>
    <thead><tr><th scope="col">Month</th><th scope="col">{wetness ? 'Wetness (0–1)' : 'Rain (mm)'}</th><th scope="col">{wetness ? 'Valid days' : 'Valid years'}</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.month}><th scope="row">{row.name}</th><td>{formatValue(wetness ? row.gwetroot_mean : row.rainfall_normal_mm, wetness ? 3 : 1)}</td><td>{wetness ? `${row.gwetroot_valid_days.toLocaleString()} / ${row.gwetroot_expected_days.toLocaleString()}` : row.rainfall_valid_years}</td></tr>)}</tbody>
  </table></div></details>;
}
export default function ClimateCharts({ data }) {
  const rows = chartRows(data);
  return <div className="charts">
    <section className="panel chart-panel" aria-labelledby="rain-title">
      <div className="chart-heading"><div><div className="section-kicker">SEASONAL PATTERNS</div><h2 id="rain-title">When does the rain fall?</h2></div><span className="unit-badge">mm / month</span></div>
      <p className="muted">Average rainfall for each calendar month. Taller bars mean wetter months.</p>
      <div className="chart" role="img" aria-label={`Monthly rainfall averages in millimeters for ${data.farm.name}. Exact values are in the table below.`}>
        <ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ top: 12, right: 8, left: -19, bottom: 4 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="#e5e9e2" strokeDasharray="3 4"/><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#596960' }} interval={0}/><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#596960' }}/>
          <Tooltip cursor={{ fill: '#edf2eb' }} formatter={value => [`${formatValue(value)} mm`, 'Rainfall']} contentStyle={{ borderRadius: 10, border: '1px solid #dbe3d9' }}/>
          <Bar dataKey="rainfall_normal_mm" fill="#44765a" radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false}/>
        </BarChart></ResponsiveContainer>
      </div><DataTable rows={rows}/>
    </section>
    <section className="panel chart-panel" aria-labelledby="wet-title">
      <div className="chart-heading"><div><div className="section-kicker">BELOW THE SURFACE</div><h2 id="wet-title">How wet is the root zone?</h2></div><span className="unit-badge">0–1 scale</span></div>
      <p className="muted">NASA’s modeled soil wetness. Higher values mean wetter conditions.</p>
      <div className="chart" role="img" aria-label={`Monthly modeled root-zone wetness on a zero-to-one scale for ${data.farm.name}. Exact values are in the table below.`}>
        <ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{ top: 12, right: 8, left: -19, bottom: 4 }} accessibilityLayer>
          <defs><linearGradient id="wetness-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#507e88" stopOpacity={0.28}/><stop offset="100%" stopColor="#507e88" stopOpacity={0.02}/></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#e5e9e2" strokeDasharray="3 4"/><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#596960' }} interval={0}/><YAxis domain={[0, 1]} ticks={[0, .25, .5, .75, 1]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#596960' }}/>
          <Tooltip formatter={value => [formatValue(value, 3), 'Modeled wetness']} contentStyle={{ borderRadius: 10, border: '1px solid #dbe3d9' }}/>
          <Area type="linear" dataKey="gwetroot_mean" stroke="#467783" strokeWidth={2.5} fill="url(#wetness-fill)" connectNulls={false} isAnimationActive={false}/>
        </AreaChart></ResponsiveContainer>
      </div><p className="chart-footnote">A model estimate, not a soil sensor reading or SMAP measurement.</p><DataTable rows={rows} wetness/>
    </section>
  </div>;
}
