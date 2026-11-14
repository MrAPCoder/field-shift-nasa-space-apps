// SYNTHETIC fixtures only. None of these values represent NASA data or crop advice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreRotation, scoreWater, scoreSoil, scoreErosion, weightedTotal } from '../src/lib/score.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const config = read('../src/config/config.json').scoring;
const source = 'https://example.test/synthetic-fixture';
const priorities = {water:5,soil:5,erosion:5,income:5};
function fixture() {
  const crops = ['a','b','c'].map((id,i) => ({id,name:id,verified:true,water_need:['low','med','high'][i],nitrogen_fixing:i===0,root_depth:i===0?'deep':'shallow',trait_sources:{water_need:[source],nitrogen_fixing:[source],root_depth:[source]}}));
  const rotation = {id:'synthetic',farm_id:'synthetic',verified:true,source_urls:[source],years:crops.map((c,i)=>({year:i+1,crop_ids:[c.id]})),schedule:Array.from({length:36},(_,i)=>({year:Math.floor(i/12)+1,month:i%12+1,status:'cash',verified:true,source_url:source}))};
  const climate = {farm:{id:'synthetic'},monthly:Array.from({length:12},(_,i)=>({month:i+1,rainfall_normal_mm:10,rainfall_valid_years:1}))};
  return {crops,rotation,climate};
}
const valid = value => ({status:'SCORED',value});
const missing = {status:'NOT_SCORED',value:null};
test('weighted average excludes income and unavailable priorities from both sums',()=>{
 const scores={water:valid(20),soil:valid(80),erosion:missing,income:valid(100)};
 const result=weightedTotal(scores,{water:2,soil:6,erosion:10,income:10});
 assert.equal(result.value,65);assert.equal(result.evidence.denominator,8);assert.deepEqual(result.evidence.excluded,['erosion','income']);
});
test('changing slider weights changes eligible total',()=>{
 const scores={water:valid(20),soil:valid(80),erosion:missing,income:missing};
 assert.equal(weightedTotal(scores,{water:10,soil:0,erosion:0,income:0}).value,20);
 assert.equal(weightedTotal(scores,{water:0,soil:10,erosion:0,income:0}).value,80);
});
test('all-zero, income-only and unavailable-only weights have no score',()=>{
 for(const p of [{water:0,soil:0,erosion:0,income:0},{water:0,soil:0,erosion:0,income:10},{water:10,soil:0,erosion:0,income:0}]) assert.equal(weightedTotal({},p).status,'NOT_SCORED');
});
test('invalid priorities and out-of-range supplied scores cannot create invalid totals',()=>{
 for(const weight of [-1,11,NaN,'5',undefined]) assert.equal(weightedTotal({water:valid(50)},{...priorities,water:weight}).status,'NOT_SCORED');
 assert.equal(weightedTotal({water:valid(101)},priorities).status,'NOT_SCORED');
});
test('water formula uses summer rainfall share and mean of three annual categories',()=>{
 const {rotation,crops,climate}=fixture();
 const score=scoreWater(rotation,crops,climate,config);
 assert.equal(score.value,62.5);assert.equal(score.evidence.summerRainMm,30);assert.equal(score.evidence.demandIndex,.5);
 climate.monthly[5].rainfall_normal_mm=120;
 assert.ok(scoreWater(rotation,crops,climate,config).value>score.value);
});
test('missing crop definition, unreviewed trait or unknown demand is not scored',()=>{
 for(const mutate of [f=>f.crops.pop(),f=>f.crops[0].verified=false,f=>f.crops[0].water_need='TODO',f=>f.crops[0].trait_sources.water_need=[]]){
  const f=fixture();mutate(f);assert.equal(scoreWater(f.rotation,f.crops,f.climate,config).status,'NOT_SCORED');
 }
});
test('multicrop years have no assumed equal-share water weighting',()=>{
 const f=fixture();f.rotation.years[0].crop_ids.push('b');assert.equal(scoreWater(f.rotation,f.crops,f.climate,config).status,'NOT_SCORED');
});
test('soil components have independently calculable contributions',()=>{
 const f=fixture();f.rotation.schedule.slice(0,18).forEach(row=>row.status='cover');
 const result=scoreSoil(f.rotation,f.crops,config);
 assert.ok(Math.abs(result.value-85)<1e-10);assert.deepEqual(result.evidence.components,{legume:1,cover:.5,rootDiversity:1,nonBare:1});
});
test('soil rejects unknown nitrogen fixation, roots, source or review',()=>{
 for(const mutate of [f=>f.crops[0].nitrogen_fixing=null,f=>f.crops[0].root_depth='TODO',f=>f.crops[0].trait_sources.root_depth=[],f=>f.crops[0].verified=false]){
  const f=fixture();mutate(f);assert.equal(scoreSoil(f.rotation,f.crops,config).status,'NOT_SCORED');
 }
});
test('erosion fully covered and fully bare rotations score 100 and zero',()=>{
 const f=fixture();assert.equal(scoreErosion(f.rotation,f.climate).value,100);
 f.rotation.schedule.forEach(row=>row.status='bare');assert.equal(scoreErosion(f.rotation,f.climate).value,0);
});
test('erosion weights bare months by rainfall across all three years',()=>{
 const f=fixture();f.climate.monthly[0].rainfall_normal_mm=110;
 f.rotation.schedule[0].status='bare';f.rotation.schedule[12].status='bare';
 const result=scoreErosion(f.rotation,f.climate);
 assert.equal(result.evidence.exposedRainMmOverThreeYears,220);
 assert.ok(Math.abs(result.value-100*(1-220/660))<1e-10);
});
test('one year of bare soil is exactly one third exposure, independent of row ordering',()=>{
 const f=fixture();f.rotation.schedule.slice(0,12).forEach(row=>row.status='bare');f.rotation.schedule.reverse();
 assert.ok(Math.abs(scoreErosion(f.rotation,f.climate).value-200/3)<1e-10);
});
test('unknown, unsourced and unapproved cover or malformed 36-month schedules fail closed',()=>{
 for(const mutate of [s=>s.pop(),s=>s[0].status='unknown',s=>s[0].verified=false,s=>s[0].source_url=null,s=>s[0].month=13,s=>s[0]={...s[1]}]){
  const f=fixture();mutate(f.rotation.schedule);
  assert.equal(scoreErosion(f.rotation,f.climate).status,'NOT_SCORED');assert.equal(scoreSoil(f.rotation,f.crops,config).status,'NOT_SCORED');
 }
});
test('rainfall missing, negative, no valid years or zero annual denominator is unavailable',()=>{
 for(const mutate of [m=>m.pop(),m=>m[0].rainfall_normal_mm=null,m=>m[0].rainfall_normal_mm=-1,m=>m[0].rainfall_valid_years=0,m=>m.forEach(row=>row.rainfall_normal_mm=0)]){
  const f=fixture();mutate(f.climate.monthly);
  assert.equal(scoreErosion(f.rotation,f.climate).status,'NOT_SCORED');assert.equal(scoreWater(f.rotation,f.crops,f.climate,config).status,'NOT_SCORED');
 }
});
test('rotation review, explicit sequence and sources are mandatory',()=>{
 for(const mutate of [r=>r.verified=false,r=>r.source_urls=[],r=>r.years[0].crop_ids=[],r=>r.years[1].year=1]){
  const f=fixture();mutate(f.rotation);const result=scoreRotation(f.rotation,f.crops,f.climate,priorities,config);
  assert.ok(Object.values(result.scores).every(score=>score.status==='NOT_SCORED'));
 }
});
test('income always remains unscored and reports missing prices and costs',()=>{
 const f=fixture();const result=scoreRotation(f.rotation,f.crops,f.climate,priorities,config);
 assert.equal(result.scores.income.value,null);assert.match(result.scores.income.reasons[0],/prices and production costs/);
 assert.ok(result.total.evidence.excluded.includes('income'));
});
test('climate from a different farm cannot produce water or erosion scores',()=>{
 const f=fixture();f.climate.farm.id='different';const result=scoreRotation(f.rotation,f.crops,f.climate,priorities,config);
 assert.equal(result.scores.water.status,'NOT_SCORED');assert.equal(result.scores.erosion.status,'NOT_SCORED');assert.equal(result.scores.soil.status,'SCORED');
});
test('invalid coefficients fail closed',()=>{
 const f=fixture();
 const huge={legume:Number.MAX_VALUE,cover:Number.MAX_VALUE,rootDiversity:Number.MAX_VALUE,nonBare:Number.MAX_VALUE};
 assert.equal(scoreSoil(f.rotation,f.crops,{...config,soilWeights:huge}).status,'NOT_SCORED');
 assert.equal(scoreWater(f.rotation,f.crops,f.climate,{...config,summerMonths:[6,6]}).status,'NOT_SCORED');
 assert.equal(scoreWater(f.rotation,f.crops,f.climate,{...config,waterDemandIndex:{low:1,med:.5,high:0}}).status,'NOT_SCORED');
 assert.equal(scoreSoil(f.rotation,f.crops,{...config,soilWeights:{legume:0,cover:0,rootDiversity:0,nonBare:0}}).status,'NOT_SCORED');
});
test('scores remain bounded, deterministic and do not mutate inputs',()=>{
 const f=fixture(),before=structuredClone(f);const one=scoreRotation(f.rotation,f.crops,f.climate,priorities,config);
 assert.deepEqual(one,scoreRotation(f.rotation,f.crops,f.climate,priorities,config));assert.deepEqual(f,before);
 for(const score of [one.total,...Object.values(one.scores)]) if(score.status==='SCORED') assert.ok(score.value>=0&&score.value<=100);
});
test('real catalog has exactly three slots per farm and stays unscored before approval',()=>{
 const crops=read('../data/crops.json'),rotations=read('../data/rotations.json');
 for(const farm of ['skagit','yakima','palouse']){
  const choices=rotations.rotations.filter(r=>r.farm_id===farm);assert.equal(choices.length,3);assert.deepEqual(choices.map(r=>r.slot),['current','alternative-a','alternative-b']);
  const climate=read(`../public/data/${farm}/climate.json`);
  for(const r of choices){assert.equal(r.verified,false);assert.equal(r.schedule.length,36);assert.equal(scoreRotation(r,crops.crops,climate,priorities,config).total.status,'NOT_SCORED');r.years.flatMap(y=>y.crop_ids).forEach(id=>assert.ok(crops.crops.some(c=>c.id===id)));}
 }
 assert.ok(crops.crops.every(c=>c.verified===false));
 for(const r of rotations.rotations) for(const url of r.source_urls) assert.ok(Object.values(crops.sources).some(s=>s.url===url&&s.opened_and_read));
});
