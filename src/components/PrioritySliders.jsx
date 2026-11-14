import React from 'react';
export const PRIORITIES = [
  { id: 'water', name: 'Water savings', detail: 'Use water thoughtfully.' },
  { id: 'soil', name: 'Soil health', detail: 'Care for soil over time.' },
  { id: 'income', name: 'Extra income', detail: 'Consider the farm business.' },
  { id: 'erosion', name: 'Erosion control', detail: 'Keep soil in the field.' },
];
export default function PrioritySliders({ values, onChange }) {
  return <section className="panel priorities" aria-labelledby="priorities-title">
    <div className="section-kicker">YOUR PLANNING PRIORITIES</div><h2 id="priorities-title">What matters to you?</h2>
    <p className="muted">Move each slider to show its importance. Higher means more important.</p>
    {PRIORITIES.map(({ id, name, detail }) => <div className="priority" key={id}>
      <div className="priority-label"><label htmlFor={`priority-${id}`}>{name}</label><output htmlFor={`priority-${id}`}>{values[id]}<span> / 10</span></output></div>
      <p id={`hint-${id}`}>{detail}</p>
      <input id={`priority-${id}`} type="range" min="0" max="10" step="1" value={values[id]} aria-describedby={`hint-${id} priorities-note`} onChange={event => onChange(id, Number(event.target.value))} style={{ '--fill': `${values[id] * 10}%` }} />
      <div className="range-ends"><span>0 · Not a priority</span><span>10 · Very important</span></div>
    </div>)}
    <div className="soft-note" id="priorities-note">These settings stay with you while you explore locations. They do not change the climate data. Rotation comparisons come in the next milestone.</div>
    <p className="income-note">Income is not scored yet — crop prices and production costs are not included.</p>
  </section>;
}
