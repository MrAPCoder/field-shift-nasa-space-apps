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
