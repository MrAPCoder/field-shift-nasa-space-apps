import { managementIssues } from './management.js';
/** Deterministic comparative heuristics, not predictions. See docs/METHODS.md. */
const keys = ['water', 'soil', 'erosion', 'income'];
const clamp = n => Math.max(0, Math.min(100, n));
const unavailable = (...reasons) => ({ status: 'NOT_SCORED', value: null, reasons: reasons.flat(), evidence: {} });
const scored = (value, evidence) => Number.isFinite(value)
  ? { status: 'SCORED', value: clamp(value), reasons: [], evidence }
  : unavailable('The calculation is not finite; check input values and coefficients.');
const sourced = urls => Array.isArray(urls) && urls.length > 0 && urls.every(url => typeof url === 'string' && url.startsWith('https://'));

export function demonstrationApproved(rotation) {
  return rotation?.sequence_status === 'sourced' && rotation?.sequence_approval?.status === 'approved' && rotation.sequence_approval.scope === 'research_demonstration_only';
}
function rotationIssues(rotation) {
  const issues = [];
  if (!rotation || rotation.verified !== true && !demonstrationApproved(rotation)) issues.push('Rotation is awaiting team approval.');
  if (!sourced(rotation?.source_urls)) issues.push('Rotation source evidence is missing.');
  if (!Array.isArray(rotation?.years) || rotation.years.length !== 3 || rotation.years.some((year, i) => year.year !== i + 1 || !Array.isArray(year.crop_ids) || !year.crop_ids.length)) issues.push('An explicit three-year crop sequence is required.');
  return issues;
}
function cropIssues(crops, fields) {
  return crops.flatMap(crop => {
    if (!crop) return ['A crop definition is missing.'];
    const issues = crop.verified === true ? [] : [`${crop.name}: awaiting team approval.`];
    fields.forEach(field => { if (!sourced(crop.trait_sources?.[field])) issues.push(`${crop.name}: ${field} source evidence is missing.`); });
    return issues;
  });
}
function cropList(rotation, library) {
  return [...new Set(rotation.years.flatMap(year => year.crop_ids))].map(id => library.find(crop => crop.id === id));
}
function rainNormals(climate) {
  if (!Array.isArray(climate?.monthly) || climate.monthly.length !== 12) return null;
  if (climate.monthly.some((row, i) => row.month !== i + 1 || !Number.isFinite(row.rainfall_normal_mm) || row.rainfall_normal_mm < 0 || !Number.isInteger(row.rainfall_valid_years) || row.rainfall_valid_years <= 0)) return null;
  return climate.monthly.map(row => row.rainfall_normal_mm);
}
function scheduleIssues(schedule) {
  if (!Array.isArray(schedule) || schedule.length !== 36) return ['Exactly 36 unique year/month cover records are required.'];
  const ids = new Set();
  for (const row of schedule) {
    if (!Number.isInteger(row.year) || row.year < 1 || row.year > 3 || !Number.isInteger(row.month) || row.month < 1 || row.month > 12) return ['Invalid schedule year or month.'];
    ids.add(`${row.year}-${row.month}`);
    if (!['cash', 'cover', 'bare'].includes(row.status)) return ['Monthly cover status is unknown or invalid.'];
    if (row.verified !== true || !sourced([row.source_url])) return ['Monthly cover records need sources and team approval.'];
  }
  return ids.size === 36 ? [] : ['Duplicate or missing schedule months.'];
}

export function scoreWater(rotation, library, climate, config) {
  const issues = rotationIssues(rotation);
  if (issues.length) return unavailable(issues);
  if (rotation.years.some(year => year.crop_ids.length !== 1)) return unavailable('Multiple crops per year require an approved water-demand weighting; no equal-share assumption is made.');
  const crops = cropList(rotation, library);
  const missing = cropIssues(crops, ['water_need']);
  if (missing.length) return unavailable(missing);
  if (crops.some(crop => !['low', 'med', 'high'].includes(crop.water_need))) return unavailable('A crop water-need category is unknown.');
  const rain = rainNormals(climate);
  if (!rain || rain.reduce((a,b) => a+b,0) <= 0) return unavailable('All 12 rainfall normals and a positive annual total are required.');
  const summer = config?.summerMonths;
  const mapping = config?.waterDemandIndex;
  if (!Array.isArray(summer) || !summer.length || new Set(summer).size !== summer.length || summer.some(m => !Number.isInteger(m) || m < 1 || m > 12)
    || !mapping || ['low','med','high'].some(k => !Number.isFinite(mapping[k]) || mapping[k] < 0 || mapping[k] > 1)
    || !(mapping.low <= mapping.med && mapping.med <= mapping.high)) return unavailable('Invalid water-scoring configuration.');
  const summerRain = summer.reduce((total,m) => total + rain[m-1],0);
  const annualRain = rain.reduce((a,b) => a+b,0);
  // Equal weighting of one documented crop per year; no irrigation volumes implied.
  const demand = rotation.years.reduce((sum,year) => sum + mapping[library.find(crop => crop.id === year.crop_ids[0]).water_need],0)/3;
  const summerShare = summerRain / annualRain;
  return scored(100 * (1 - demand * (1 - summerShare)), { summerRainMm: summerRain, annualRainMm: annualRain, summerShare, demandIndex: demand });
}

