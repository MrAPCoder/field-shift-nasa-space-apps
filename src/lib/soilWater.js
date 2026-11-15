// Simplified daily historical soil-water balance, with FAO-56 reference ET.
// All assumptions and sources: config.soilSimulation; derivation: docs/METHODS.md.
import config from '../config/config.json' with { type: 'json' };
export const MODEL = config.soilSimulation;
const DAY = 86400000;
export const UNITS = {PRECTOTCORR:'mm/day',T2M_MAX:'C',T2M_MIN:'C',RH2M:'%',ALLSKY_SFC_SW_DWN:'MJ/m^2/day',GWETROOT:'1',WS2M:'m/s',PS:'kPa'};
const bounds = {PRECTOTCORR:[0,2000],T2M_MAX:[-90,65],T2M_MIN:[-90,65],RH2M:[0,100],ALLSKY_SFC_SW_DWN:[0,60],GWETROOT:[0,1],WS2M:[0,100],PS:[40,110]};
const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const clamp = (v,lo,hi) => Math.min(hi,Math.max(lo,v));
const sat = t => .6108 * Math.exp(17.27*t/(t+237.3));
const iso = ms => new Date(ms).toISOString().slice(0,10);

export function validateSoilWeather(data, farm) {
  const fail = text => { throw new Error(`Soil weather unavailable: ${text}`); };
  if (data?.schema !== 'field-shift-soil-weather' || data.schema_version !== 1) fail('unexpected schema.');
  if (!farm || data.farm?.id !== farm.id || data.farm.latitude !== farm.latitude || data.farm.longitude !== farm.longitude) fail('location mismatch.');
  if (data.start !== MODEL.weatherStart || data.end !== MODEL.weatherEnd || data.time_standard !== 'LST') fail('unexpected dates or time standard.');
  const days = (Date.parse(data.end)-Date.parse(data.start))/DAY+1;
  if (data.days !== days || !finite(data.elevation_m,-500,9000)) fail('invalid length or elevation.');
  if (!/^[a-f0-9]{64}$/.test(data.fingerprint ?? '') || !data.sources?.length || data.sources.some(s => !/^[a-f0-9]{64}$/.test(s.sha256??'') || !s.url?.startsWith('https://power.larc.nasa.gov/'))) fail('missing archive provenance.');
  for (const [key,unit] of Object.entries(UNITS)) {
    const column=data.series?.[key];
    if (data.units?.[key] !== unit || !Array.isArray(column) || column.length !== days || column.some(v => v !== null && !finite(v,...bounds[key]))) fail(`invalid ${key}.`);
  }
  if (data.series.T2M_MIN.some((v,i) => v !== null && data.series.T2M_MAX[i] !== null && v > data.series.T2M_MAX[i])) fail('minimum exceeds maximum.');
  Object.values(data.series).forEach(Object.freeze); Object.freeze(data.series);
  return Object.freeze(data);
}
const weatherCache = new Map();
export async function loadSoilWeather(farm) {
  if (!weatherCache.has(farm.id)) {
    const request = fetch(`./data/${farm.id}/soil-weather.json`).then(r => { if(!r.ok) throw new Error(`Saved NASA weather could not be loaded (${r.status}).`); return r.json(); }).then(d=>validateSoilWeather(d,farm)).catch(e=>{weatherCache.delete(farm.id);throw e;});
    weatherCache.set(farm.id,request);
  }
  return weatherCache.get(farm.id);
}

// FAO-56 equations 6, 11–13, 19, 21, 23–25, 37–39. Rs is MJ/m²/day.
// RH2M is daily mean RH, used as an approximation to RHmean in eq.19.
export function referenceET({tMin,tMax,rh,solar,wind,pressure,latitude,elevation,date}) {
  if (![tMin,tMax,rh,solar,wind,pressure,latitude,elevation].every(v=>typeof v==='number'&&Number.isFinite(v)) || !Number.isFinite(Date.parse(date))) return null;
  if(tMin>tMax || rh<0 || rh>100 || solar<0 || wind<0 || pressure<=0 || Math.abs(latitude)>=66) return null;
  const temperature=(tMin+tMax)/2, es=(sat(tMin)+sat(tMax))/2, ea=es*rh/100;
  const delta=4098*sat(temperature)/(temperature+237.3)**2, gamma=.000665*pressure;
  const day=Math.round((Date.parse(date)-Date.UTC(Number(date.slice(0,4)),0,1))/DAY)+1;
  const phi=latitude*Math.PI/180, angle=2*Math.PI*day/365;
  const dr=1+.033*Math.cos(angle), declination=.409*Math.sin(angle-1.39);
  const sunset=Math.acos(clamp(-Math.tan(phi)*Math.tan(declination),-1,1));
  const ra=24*60/Math.PI*.0820*dr*(sunset*Math.sin(phi)*Math.sin(declination)+Math.cos(phi)*Math.cos(declination)*Math.sin(sunset));
  const clear=(.75+.00002*elevation)*ra;
  if(clear<=0) return null;
  // Cloud factor bounded at zero and clear sky; prevents negative longwave loss on dark days.
  const cloud=Math.max(0,1.35*Math.min(1,solar/clear)-.35);
  const longwave=4.903e-9*((tMax+273.16)**4+(tMin+273.16)**4)/2*Math.max(0,.34-.14*Math.sqrt(ea))*cloud;
  const net=.77*solar-longwave; // reference grass albedo 0.23; daily G = 0.
  return Math.max(0,(.408*delta*net+gamma*900/(temperature+273)*wind*(es-ea))/(delta+gamma*(1+.34*wind)));
}

