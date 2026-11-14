import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calendarRows, HIGH_RAIN_RANK, knownMonthNames } from '../src/lib/plan.js';
import { emptyManagement } from '../src/lib/management.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
test('all three farms align 36 unknown cells with actual monthly NASA normals',()=>{
 for(const farm of ['skagit','yakima','palouse']){
  const climate=read(`../public/data/${farm}/climate.json`),input=emptyManagement(`${farm}-current`),before=structuredClone(input);
  const rows=calendarRows(climate,input);assert.equal(rows.length,36);
  rows.forEach((r,i)=>{assert.equal(r.year,Math.floor(i/12)+1);assert.equal(r.month,i%12+1);assert.equal(r.rainfall,climate.monthly[i%12].rainfall_normal_mm);assert.equal(r.status,'unknown');assert.equal(r.exposedPercent,null);assert.equal(r.highlight,false);});
  assert.deepEqual(input,before);
 }
});
test('high rain uses third-highest positive normal including ties; partial planted exposure can highlight',()=>{
 // Explicitly synthetic monthly normals and assumptions.
 const climate={monthly:Array.from({length:12},(_,i)=>({month:i+1,rainfall_normal_mm:i<4?100:10,rainfall_valid_years:1}))};
 const input=emptyManagement('synthetic');input.months.forEach(r=>{r.status='cash';r.exposed_percent=25;});
 const rows=calendarRows(climate,input);assert.equal(HIGH_RAIN_RANK,3);
 assert.equal(rows.filter(r=>r.highlight).length,12);assert.ok(rows.every(r=>r.exposedPercent===25));
 input.months[0].exposed_percent=0;assert.equal(calendarRows(climate,input)[0].highlight,false);
 input.months[1].exposed_percent=null;assert.equal(calendarRows(climate,input)[1].highlight,false);
});
test('missing, duplicated or invalid information never turns into zero exposure or bare soil',()=>{
 const climate=read('../public/data/palouse/climate.json');
 for(const mutate of [m=>m.shift(),m=>m[0]={...m[1]},m=>m[0].exposed_percent=-1,m=>m[0].exposed_percent=101,m=>m[0].exposed_percent='25',m=>m[0].status='invalid',m=>m[0].status='bare']){
  const input=emptyManagement('synthetic');input.months.forEach(r=>{r.status='cash';r.exposed_percent=25;});mutate(input.months);
  const row=calendarRows(climate,input)[0];assert.equal(row.known,false);assert.equal(row.exposedPercent,null);assert.equal(row.highlight,false);
 }
});
test('missing or zero rainfall cannot create high rainfall highlights',()=>{
 const input=emptyManagement('synthetic');input.months.forEach(r=>{r.status='bare';r.exposed_percent=100;});
 const climate={monthly:Array.from({length:12},(_,i)=>({month:i+1,rainfall_normal_mm:0,rainfall_valid_years:1}))};
 assert.ok(calendarRows(climate,input).every(r=>!r.highRain));
 climate.monthly[0].rainfall_normal_mm=null;assert.equal(calendarRows(climate,input)[0].rainfall,null);assert.ok(calendarRows(climate,input).every(r=>!r.highRain));
});
test('planting/harvest months never inferred; invalid or empty dates remain unknown',()=>{
 for(const m of [null,undefined,[],[0],[13],['May']])assert.match(knownMonthNames(m),/Unknown/);
 assert.equal(knownMonthNames([5,6,5]),'May, Jun');
});