export function scoreSoil(rotation, library, config) {
  const issues = rotationIssues(rotation);
  if (issues.length) return unavailable(issues);
  const schedule = scheduleIssues(rotation.schedule);
  if (schedule.length) return unavailable(schedule);
  const crops = cropList(rotation, library);
  const missing = cropIssues(crops, ['nitrogen_fixing', 'root_depth']);
  if (missing.length) return unavailable(missing);
  if (crops.some(crop => typeof crop.nitrogen_fixing !== 'boolean' || !['shallow','deep'].includes(crop.root_depth))) return unavailable('Nitrogen-fixation or rooting-depth traits are unknown.');
  const weights = config?.soilWeights;
  const components = {
    legume: crops.some(crop => crop.nitrogen_fixing) ? 1 : 0,
    cover: rotation.schedule.filter(row => row.status === 'cover').length / 36,
    rootDiversity: new Set(crops.map(crop => crop.root_depth)).size === 2 ? 1 : 0,
    nonBare: 1 - rotation.schedule.filter(row => row.status === 'bare').length / 36,
  };
  if (!weights || Object.keys(components).some(key => !Number.isFinite(weights[key]) || weights[key] < 0)) return unavailable('Invalid soil-scoring configuration.');
  const denominator = Object.keys(components).reduce((sum,key) => sum + weights[key],0);
  if (!denominator) return unavailable('Soil component weights are all zero.');
  return scored(100 * Object.keys(components).reduce((sum,key) => sum + weights[key]*components[key],0)/denominator, { components, weights: { ...weights } });
}

export function scoreErosion(rotation, climate, management) {
  const issues = rotationIssues(rotation);
  if (issues.length) return unavailable(issues);
  if (climate?.farm?.id !== rotation.farm_id) return unavailable('Climate location does not match the rotation.');
  const schedule = management === undefined ? scheduleIssues(rotation.schedule) : managementIssues(management, rotation.id);
  if (schedule.length) return unavailable(schedule);
  const rain = rainNormals(climate);
  if (!rain || rain.reduce((a,b) => a+b,0) <= 0) return unavailable('All 12 rainfall normals and a positive annual total are required.');
  const annual = rain.reduce((a,b) => a+b,0);
  const exposed = management === undefined
    ? rotation.schedule.filter(row => row.status === 'bare').reduce((sum,row) => sum + rain[row.month-1],0)
    : management.months.reduce((sum,row) => sum + rain[row.month-1] * row.exposed_percent / 100,0);
  const fraction = exposed / (3 * annual);
  return scored(100 * (1 - fraction), { rainExposureFraction: fraction, exposedRainMmOverThreeYears: exposed, annualRainMm: annual, sourceKind: management ? 'farmer_input' : 'published_schedule', mode: management?.mode ?? 'published', method: management?.method ?? 'binary-bare-months' });
}

export function weightedTotal(scores, priorities) {
  if (keys.some(key => !Number.isFinite(priorities?.[key]) || priorities[key] < 0 || priorities[key] > 10)) return unavailable('Priority weights must be numbers from 0 through 10.');
  let numerator = 0, denominator = 0;
  const included = [], excluded = [];
  for (const key of keys) {
    const score = scores[key];
    // Income is never eligible, even if supplied an accidental numeric value.
    if (key !== 'income' && score?.status === 'SCORED' && Number.isFinite(score.value) && score.value >= 0 && score.value <= 100 && priorities[key] > 0) {
      numerator += score.value * priorities[key]; denominator += priorities[key]; included.push(key);
    } else if (priorities[key] > 0) excluded.push(key);
  }
  if (!denominator) return { ...unavailable('No scored priority has a positive weight.'), evidence: { included, excluded, denominator } };
  return scored(numerator / denominator, { included, excluded, denominator });
}
export function scoreRotation(rotation, library, climate, priorities, config, management) {
  const mismatch = climate?.farm?.id !== rotation?.farm_id;
  const scores = {
    water: mismatch ? unavailable('Climate location does not match the rotation.') : scoreWater(rotation, library, climate, config),
    soil: scoreSoil(rotation, library, config),
    erosion: mismatch ? unavailable('Climate location does not match the rotation.') : scoreErosion(rotation, climate, management),
    income: unavailable('Not scored yet — crop prices and production costs are not included.'),
  };
  return { scores, total: weightedTotal(scores, priorities) };
}
