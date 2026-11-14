import React from 'react';
export default function FarmSelector({ farms, selected, onChange }) {
  return <div className="farm-control"><label htmlFor="farm">Your demonstration location</label>
    <select id="farm" value={selected} onChange={event => onChange(event.target.value)}>
      {farms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
    </select><span>Washington State · representative regional locations</span></div>;
}
