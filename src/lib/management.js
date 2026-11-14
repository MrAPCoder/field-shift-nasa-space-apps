// Farmer statements are separate from independently reviewed agricultural evidence.
export const EXPOSURE_METHOD = 'monthly-exposed-soil-v1';
export function emptyManagement(rotationId) {
  return { rotation_id: rotationId, source_kind: 'farmer_input', mode: 'proposed', confirmed: false,
    method: EXPOSURE_METHOD, context: '', confirmed_by: '', confirmed_at: null,
    months: Array.from({ length: 36 }, (_, i) => ({ year: Math.floor(i / 12) + 1, month: i % 12 + 1, status: 'unknown', exposed_percent: null })) };
}
export function managementIssues(input, rotationId, requireConfirmation = true) {
  const issues = [];
  if (!input || input.rotation_id !== rotationId || input.source_kind !== 'farmer_input' || input.method !== EXPOSURE_METHOD)
    return ['Farmer calendar provenance or rotation does not match.'];
  if (!['observed', 'proposed'].includes(input.mode)) issues.push('Choose observed management or a proposed scenario.');
  if (typeof input.context !== 'string' || !input.context.trim() || typeof input.confirmed_by !== 'string' || !input.confirmed_by.trim()) issues.push('Enter a field/period or scenario description and confirmer name.');
  if (requireConfirmation && (input.confirmed !== true || typeof input.confirmed_at !== 'string' || !Number.isFinite(Date.parse(input.confirmed_at)))) issues.push('Confirm the complete farmer calendar before calculating.');
  if (!Array.isArray(input.months) || input.months.length !== 36) return [...issues, 'Exactly 36 monthly entries are required.'];
  const ids = new Set();
  for (const row of input.months) {
    if (!row || !Number.isInteger(row.year) || row.year < 1 || row.year > 3 || !Number.isInteger(row.month) || row.month < 1 || row.month > 12) return [...issues, 'Invalid year or month.'];
    ids.add(`${row.year}-${row.month}`);
    if (!['cash', 'cover', 'bare'].includes(row.status)) issues.push('Every month needs an explicit management status; Unknown is not bare.');
    if (!Number.isFinite(row.exposed_percent) || row.exposed_percent < 0 || row.exposed_percent > 100) issues.push('Every month needs an explicit exposed-soil percentage from 0 to 100.');
    if (row.status === 'bare' && row.exposed_percent !== 100) issues.push('Bare soil means 100% exposed; retain crop/cover status when protective residue remains.');
  }
  if (ids.size !== 36) issues.push('Duplicate or missing calendar months.');
  return [...new Set(issues)];
}
export function editManagement(input, patch) {
  return { ...input, ...patch, confirmed: false, confirmed_at: null };
}

// Bulk edits copy only explicit user inputs. They never confirm a calendar.
export function rangeEdit(input, start, end, status, exposure) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 35 || end < start)
    throw new Error('Choose an ordered range within the 36 months.');
  if (!['unknown', 'cash', 'cover', 'bare'].includes(status)) throw new Error('Choose a valid status.');
  const exposed_percent = status === 'unknown' ? null : status === 'bare' ? 100 : exposure;
  if (status !== 'unknown' && (!Number.isFinite(exposed_percent) || exposed_percent < 0 || exposed_percent > 100))
    throw new Error('Enter an explicit exposure from 0 to 100.');
  return editManagement(input, { months: input.months.map(row => {
    const index = (row.year - 1) * 12 + row.month - 1;
    return index >= start && index <= end ? { ...row, status, exposed_percent } : { ...row };
  }) });
}
export function copyYear(input, fromYear, toYear) {
  if (![1,2,3].includes(fromYear) || ![1,2,3].includes(toYear) || fromYear === toYear)
    throw new Error('Choose two different years.');
  const source = input.months.filter(row=>row.year===fromYear);
  if (source.length !== 12 || new Set(source.map(row=>row.month)).size !== 12)
    throw new Error('Source year is incomplete.');
  return editManagement(input, { months: input.months.map(row => {
    if (row.year !== toYear) return { ...row };
    const match = source.find(item=>item.month===row.month);
    if (!match) throw new Error('Source month missing.');
    return { ...row, status: match.status, exposed_percent: match.exposed_percent };
  }) });
}
