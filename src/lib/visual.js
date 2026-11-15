import { monthSpan } from './replay.js';

// Complete-month aggregation only. Missing weather is never rendered as zero.
export function visualMonth(replay, plan, startYear, index) {
  const month = plan.months[index];
  const year = startYear + Math.floor(index / 12);
  const span = monthSpan(replay, year, month.month);
  const values = key => replay.series[key].slice(span.start, span.end);
  const aggregate = (key, mean = false) => {
    const data = values(key);
    return data.some(v => v === null) ? null : data.reduce((a, b) => a + b, 0) / (mean ? data.length : 1);
  };
  const rain = aggregate('PRECTOTCORR');
  return { ...month, year, rain, temperature: aggregate('T2M_MAX', true),
    protection: month.exposedPercent === null ? null : 100 - month.exposedPercent,
    exposedRain: rain === null || month.exposedPercent === null ? null : rain * month.exposedPercent / 100 };
}
export function meanExposure(simulation) {
  const valid = simulation.runs.filter(run => run.exposed.valid);
  return valid.length ? valid.reduce((sum, run) => sum + run.exposed.exposedMm / run.exposed.totalMm * 100, 0) / valid.length : null;
}
