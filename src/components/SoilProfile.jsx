import React from 'react';
import skagit from '../../public/data/skagit/soil.json';
import yakima from '../../public/data/yakima/soil.json';
import palouse from '../../public/data/palouse/soil.json';
const profiles = { skagit, yakima, palouse };
const value = (v, unit = '') => v === null || v === undefined ? 'Unavailable' : `${v}${unit}`;
export default function SoilProfile({ farm, expanded = false }) {
  const candidate = profiles[farm.id];
  const data = candidate?.farm.latitude === farm.latitude && candidate?.farm.longitude === farm.longitude ? candidate : null;
  const components = (data?.rows ?? []).reduce((groups, row) => {
    const key = `${row.mukey}/${row.cokey}`;
    (groups[key] ??= []).push(row);
    return groups;
  }, {});
  return <section className="panel soil-profile" aria-label="USDA soil survey context">
    <h3>Local soil survey context</h3>
    <p>USDA NRCS SSURGO · representative point, not a field soil test. Survey components describe a map unit; their proportions are not the probability of finding a soil at this exact point.</p>
    {!data || data.status !== 'available' ? <>
      <p><strong>Soil characteristics unavailable.</strong> Texture, available water capacity, organic matter, pH, drainage and slope have not been retrieved for this location.</p>
      <p>{data?.reason ?? 'The saved soil record does not match this location.'}</p>
    </> : Object.entries(components).map(([key, rows]) => <details key={key} open={expanded}>
      <summary>{rows[0].compname ?? 'Unnamed component'} · {value(rows[0].comppct_r, '% of map unit')}</summary>
      <p>Map unit {rows[0].mukey}: {rows[0].muname}. Survey {rows[0].areasymbol}; version {value(rows[0].saversion)} ({value(rows[0].saverest)}).</p>
      <p>Drainage: {value(rows[0].drainagecl)} · Slope: {value(rows[0].slope_r, '%')}. Restrictive depth: unavailable.</p>
      <div className="table-scroll"><table><caption>Survey horizons; no depth averaging</caption><thead><tr><th>Depth (cm)</th><th>Texture</th><th>Available water capacity (cm/cm), low / representative / high</th><th>Organic matter (% by weight)</th><th>pH (1:1 water)</th></tr></thead>
        <tbody>{rows.map((r,i) => <tr key={r.chkey ?? i}><td>{value(r.hzdept_r)}–{value(r.hzdepb_r)}</td><td>{value(r.texture)}</td><td>{[r.awc_l,r.awc_r,r.awc_h].map(n=>value(n)).join(' / ')}</td><td>{value(r.om_r)}</td><td>{value(r.ph1to1h2o_r)}</td></tr>)}</tbody></table></div>
    </details>)}
    <p>No soil values are inferred or incorporated into the existing scores.</p>
    {data && <details open={expanded}><summary>Soil source and retrieval details</summary><p>Last acquisition attempt (UTC): {data.provenance.retrieved_at}.</p><p><a href={`./${data.provenance.raw_path}`}>Saved USDA query and response receipt</a> · <a href={`./data/${farm.id}/soil.json`}>Soil data and checksum</a></p><ul>{data.limitations.map(note=><li key={note}>{note}</li>)}</ul></details>}
    <a href="https://sdmdataaccess.sc.egov.usda.gov/">USDA NRCS Soil Data Access</a>
  </section>;
}
