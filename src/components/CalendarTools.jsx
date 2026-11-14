import React, { useEffect, useState } from 'react';
import { MONTHS } from '../lib/climate.js';
import { copyYear, rangeEdit } from '../lib/management.js';
import { STATUS_LABELS } from '../lib/plan.js';
const monthLabel = i => `Year ${Math.floor(i/12)+1} ${MONTHS[i%12]}`;
const describe = row => `${STATUS_LABELS[row.status]} · ${row.exposed_percent === null ? 'unknown exposure' : `${row.exposed_percent}% exposed`}`;
export default function CalendarTools({ value, onChange }) {
  const [start,setStart]=useState(0),[end,setEnd]=useState(0),[status,setStatus]=useState('unknown'),[exposure,setExposure]=useState('');
  const [from,setFrom]=useState(1),[to,setTo]=useState(2),[pending,setPending]=useState(null),[reviewed,setReviewed]=useState(false),[error,setError]=useState('');
  useEffect(()=>{setPending(null);setReviewed(false);},[value]);
  const change=(setter,next)=>{setter(next);setPending(null);setReviewed(false);setError('');};
  const preview=action=>{try{setPending(action());setReviewed(false);setError('');}catch(e){setPending(null);setError(e.message);}};
  const changed=pending?.months.filter((row,i)=>row.status!==value.months[i].status || row.exposed_percent!==value.months[i].exposed_percent) ?? [];
  return <fieldset className="calendar-tools"><legend>Faster calendar editing</legend>
    <p>Use your own assumptions. Preview replacements, review them, then apply. Copying does not establish the next year’s conditions. Final calendar confirmation is still required.</p>
    <div className="bulk-controls">
      <label>Range starts<select value={start} onChange={e=>change(setStart,Number(e.target.value))}>{Array.from({length:36},(_,i)=><option value={i} key={i}>{monthLabel(i)}</option>)}</select></label>
      <label>Range ends<select value={end} onChange={e=>change(setEnd,Number(e.target.value))}>{Array.from({length:36},(_,i)=><option value={i} key={i}>{monthLabel(i)}</option>)}</select></label>
      <label>Range status<select value={status} onChange={e=>{change(setStatus,e.target.value);setExposure('');}}>{Object.entries(STATUS_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>Range exposed soil (%)<input type="number" min="0" max="100" value={status==='bare'?100:exposure} disabled={['bare','unknown'].includes(status)} onChange={e=>change(setExposure,e.target.value)}/></label>
    </div>
    <button type="button" onClick={()=>preview(()=>rangeEdit(value,start,end,status,exposure===''?null:Number(exposure)))}>Preview range edit</button>
    <div className="bulk-controls">
      <label>Copy from year<select value={from} onChange={e=>change(setFrom,Number(e.target.value))}>{[1,2,3].map(y=><option key={y}>{y}</option>)}</select></label>
      <label>Copy to year<select value={to} onChange={e=>change(setTo,Number(e.target.value))}>{[1,2,3].map(y=><option key={y}>{y}</option>)}</select></label>
    </div>
    <button type="button" onClick={()=>preview(()=>copyYear(value,from,to))}>Preview year copy</button>
    {error && <p role="alert">{error}</p>}
    {pending && <div className="bulk-preview"><p role="status">{changed.length} months would change. Existing entries in these months will be replaced.</p>
      <ul>{changed.map(row=>{const previous=value.months.find(r=>r.year===row.year&&r.month===row.month);return <li key={`${row.year}-${row.month}`}>{monthLabel((row.year-1)*12+row.month-1)}: {describe(previous)} → {describe(row)}</li>;})}</ul>
      <label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I reviewed these replacements and their assumptions.</label>
      <button type="button" disabled={!reviewed || changed.length===0} onClick={()=>{onChange(pending);setPending(null);setReviewed(false);}}>Apply reviewed changes</button>
      <button type="button" onClick={()=>{setPending(null);setReviewed(false);}}>Cancel edit</button>
    </div>}
  </fieldset>;
}