function sourcedCrop(id, model) {
  const crop=model.crops[id];
  if (!crop || ![crop.source,crop.basalSource,crop.depletionSource].every(s=>model.sources[s]?.url?.startsWith('https://')) ||
      ![crop.kc,crop.kcb].every(a=>Array.isArray(a)&&a.length===3&&a.every(v=>finite(v,0,2))) || !finite(crop.depletion,.1,.8)) return null;
  return crop;
}
export function validateScenario(s, model=MODEL) {
  if (!sourcedCrop(s?.crop,model)) throw new Error('Crop water-demand parameters are unavailable. Choose a supported crop.');
  const soil=model.soils[s.soil];
  if (!soil || !model.sources[soil.source]?.url?.startsWith('https://') || !finite(soil.wiltingPoint,0,1) || !finite(soil.fieldCapacity,soil.wiltingPoint+.001,1)) throw new Error('Soil storage parameters are unavailable.');
  if (!finite(s.irrigation,0,200)) throw new Error('Enter net irrigation from 0 to 200 mm/week.');
  if (![s.planting,s.harvest].every(m=>Number.isInteger(m)&&m>=1&&m<=12)) throw new Error('Choose planting and harvest months.');
  if (!['bare','residue','cover'].includes(s.cover)) throw new Error('Choose ground cover.');
  if (!Number.isInteger(s.year) || s.year<2021 || s.year>2025) throw new Error('Choose a historical year from 2021 to 2025.');
  return s;
}

// Coefficient schedule follows assumed dates, never simulated growth or observed phenology.
export function seasonProgress(date, planting, harvest) {
  const d=new Date(date+'T00:00:00Z'), y=d.getUTCFullYear(), m=d.getUTCMonth()+1;
  const active=planting<=harvest ? m>=planting&&m<=harvest : m>=planting||m<=harvest;
  if(!active) return null;
  const startYear=planting>harvest&&m<=harvest ? y-1:y;
  const start=Date.UTC(startYear,planting-1,1), end=Date.UTC(startYear+(planting>harvest?1:0),harvest,1);
  return (d.getTime()-start)/(end-start-DAY);
}
function curve(values,progress,stages) {
  const [initial,development,middle]=stages;
  if(progress<=initial) return values[0];
  if(progress<initial+development) return values[0]+(values[1]-values[0])*(progress-initial)/development;
  if(progress<=initial+development+middle) return values[1];
  return values[1]+(values[2]-values[1])*(progress-initial-development-middle)/stages[3];
}
export function dailyCoefficients(date,scenario,model=MODEL) {
  const a=model.assumptions,crop=model.crops[scenario.crop],progress=seasonProgress(date,scenario.planting,scenario.harvest);
  const active=progress !== null;
  let coefficients=active ? [...crop.kc] : [a.bareOffSeasonKc,a.bareOffSeasonKc,a.bareOffSeasonKc];
  if (scenario.cover==='residue') {
    const reduction=.5*a.residueCoverFraction; // FAO-56 chapter 10, single-Kc organic mulch rule.
    coefficients=coefficients.map((v,i)=>v-reduction*(active&&i>0 ? Math.max(0,v-crop.kcb[i]):v));
  } else if(!active && scenario.cover==='cover') coefficients.fill(a.coverOffSeasonKc);
  const exposed=active ? a.cashExposedFraction : scenario.cover==='cover' ? a.coverCropExposedFraction:1;
  return {active,kc:active?curve(coefficients,progress,a.stageFractions):coefficients[0],
    exposedFraction:scenario.cover==='residue'?exposed*(1-a.residueCoverFraction):exposed,
    depletion:active?crop.depletion:a.offSeasonDepletion};
}

