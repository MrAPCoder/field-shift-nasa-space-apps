// Calendar values below are synthetic test assumptions, never saved to the real catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyManagement, editManagement, managementIssues } from '../src/lib/management.js';
import { scoreRotation, scoreErosion, demonstrationApproved } from '../src/lib/score.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const rotations = read('../data/rotations.json').rotations;
const crops = read('../data/crops.json').crops;
const config = read('../src/config/config.json').scoring;
const climate = read('../public/data/palouse/climate.json');
const priorities = { water: 5, soil: 5, erosion: 5, income: 5 };
const rotation = rotations.find(r => r.id === 'palouse-current');
function complete() {
 const input = emptyManagement(rotation.id);
 return { ...input, context: 'SYNTHETIC TEST ONLY', confirmed_by: 'Test fixture', confirmed: true, confirmed_at: '2026-11-14T00:00:00Z', months: input.months.map(row => ({...row,status:'cash',exposed_percent:50})) };
}
test('all months initially Unknown, no inferred exposure or research verification', () => {
 const input = emptyManagement(rotation.id);
 assert.equal(input.months.length,36); assert.ok(input.months.every(r=>r.status==='unknown'&&r.exposed_percent===null&&!r.verified));
 assert.equal(scoreErosion(rotation,climate,input).status,'NOT_SCORED');
});
test('only three Palouse sequences are approved for demonstration; traits and schedules remain unverified', () => {
 assert.equal(rotations.filter(demonstrationApproved).length,3);
 assert.ok(rotations.filter(demonstrationApproved).every(r=>r.farm_id==='palouse'&&!r.verified&&r.schedule.every(m=>!m.verified&&m.status==='unknown')));
 assert.ok(crops.every(c=>!c.verified));
});
test('confirmed fractional exposure uses actual cached NASA rainfall without crop-status protection inference', () => {
 const input=complete();const result=scoreRotation(rotation,crops,climate,priorities,config,input);
 assert.ok(Math.abs(result.scores.erosion.value-50)<1e-10);
 assert.equal(result.scores.erosion.evidence.sourceKind,'farmer_input');
 assert.equal(result.scores.erosion.evidence.mode,'proposed');
 assert.deepEqual(result.total.evidence.included,['erosion']);
 for(const k of ['water','soil','income'])assert.equal(result.scores[k].status,'NOT_SCORED');
 for(const r of input.months)r.exposed_percent=100;
 assert.ok(Math.abs(scoreErosion(rotation,climate,input).value)<1e-10);
});
test('one exposed January is independently weighted by the January NASA normal', () => {
 const input=complete(); input.months.forEach(r=>r.exposed_percent=0);input.months[0].exposed_percent=100;
 const annual=climate.monthly.reduce((s,r)=>s+r.rainfall_normal_mm,0);
 assert.ok(Math.abs(scoreErosion(rotation,climate,input).value-100*(1-climate.monthly[0].rainfall_normal_mm/(3*annual)))<1e-10);
});
test('missing, duplicate, unknown, invalid and contradictory monthly inputs fail closed', () => {
 for(const mutate of [m=>m.pop(),m=>m[0]={...m[1]},m=>m[0]=null,m=>m[0].month=13,m=>m[0].status='unknown',m=>m[0].exposed_percent=null,m=>m[0].exposed_percent='50',m=>m[0].exposed_percent=101,m=>m[0].exposed_percent=-1,m=>m[0].exposed_percent=NaN,m=>m[0].status='bare']){
  const input=complete();mutate(input.months);assert.equal(scoreErosion(rotation,climate,input).status,'NOT_SCORED');
 }
});
test('missing or incorrect provenance and confirmation cannot produce a score', () => {
 for(const patch of [{rotation_id:'other'},{source_kind:'published'},{method:'other'},{mode:'example'},{confirmed:false},{confirmed_at:null},{confirmed_at:'invalid'},{context:''},{confirmed_by:2}]){
  assert.equal(scoreErosion(rotation,climate,{...complete(),...patch}).status,'NOT_SCORED');
 }
 assert.equal(scoreErosion(rotation,climate,null).status,'NOT_SCORED');
});
test('every edit revokes confirmation without mutating the original', () => {
 const input=complete(),before=structuredClone(input);
 for(const patch of [{context:'new'},{mode:'observed'},{confirmed_by:'someone'},{months:input.months.map(r=>({...r,exposed_percent:0}))}]){
  const next=editManagement(input,patch);assert.equal(next.confirmed,false);assert.equal(next.confirmed_at,null);
  assert.equal(scoreErosion(rotation,climate,next).status,'NOT_SCORED');
 }
 assert.deepEqual(input,before);
});
test('observed inputs stay farmer reported and use historical normals, not measured erosion', () => {
 const result=scoreErosion(rotation,climate,{...complete(),mode:'observed'});
 assert.equal(result.evidence.mode,'observed');assert.equal(result.evidence.sourceKind,'farmer_input');
});
test('complete calendars cannot approve missing regional sequences or mismatched climate', () => {
 for(const r of rotations.filter(r=>r.farm_id!=='palouse'))assert.equal(scoreErosion(r,{...climate,farm:{id:r.farm_id}},{...complete(),rotation_id:r.id}).status,'NOT_SCORED');
 assert.equal(scoreErosion(rotation,{...climate,farm:{id:'yakima'}},complete()).status,'NOT_SCORED');
 const unapproved={...rotation,sequence_approval:{status:'approved',scope:'local_suitability'}};
 assert.equal(scoreErosion(unapproved,climate,complete()).status,'NOT_SCORED');
});
test('only erosion affects the current total, zero erosion weight means no total', () => {
 const input=complete();
 for(const weight of [0,10]){
  const r=scoreRotation(rotation,crops,climate,{...priorities,water:weight,soil:weight,income:weight},config,input);
  assert.ok(Math.abs(r.total.value-50)<1e-10);
 }
 assert.equal(scoreRotation(rotation,crops,climate,{...priorities,erosion:0},config,input).total.status,'NOT_SCORED');
});
test('month order is immaterial; calculations are deterministic and do not mutate assumptions', () => {
 const input=complete();input.months.reverse();const before=structuredClone(input);
 assert.deepEqual(scoreErosion(rotation,climate,input),scoreErosion(rotation,climate,input));assert.deepEqual(input,before);
 assert.deepEqual(managementIssues(input,rotation.id),[]);
});
