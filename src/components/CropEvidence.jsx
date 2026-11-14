import React from 'react';
import cropData from '../../data/crops.json';
const labels = { seasonal_water_need: 'Seasonal crop water need', effective_root_depth: 'Effective root depth', nitrogen_fixing: 'Nitrogen-fixing capability', growing_period: 'Growing period' };
function evidenceValue(trait) {
  if (trait.value === null) return 'Unavailable';
  if (typeof trait.value === 'boolean') return trait.value ? 'Yes, with suitable symbiosis' : 'No legume-type fixation';
  return `${Array.isArray(trait.value) ? trait.value.join('–') : trait.value} ${trait.unit}`;
}
export default function CropEvidence({ rotation, expanded = false }) {
  const crops = [...new Set(rotation.years.flatMap(year=>year.crop_ids))].map(id=>cropData.crops.find(c=>c.id===id));
  return <details className="crop-evidence" open={expanded}><summary>Crop evidence, ranges and uncertainty</summary>
    <p>Published reference information · awaiting team review. These ranges do not approve local suitability, define scoring categories or unlock scores.</p>
    {crops.map(crop=>crop && <section key={crop.id}><h4>{crop.name}</h4>
      {!crop.research_traits ? <p>Detailed trait evidence unavailable.</p> : <dl>{Object.entries(crop.research_traits).map(([key,trait])=><div key={key}><dt><strong>{labels[key]}</strong></dt><dd>{evidenceValue(trait)}<p>{trait.scope}. {trait.limitations}</p><a href={trait.source_url}>{trait.locator}</a> · Review pending</dd></div>)}</dl>}
    </section>)}
    <p>Water need is evapotranspiration, not irrigation demand. Root ranges describe potential in suitable soils. Growing periods are not minimum frost-free requirements.</p>
  </details>;
}
