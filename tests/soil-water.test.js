import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MODEL,validateSoilWeather,referenceET,runSoilSimulation,compareSoil,bucketStep,dailyCoefficients,seasonProgress,monthlyBalance,periodBalance,startupSensitivity} from '../src/lib/soilWater.js';
const load=id=>JSON.parse(readFileSync(new URL(`../public/data/${id}/soil-weather.json`,import.meta.url)));
const scenario={location:'palouse',year:2023,crop:'spring_wheat',soil:'loamy',irrigation:0,planting:4,harvest:8,cover:'bare'};
const real=load('palouse');
const run=(s={},w=real,m=MODEL)=>runSoilSimulation(w,{...scenario,...s},m);
// Synthetic altered weather is used ONLY in tests, never served by the app.
const synthetic=(updates={})=>{const w=structuredClone(real);for(const [key,value] of Object.entries(updates)) w.series[key].fill(value);return w;};
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} ≠ ${b}`);

test('FAO-56 worked daily example 18: independently published ~3.88 mm/day',()=>{
 // FAO example gives ea=1.409 kPa from RHmin/max. Equivalent RH is used
 // solely to reproduce that published vapour pressure with our eq.19 interface.
 const e=t=>.6108*Math.exp(17.27*t/(t+237.3));
 const rh=100*1.409/((e(12.3)+e(21.5))/2);
 const et=referenceET({tMin:12.3,tMax:21.5,rh,solar:22.07,wind:2.078,pressure:100.1,latitude:50.8,elevation:100,date:'2023-07-06'});
 near(et,3.88,.03);
});
test('ET responds to temperature, humidity, sunlight and wind; missing is unavailable',()=>{
 const w={tMin:15,tMax:25,rh:60,solar:20,wind:2,pressure:100,latitude:46.76,elevation:800,date:'2023-07-06'};
 const base=referenceET(w);
 for(const change of [{tMin:20,tMax:30},{rh:30},{solar:25},{wind:4}]) assert.ok(referenceET({...w,...change})>base);
 assert.equal(referenceET({...w,rh:null}),null);
 assert.equal(referenceET({...w,solar:null}),null);
 assert.equal(referenceET({...w,tMin:30}),null);
});
test('all farm archives validate and all 15 farm-years produce bounded, balanced results',()=>{
 for(const id of ['palouse','yakima','skagit']){
  const data=load(id);validateSoilWeather(data,data.farm);
  for(const year of [2021,2022,2023,2024,2025]){
   const r=run({location:id,year},data);assert.equal(r.status,'ready');
   assert.equal(r.days.length,year===2024?366:365);
   near(r.summary.massBalanceError,0,1e-7);
   for(const d of r.days){assert.ok(d.water>=0&&d.water<=r.capacity);assert.ok(d.actualET<=d.demand+1e-9);near(d.balanceError,0);}
  }
 }
});
test('irrigation raises daily water or drains at capacity; net irrigation only during season',()=>{
 const base=run(),irrigated=run({irrigation:35});
 assert.ok(irrigated.summary.meanAvailablePercent>base.summary.meanAvailablePercent);
 for(let i=0;i<base.days.length;i++) assert.ok(irrigated.days[i].water>=base.days[i].water-1e-8);
 assert.ok(irrigated.summary.dryDays<=base.summary.dryDays);
 assert.ok(irrigated.days.filter(d=>!d.active).every(d=>d.irrigation===0));
 near(irrigated.summary.irrigation,irrigated.days.filter(d=>d.active).length*5);
 const full=bucketStep(120,120,{rain:20,irrigation:100,demand:0,depletion:.5});
 assert.equal(full.water,120);assert.equal(full.drainage,120);
});
test('soil type changes physical capacity and water storage',()=>{
 const sand=run({soil:'sandy'}),loam=run({soil:'loamy'}),clay=run({soil:'clay'});
 near(sand.capacity,42);near(loam.capacity,120);near(clay.capacity,72);
 assert.notDeepEqual(sand.days.map(d=>d.water),clay.days.map(d=>d.water));
 assert.ok(loam.capacity>clay.capacity); // clay has more tightly bound water, not the largest available store.
});
test('supported crops change demand; unknown/unsourced parameters fail closed',()=>{
 const wheat=run(),pea=run({crop:'spring_pea'}),potato=run({crop:'potato'});
 assert.notEqual(wheat.summary.demand,pea.summary.demand);assert.notEqual(wheat.summary.demand,potato.summary.demand);
 assert.equal(run({crop:'triticale'}).status,'unavailable');
 const model=structuredClone(MODEL);model.sources.crop.url='';
 assert.equal(run({},real,model).status,'unavailable');
});
test('real NASA weather materially drives water results, not preset visuals',()=>{
 const a=run(),b=run({},synthetic({PRECTOTCORR:0})),c=run({},synthetic({RH2M:20}));
 assert.notEqual(a.summary.meanAvailablePercent,b.summary.meanAvailablePercent);
 assert.notEqual(a.summary.et0,c.summary.et0);
 assert.ok(b.summary.rain===0);
 assert.notEqual(a.summary.et0,run({location:'yakima'},load('yakima')).summary.et0);
});
test('residue and live cover change calculated exposure; live cover consumes off-season water',()=>{
 const bare=run(),residue=run({cover:'residue'}),cover=run({cover:'cover'});
 assert.ok(residue.summary.exposedRain<bare.summary.exposedRain);
 assert.ok(cover.summary.exposedRain<bare.summary.exposedRain);
 assert.ok(residue.summary.demand<bare.summary.demand);
 assert.ok(cover.summary.demand>bare.summary.demand);
 assert.notEqual(residue.summary.meanAvailablePercent,bare.summary.meanAvailablePercent);
 assert.equal(dailyCoefficients('2023-06-01',{...scenario,cover:'cover'}).kc,dailyCoefficients('2023-06-01',scenario).kc);
});
test('identical inputs are deterministic and do not mutate weather or scenario',()=>{
 const snapshot=JSON.stringify(real),inputs=JSON.stringify(scenario);
 assert.deepEqual(run(),run());assert.equal(JSON.stringify(real),snapshot);assert.equal(JSON.stringify(scenario),inputs);
});
test('comparisons enforce actual identical weather, years, location and model',()=>{
 const a=run(),b=run({irrigation:20});assert.equal(compareSoil(a,b).length,6);
 assert.throws(()=>compareSoil(a,run({year:2022})),/same historical/);
 // Even a modified array carrying an unchanged fingerprint must not be accepted.
 assert.throws(()=>compareSoil(a,run({},synthetic({WS2M:1}))),/same historical/);
 assert.throws(()=>compareSoil(a,{...b,modelVersion:'different'}),/same historical/);
});
test('missing forcing fails entire trajectory; GWETROOT is context, never a surrogate',()=>{
 for(const key of ['PRECTOTCORR','T2M_MIN','T2M_MAX','RH2M','ALLSKY_SFC_SW_DWN','WS2M','PS']){
  const r=run({},synthetic({[key]:null}));assert.equal(r.status,'unavailable');assert.deepEqual(r.days,[]);
 }
 const r=run({},synthetic({GWETROOT:null}));assert.equal(r.status,'ready');assert.equal(r.days[0].nasaWetness,null);assert.deepEqual(r.summary,run().summary);
});
test('season boundaries, year wrap and leap day are deterministic',()=>{
 assert.equal(seasonProgress('2023-04-01',4,8),0);assert.equal(seasonProgress('2023-08-31',4,8),1);
 assert.equal(seasonProgress('2023-09-01',4,8),null);
 assert.ok(seasonProgress('2023-01-01',10,7)>0);assert.equal(seasonProgress('2023-08-01',10,7),null);
 const r=run({year:2024});assert.ok(r.days.some(d=>d.date==='2024-02-29'));
});
test('invalid user inputs and incompatible weather schemas cannot silently produce results',()=>{
 for(const s of [{irrigation:''},{irrigation:-1},{irrigation:Infinity},{soil:'unknown'},{planting:0},{harvest:13},{cover:'unknown'},{year:2020}])assert.equal(run(s).status,'unavailable');
 for(const edit of [d=>d.units.WS2M='km/h',d=>d.series.RH2M[0]=101,d=>d.farm.latitude=0,d=>d.series.PS.pop(),d=>d.sources=[]]){const d=structuredClone(real);edit(d);assert.throws(()=>validateSoilWeather(d,real.farm));}
});

// ---- M7 audit: calendar indexing, monthly conservation, boundaries and assumptions ----
const FARMS=['palouse','skagit','yakima'],YEARS=[2021,2022,2023,2024,2025];
const DATA=Object.fromEntries(FARMS.map(id=>[id,load(id)]));
test('every daily record reads the NASA value for its own calendar date, with no gaps across years',()=>{
 for(const id of FARMS){const w=DATA[id];let k=0;
  for(const year of YEARS){const r=run({location:id,year},w);
   assert.equal(r.days[0].date,`${year}-01-01`);assert.equal(r.days.at(-1).date,`${year}-12-31`);
   r.days.forEach((d,i)=>{
    assert.equal(Date.parse(d.date),Date.parse(w.start)+k*86400000,`${id} ${d.date} index`);
    assert.equal(d.rain,w.series.PRECTOTCORR[k]);assert.equal(d.tMax,w.series.T2M_MAX[k]);assert.equal(d.tMin,w.series.T2M_MIN[k]);
    assert.equal(d.rh,w.series.RH2M[k]);assert.equal(d.solar,w.series.ALLSKY_SFC_SW_DWN[k]);assert.equal(d.wind,w.series.WS2M[k]);
    assert.equal(d.pressure,w.series.PS[k]);assert.equal(d.nasaWetness,w.series.GWETROOT[k]);k++;
    if(i) assert.equal(Date.parse(d.date)-Date.parse(r.days[i-1].date),86400000);
   });
  }
  assert.equal(k,w.days,'all 1,826 archived days are used exactly once across the five years');
 }
});
test('monthly balances close for all 15 farm-years × 12 months; storage is a state, not summed',()=>{
 const feb={2021:28,2022:28,2023:28,2024:29,2025:28};
 for(const id of FARMS) for(const year of YEARS) for(const s of [{},{irrigation:30,crop:'potato',planting:5,harvest:9},{cover:'cover',soil:'sandy'},{planting:10,harvest:7,cover:'residue',soil:'clay'}]){
  const r=run({location:id,year,...s},DATA[id]),months=monthlyBalance(r);
  assert.equal(months.length,12);assert.equal(months[1].days,feb[year]);
  assert.equal(months.reduce((n,m)=>n+m.days,0),r.days.length);
  near(months[0].start,r.initialWater);near(months[11].end,r.summary.finalWater);
  months.forEach((m,i)=>{
   near(m.residual,0,1e-9);
   if(i) assert.equal(m.start,months[i-1].end); // Dec 31 → Jan 1 carry is within a year only; months chain exactly.
   assert.equal(r.days[m.first].date.slice(5),`${String(i+1).padStart(2,'0')}-01`);
   near(m.rain,r.days.slice(m.first,m.last+1).reduce((t,d)=>t+d.rain,0));
  });
  for(const k of ['rain','irrigation','actualET','drainage']) near(months.reduce((t,m)=>t+m[k],0),r.summary[k],1e-7);
 }
});
test('month-to-date balance used by the panel closes on every day and rejects invalid ranges',()=>{
 const r=run({irrigation:20}),months=monthlyBalance(r);
 for(let i=0;i<r.days.length;i++){const m=months[Number(r.days[i].date.slice(5,7))-1],p=periodBalance(r,m.first,i);
  near(p.residual,0,1e-9);assert.equal(p.end,r.days[i].water);}
 for(const [a,b] of [[-1,3],[5,2],[0,365],[0.5,3]]) assert.equal(periodBalance(r,a,b),null);
 assert.equal(periodBalance({status:'unavailable'},0,1),null);
});
test('surface pressure and every ET forcing changes reference ET; pressure is a real model input',()=>{
 const w={tMin:12,tMax:28,rh:45,solar:24,wind:3,pressure:100,latitude:46.76,elevation:800,date:'2023-07-06'};
 assert.notEqual(referenceET({...w,pressure:85}),referenceET(w));
 const base=run();
 for(const [key,value] of [['PS',80],['ALLSKY_SFC_SW_DWN',5],['WS2M',8],['RH2M',95]]){
  const r=run({},synthetic({[key]:value}));assert.equal(r.status,'ready',key);assert.notEqual(r.summary.et0,base.summary.et0,key);}
 // SYNTHETIC: real temperatures shifted +4 °C (keeps Tmin ≤ Tmax on every day).
 const warm=structuredClone(real);for(const k of ['T2M_MAX','T2M_MIN']) warm.series[k]=warm.series[k].map(v=>v+4);
 assert.ok(run({},warm).summary.et0>base.summary.et0);
});
test('seasons crossing New Year: previous-autumn crop days are flagged, irrigated and never carried over',()=>{
 const wrap=run({planting:10,harvest:7,irrigation:14}),normal=run({irrigation:14});
 assert.equal(wrap.wrapsYear,true);assert.equal(normal.wrapsYear,false);
 const jan1=wrap.days[0];assert.equal(jan1.active,true);
 // Jan 1 2023 position is measured from Oct 1 2022 → end of Jul 2023, exactly as the coefficient schedule assumes.
 near(seasonProgress('2023-01-01',10,7),(Date.UTC(2023,0,1)-Date.UTC(2022,9,1))/(Date.UTC(2023,7,1)-Date.UTC(2022,9,1)-86400000));
 near(jan1.irrigation,2);near(wrap.initialWater,wrap.capacity*MODEL.assumptions.initialAvailableFraction);
 for(const d of wrap.days){const m=Number(d.date.slice(5,7));assert.equal(d.active,m<=7||m>=10,d.date);assert.equal(d.irrigation>0,d.active);}
 // Dec 31 storage is not fed into the next year's Jan 1: every year restarts from the stated assumption.
 for(const year of [2022,2023,2024]) near(run({planting:10,harvest:7,year}).initialWater,wrap.initialWater);
});
test('starting-water sensitivity: after the reported date, 0% and 100% starts are identical; dry climates remember longer',()=>{
 const m0=structuredClone(MODEL),m1=structuredClone(MODEL);m0.assumptions.initialAvailableFraction=0;m1.assumptions.initialAvailableFraction=1;
 const dates={};
 for(const id of FARMS){const s={location:id,year:2023},st=startupSensitivity(DATA[id],{...scenario,...s});
  assert.equal(st.status,'ready');assert.ok(st.index>0);
  const a=run(s,DATA[id],m0),b=run(s,DATA[id],m1);
  for(let i=st.index;i<a.days.length;i++) assert.ok(Math.abs(a.days[i].water-b.days[i].water)<st.tolerance,`${id} ${a.days[i].date}`);
  assert.ok(Math.abs(a.days[st.index-1].water-b.days[st.index-1].water)>=st.tolerance);
  dates[id]=st.date;
 }
 // Archived result, Palouse 2023 loam: memory ends 2023-03-06. Semi-arid Yakima keeps it into summer.
 assert.equal(dates.palouse,'2023-03-06');assert.ok(dates.yakima>'2023-07-01',dates.yakima);assert.ok(dates.skagit<dates.palouse);
 assert.equal(startupSensitivity(real,{...scenario,soil:'unknown'}).status,'unavailable');
});
test('freezing days are flagged from NASA minimum temperature; their precipitation is still counted, not hidden',()=>{
 for(const id of FARMS){const r=run({location:id},DATA[id]);
  for(const d of r.days) assert.equal(d.freezing,d.tMin<=0);
  near(r.summary.freezingPrecip,r.days.filter(d=>d.tMin<=0).reduce((t,d)=>t+d.rain,0));
  assert.equal(r.summary.coldDays,r.days.filter(d=>d.freezing).length);}
 assert.ok(run().summary.freezingPrecip>100,'Palouse 2023: >100 mm falls on freezing days, a material limitation');
});
