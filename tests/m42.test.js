import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { emptyManagement, rangeEdit, copyYear, managementIssues } from '../src/lib/management.js';
import { totalDescription } from '../src/lib/scorePresentation.js';
const read=path=>JSON.parse(fs.readFileSync(path));

test('bulk ranges preserve other months, nulls and provenance, and withdraw confirmation',()=>{
 const input={...emptyManagement('palouse-current'),confirmed:true,confirmed_at:'2026-11-14T00:00:00Z',context:'SYNTHETIC test',confirmed_by:'Test'};
 const original=structuredClone(input);
 const output=rangeEdit(input,10,13,'cash',35);
 assert.equal(output.confirmed,false);assert.equal(output.confirmed_at,null);
 assert.equal(output.context,input.context);
 assert.deepEqual(output.months.filter(r=>r.status==='cash').map(r=>[r.year,r.month]),[[1,11],[1,12],[2,1],[2,2]]);
 assert.equal(output.months[9].exposed_percent,null);
 assert.equal(rangeEdit(output,10,13,'unknown',80).months[10].exposed_percent,null);
 assert.equal(rangeEdit(output,10,13,'bare',null).months[10].exposed_percent,100);
 assert.deepEqual(input,original);
 for(const args of [[2,1,'cash',20],[0,36,'cash',20],[0,1,'cash',null],[0,1,'cash',NaN],[0,1,'cash',101]])assert.throws(()=>rangeEdit(input,...args));
});
test('year copy retains unknowns and copies explicit values without confirming or sharing rows',()=>{
 const input=rangeEdit(emptyManagement('palouse-current'),0,5,'cover',25);
 const output=copyYear({...input,confirmed:true,confirmed_at:'2026-11-14T00:00:00Z'},1,3);
 assert.equal(output.months[24].exposed_percent,25);assert.equal(output.months[30].status,'unknown');
 assert.equal(output.confirmed,false);assert.equal(output.confirmed_at,null);
 output.months[24].exposed_percent=60;assert.equal(input.months[0].exposed_percent,25);
 assert.ok(managementIssues(output,'palouse-current').length>0);
 assert.throws(()=>copyYear(input,1,1));assert.throws(()=>copyYear(input,0,2));
});
test('catalog research evidence does not change scoring approval or fabricate schedules',()=>{
 const crops=read('data/crops.json').crops;
 const research=crops.filter(c=>c.research_traits);
 assert.equal(research.length,6);
 for(const c of research){
  assert.equal(c.verified,false);assert.equal(c.water_need,'TODO');assert.equal(c.root_depth,'TODO');assert.equal(c.min_season_days,null);
  for(const t of Object.values(c.research_traits)){assert.equal(t.review_status,'pending');assert.ok(t.source_url.startsWith('https://'));assert.ok(t.unit&&t.locator&&t.scope&&t.limitations);}
 }
 assert.equal(research.find(c=>c.id==='winter_pea_green').research_traits.growing_period.value,null);
 for(const r of read('data/rotations.json').rotations){assert.ok(r.schedule.every(m=>m.status==='unknown'));assert.ok(r.years.every(y=>y.planting_months===null&&y.harvest_months===null));}
});
test('soil records match configured points and exact archived receipt hashes',()=>{
 for(const farm of read('src/config/config.json').farms){
  const soil=read(`public/data/${farm.id}/soil.json`),raw=fs.readFileSync(`public/data/${farm.id}/soil-source.json`);
  assert.deepEqual(soil.farm,farm);
  assert.equal(soil.provenance.sha256,createHash('sha256').update(raw).digest('hex'));
  const receipt=JSON.parse(raw);assert.deepEqual(receipt.farm,farm);
  if(soil.status==='unavailable'){assert.ok(soil.reason);assert.deepEqual(soil.rows,[]);}else{assert.ok(soil.rows.length>0);assert.equal(receipt.error,null);}
 }
});
test('print total wording reflects included metrics instead of hardcoded release eligibility',()=>{
 assert.match(totalDescription({total:{status:'NOT_SCORED'}}),/No overall/);
 assert.match(totalDescription({total:{status:'SCORED',evidence:{included:['erosion']}}}),/Exposure-only/);
 const multiple=totalDescription({total:{status:'SCORED',evidence:{included:['water','soil']}}});
 assert.match(multiple,/water-demand/);assert.match(multiple,/soil-management/);assert.doesNotMatch(multiple,/Exposure-only/);
});
