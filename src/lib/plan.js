import { MONTHS } from './climate.js';
// A display convention, not a validated agronomic danger threshold.
export const HIGH_RAIN_RANK = 3;
export const STATUS_LABELS = { cash: 'Planted cash crop', cover: 'Cover crop', bare: 'Bare soil', unknown: 'Unknown / incomplete' };
export const DISCLAIMER = "This tool supports farm planning but does not replace agricultural experts, field measurements, soil testing or the farmer’s experience. Research scenarios are not farm recommendations. Historical climate is not a forecast; exposure is not measured erosion or erosion reduction.";
export function calendarRows(climate, management) {
  const normals = climate?.monthly ?? [];
  const validRain = row => Number.isFinite(row?.rainfall_normal_mm) && row.rainfall_normal_mm >= 0 && row.rainfall_valid_years > 0;
  const completeRain = normals.length === 12 && normals.every((r,i) => r.month === i+1 && validRain(r));
  const threshold = completeRain ? [...normals].map(r=>r.rainfall_normal_mm).sort((a,b)=>b-a)[HIGH_RAIN_RANK-1] : null;
  return Array.from({length:36}, (_,i) => {
    const year=Math.floor(i/12)+1, month=i%12+1;
    const matches=(management?.months ?? []).filter(r=>r?.year===year&&r?.month===month);
    const input=matches.length===1 ? matches[0] : null;
    const status=Object.hasOwn(STATUS_LABELS,input?.status) ? input.status : 'unknown';
    const known=status!=='unknown' && Number.isFinite(input?.exposed_percent) && input.exposed_percent>=0 && input.exposed_percent<=100 && (status!=='bare'||input.exposed_percent===100);
    const rain=normals.find(r=>r.month===month);
    const rainfall=validRain(rain) ? rain.rainfall_normal_mm : null;
    const highRain=threshold!==null && rainfall>0 && rainfall>=threshold;
    return {year,month,status,known,exposedPercent:known?input.exposed_percent:null,rainfall,highRain,highlight:highRain&&known&&input.exposed_percent>0};
  });
}
export function knownMonthNames(months) {
  if (!Array.isArray(months) || !months.length || months.some(m=>!Number.isInteger(m)||m<1||m>12)) return 'Unknown — not supplied by approved evidence';
  return [...new Set(months)].map(m=>MONTHS[m-1]).join(', ');
}