// One well-mixed plant-available-water bucket. Mass balance closes every day.
export function bucketStep(storage,capacity,{rain,irrigation,demand,depletion}) {
  const input=rain+irrigation;
  const drainage=Math.max(0,storage+input-capacity), wet=Math.min(capacity,storage+input);
  const p=clamp(depletion+.04*(5-demand),.1,.8);
  const ks=Math.min(1,wet/((1-p)*capacity));
  const actualET=Math.min(wet,demand*ks), water=wet-actualET;
  return {water,drainage,actualET,ks,p,unmetDemand:demand-actualET,
    balanceError:storage+input-drainage-actualET-water};
}

export function runSoilSimulation(weather,scenario,model=MODEL) {
  try { validateScenario(scenario,model); } catch(error) { return {status:'unavailable',reason:error.message,days:[]}; }
  if(weather?.farm?.id!==scenario.location) return {status:'unavailable',reason:'Weather does not match the selected location.',days:[]};
  const start=Date.UTC(scenario.year,0,1), end=Date.UTC(scenario.year+1,0,1), offset=(start-Date.parse(weather.start))/DAY;
  const n=(end-start)/DAY, required=Object.keys(UNITS).filter(k=>k!=='GWETROOT');
  if (offset<0 || offset+n>weather.days) return {status:'unavailable',reason:'Historical year is outside the archive.',days:[]};
  const a=model.assumptions,soil=model.soils[scenario.soil],capacity=1000*(soil.fieldCapacity-soil.wiltingPoint)*a.depthM;
  const initialWater=capacity*a.initialAvailableFraction;
  let storage=initialWater;
  const days=[];
  for(let i=0;i<n;i++) {
    const k=offset+i, date=iso(start+i*DAY);
    const missing=required.filter(key=>weather.series[key]?.[k]==null);
    if(missing.length) return {status:'unavailable',reason:`Missing ${missing.join(', ')} on ${date}; no daily water trajectory can be calculated.`,days:[]};
    const v=Object.fromEntries(Object.keys(UNITS).map(key=>[key,weather.series[key][k]]));
    const et0=referenceET({tMin:v.T2M_MIN,tMax:v.T2M_MAX,rh:v.RH2M,solar:v.ALLSKY_SFC_SW_DWN,wind:v.WS2M,pressure:v.PS,latitude:weather.farm.latitude,elevation:weather.elevation_m,date});
    if(et0===null) return {status:'unavailable',reason:`Evaporation demand unavailable on ${date}.`,days:[]};
    const coefficients=dailyCoefficients(date,scenario,model), irrigation=coefficients.active?scenario.irrigation/7:0;
    const demand=et0*coefficients.kc;
    const flux=bucketStep(storage,capacity,{rain:v.PRECTOTCORR,irrigation,demand,depletion:coefficients.depletion});
    days.push({date,...flux,...coefficients,rain:v.PRECTOTCORR,irrigation,et0,demand,
      availablePercent:100*flux.water/capacity,volumetric:soil.wiltingPoint+flux.water/(1000*a.depthM),
      exposedRain:v.PRECTOTCORR*coefficients.exposedFraction,nasaWetness:v.GWETROOT,
      tMin:v.T2M_MIN,tMax:v.T2M_MAX,rh:v.RH2M,solar:v.ALLSKY_SFC_SW_DWN,wind:v.WS2M,pressure:v.PS,
      dry:coefficients.active&&flux.water<(1-flux.p)*capacity});
    storage=flux.water;
  }
  const sum=key=>days.reduce((s,d)=>s+d[key],0);
  return {status:'ready',modelVersion:model.version,scenario:{...scenario},weatherFingerprint:weather.fingerprint,
    weatherKey:JSON.stringify([weather.farm.id,weather.start,weather.end,weather.elevation_m,weather.series]),
    capacity,initialWater,days,summary:{meanAvailablePercent:sum('availablePercent')/n,finalWater:storage,
      rain:sum('rain'),irrigation:sum('irrigation'),et0:sum('et0'),demand:sum('demand'),actualET:sum('actualET'),drainage:sum('drainage'),unmetDemand:sum('unmetDemand'),exposedRain:sum('exposedRain'),
      dryDays:days.filter(d=>d.dry).length,coldDays:days.filter(d=>d.tMin<=0).length,
      massBalanceError:initialWater+sum('rain')+sum('irrigation')-sum('actualET')-sum('drainage')-storage}};
}
export function compareSoil(before,after) {
  if(before?.status!=='ready'||after?.status!=='ready') throw new Error('Both scenarios need complete weather and supported parameters.');
  if(before.weatherFingerprint!==after.weatherFingerprint || before.weatherKey!==after.weatherKey || before.scenario.year!==after.scenario.year || before.scenario.location!==after.scenario.location || before.modelVersion!==after.modelVersion) throw new Error('Compare scenarios using the same historical weather, year, location and model.');
  return ['meanAvailablePercent','dryDays','exposedRain','irrigation','drainage','actualET'].map(key=>({key,before:before.summary[key],after:after.summary[key],delta:after.summary[key]-before.summary[key]}));
}
