// Maps ONE calculated daily model record to the parameters the farm illustration draws.
// Nothing here simulates anything: every value is read from runSoilSimulation output or the
// scenario/config, then scaled with the documented, fixed rules below (see docs/METHODS.md).
import { MODEL, seasonProgress } from './soilWater.js';

// Flow arrows: width is linear in millimetres of water on that day, in SVG viewBox units.
// Any non-zero flow is drawn at least minPx wide so it stays visible; flows above capMm are
// drawn at the cap and labelled with their real value. Zero flow draws nothing.
export const FLOW_SCALE = Object.freeze({ pxPerMm: 3, minPx: 3, capMm: 20 });
export function flowWidth(mm) {
  if (typeof mm !== 'number' || !Number.isFinite(mm) || mm <= 0) return 0;
  return Math.max(FLOW_SCALE.minPx, Math.min(mm, FLOW_SCALE.capMm) * FLOW_SCALE.pxPerMm);
}

// Precipitation intensity classes for the falling-drop marks (NASA POWER daily total, mm/day).
export const RAIN_CLASSES = Object.freeze([
  { id: 'none', upTo: 0, drops: 0, label: 'No precipitation' },
  { id: 'trace', upTo: 1, drops: 5, label: 'Trace, under 1 mm' },
  { id: 'light', upTo: 5, drops: 12, label: 'Light, 1–5 mm' },
  { id: 'moderate', upTo: 15, drops: 22, label: 'Moderate, 5–15 mm' },
  { id: 'heavy', upTo: Infinity, drops: 36, label: 'Heavy, 15 mm or more' },
]);
export function rainClass(mm) {
  if (typeof mm !== 'number' || !Number.isFinite(mm)) return null;
  if (mm <= 0) return RAIN_CLASSES[0];
  return RAIN_CLASSES.find((c, i) => i > 0 && mm < c.upTo) ?? RAIN_CLASSES.at(-1);
}

// Soil colour: linear blend from a dry to a moist tone of the generic texture, by the day's
// calculated plant-available percentage. The whole layer gets ONE colour because the model is
// one well-mixed store; no depth-resolved wetting front is computed.
const TONES = {
  sandy: { dry: [222, 196, 150], wet: [128, 96, 62] },
  loamy: { dry: [196, 160, 116], wet: [84, 58, 38] },
  clay: { dry: [186, 160, 132], wet: [92, 70, 58] },
};
export function soilTone(percent, soil) {
  const tone = TONES[soil];
  if (!tone || typeof percent !== 'number' || !Number.isFinite(percent)) return null;
  const t = Math.min(1, Math.max(0, percent / 100));
  const rgb = tone.dry.map((d, i) => Math.round(d + (tone.wet[i] - d) * t));
  return `rgb(${rgb.join(',')})`;
}

// Illustrated crop stage follows the ASSUMED calendar position (stage fractions of the chosen
// season), the same schedule that sets the crop coefficient. It is not simulated growth.
export const STAGE_LABELS = { initial: 'Initial', development: 'Crop development', mid: 'Mid-season', late: 'Late season' };
export function cropStage(progress, fractions = MODEL.assumptions.stageFractions) {
  if (progress === null || progress === undefined || !Number.isFinite(progress)) return null;
  const [f0, f1, f2] = fractions, p = Math.min(1, Math.max(0, progress));
  let id, size, senescence = 0;
  if (p <= f0) { id = 'initial'; size = .14 + .14 * (f0 ? p / f0 : 1); }
  else if (p < f0 + f1) { id = 'development'; size = .28 + .72 * (p - f0) / f1; }
  else if (p <= f0 + f1 + f2) { id = 'mid'; size = 1; }
  else { id = 'late'; size = 1; senescence = (p - f0 - f1 - f2) / fractions[3]; }
  return { id, label: STAGE_LABELS[id], size, senescence: Math.min(1, senescence) };
}

const fmt = (v, d = 1) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
// Millimetre label: exact zero stays 0.0; tiny non-zero values say "<0.1" instead of a misleading 0.0.
export function mm(v) { return v > 0 && v < .05 ? '<0.1' : fmt(Math.abs(v)); }

// One plain-English sentence describing why storage changed on this day.
export function explainDay(day, previousWater) {
  const input = day.rain + day.irrigation, change = day.water - previousWater;
  if (day.freezing && day.rain > 0) return `${fmt(day.rain)} mm of precipitation fell on a freezing day (low ${fmt(day.tMin)} °C). It may have been snow, but the model adds it to the soil immediately: snow and frozen ground are not modeled.`;
  if (day.drainage > 0) return `${fmt(input)} mm of water came in and filled the soil store, so ${fmt(day.drainage)} mm drained below the modeled layer.`;
  if (day.ks < 1 && day.demand - day.actualET >= .05) return `Soil water is limiting: today’s weather could pull ${fmt(day.demand)} mm from this ${day.active ? 'crop' : 'field'}, but the drier soil supplied only ${fmt(day.actualET)} mm.`;
  if (change >= .05) return `Water in (${fmt(input)} mm) was more than water used (${fmt(day.actualET)} mm), so stored water rose ${fmt(change)} mm.`;
  if (change <= -.05) return `${input > 0 ? `Only ${fmt(input)} mm came in, while` : 'No water came in, and'} ${fmt(day.actualET)} mm was used, so stored water fell ${fmt(-change)} mm.`;
  return 'Water in and water used were nearly equal; stored water changed by less than 0.1 mm.';
}

// Every number the scene draws for result.days[index].
export function sceneFrame(result, index, startup = null) {
  if (result?.status !== 'ready' || !Number.isInteger(index) || index < 0 || index >= result.days.length) return null;
  const day = result.days[index], s = result.scenario;
  const previousWater = index === 0 ? result.initialWater : result.days[index - 1].water;
  // Same assumed-calendar rule the model used for this day's crop coefficient.
  const progress = day.active ? seasonProgress(day.date, s.planting, s.harvest) : null;
  return {
    date: day.date, index, day,
    percent: day.availablePercent, water: day.water, capacity: result.capacity,
    // Crop stress line: the model's depletion threshold, (1 − p) of capacity, crop season only.
    thresholdPercent: day.active ? 100 * (1 - day.p) : null,
    change: day.water - previousWater, previousWater,
    soil: s.soil, soilColor: soilTone(day.availablePercent, s.soil),
    flows: { rain: day.rain, irrigation: day.irrigation, demand: day.demand, actualET: day.actualET, drainage: day.drainage },
    // Demand outline is drawn only when the soil supplied visibly less than the weather demanded.
    waterLimited: day.demand - day.actualET >= .05,
    widths: { rain: flowWidth(day.rain), irrigation: flowWidth(day.irrigation), demand: flowWidth(day.demand), actualET: flowWidth(day.actualET), drainage: flowWidth(day.drainage) },
    rainClass: rainClass(day.rain),
    freezing: day.freezing, freezingPrecip: day.freezing && day.rain > 0,
    crop: s.crop, stage: day.active ? cropStage(progress) : null,
    cover: { kind: day.active ? 'crop' : s.cover, residue: s.cover === 'residue', exposedPercent: 100 * day.exposedFraction },
    solarLevel: Math.min(1, Math.max(0, day.solar / 30)),
    explanation: explainDay(day, previousWater),
    startupActive: !!startup && startup.status === 'ready' && (startup.index === null || index < startup.index),
  };
}
