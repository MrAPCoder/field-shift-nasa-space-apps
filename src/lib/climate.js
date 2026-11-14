export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatValue = (value, digits = 1) => Number.isFinite(value)
  ? new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
  : 'Unavailable';
const optionalNumber = (value, min = 0, max = Infinity) => value === null || (Number.isFinite(value) && value >= min && value <= max);

export function validateClimate(data, farm) {
  const fail = () => { throw new Error('The saved climate file is incomplete or does not match this location.'); };
  if (data?.schema_version !== 1 || data?.farm?.id !== farm.id || data.farm.latitude !== farm.latitude || data.farm.longitude !== farm.longitude) fail();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.period?.start) || !/^\d{4}-\d{2}-\d{2}$/.test(data.period?.end)) fail();
  if (data.units?.PRECTOTCORR !== 'mm/day' || data.units?.GWETROOT !== '1' || !Number.isFinite(data.thresholds?.hot_day_c)) fail();
  if (!Array.isArray(data.annual) || !data.annual.length || !Number.isFinite(data.thresholds.frost_day_c)) fail();
  if (!Array.isArray(data.monthly) || data.monthly.length !== 12) fail();
  data.monthly.forEach((month, i) => {
    if (month.month !== i + 1 || !optionalNumber(month.rainfall_normal_mm) || !optionalNumber(month.gwetroot_mean, 0, 1)
      || !Number.isInteger(month.rainfall_valid_years) || month.rainfall_valid_years < 0
      || !Number.isInteger(month.gwetroot_expected_days) || month.gwetroot_expected_days <= 0
      || !Number.isInteger(month.gwetroot_valid_days) || month.gwetroot_valid_days < 0 || month.gwetroot_valid_days > month.gwetroot_expected_days) fail();
  });
  for (const key of ['rainfall_mm', 'frost_free_days', 'hot_days']) {
    if (!optionalNumber(data.summary?.[`mean_${key}`]) || !Number.isInteger(data.summary?.[`${key}_valid_years`]) || data.summary[`${key}_valid_years`] < 0) fail();
  }
  const coverage = data.coverage?.GWETROOT;
  if (!coverage || !Number.isFinite(coverage.percent) || coverage.percent < 0 || coverage.percent > 100
    || !Number.isInteger(coverage.valid_days) || !Number.isInteger(coverage.expected_days) || coverage.expected_days <= 0
    || coverage.valid_days < 0 || coverage.valid_days > coverage.expected_days) fail();
  return data;
}

export async function loadClimate(farm, { signal, fetcher = fetch } = {}) {
  const response = await fetcher(`${import.meta.env?.BASE_URL ?? '/'}data/${farm.id}/climate.json`, { signal });
  if (!response.ok) throw new Error('The saved climate file could not be loaded. Please try again.');
  return validateClimate(await response.json(), farm);
}

export function chartRows(data) {
  return data.monthly.map(month => ({ ...month, name: MONTHS[month.month - 1] }));
}
