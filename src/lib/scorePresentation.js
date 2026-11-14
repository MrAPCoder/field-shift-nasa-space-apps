// Presentation only. Scoring arithmetic and coefficients live unchanged in score.js/config.
export const SCORE_LABELS = {
  water: 'Provisional water-demand comparison',
  soil: 'Provisional soil-management practice index',
  erosion: 'Rainfall-exposure index',
  income: 'Extra income',
};
export function totalDescription(result) {
  if (result.total.status !== 'SCORED') return 'No overall index is available for the selected priorities.';
  const included = result.total.evidence.included;
  if (included.length === 1 && included[0] === 'erosion') return 'Exposure-only index. Water, soil and income do not contribute; their sliders cannot change this value.';
  return `Included: ${included.map(key=>SCORE_LABELS[key]).join(', ')}. Compare only results with the same included metrics and input basis.`;
}
