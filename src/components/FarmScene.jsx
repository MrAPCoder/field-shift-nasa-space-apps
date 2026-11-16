import React from 'react';
import { MODEL } from '../lib/soilWater.js';
import { FLOW_SCALE } from '../lib/scene.js';

// Schematic illustration of ONE calculated model day (see lib/scene.js#sceneFrame).
// Geometry is fixed; only what the frame says changes. It is not an observed field.
// Numbers are shown in the readout beneath the scene, keyed by the same colours.
const W = 960, H = 520, SURFACE = 196, LAYER_TOP = 200, LAYER_BOTTOM = 440, FIELD = 800;
const LAYER = LAYER_BOTTOM - LAYER_TOP;
const PLANTS = [80, 205, 330, 455, 580, 705];
export const FLOW_COLORS = { rain: '#2f6f9f', irrigation: '#5aa3cf', et: '#8a8455', drainage: '#1d4766', stress: '#b7791f' };
const mix = (a, b, t) => {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  return `rgb(${p(a).map((v, i) => Math.round(v + (p(b)[i] - v) * t)).join(',')})`;
};
const n1 = v => v.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
// Deterministic pseudo-random layout so a given day always draws identically.
const jitter = i => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
const STROKE = 2;

function Wheat({ x, size, senescence, stage }) {
  const leaf = mix('#557a3a', '#c2a24f', senescence), head = mix('#7d9440', '#d1b05a', senescence), h = 140 * size;
  const stems = [[-14, .86], [-5, 1], [5, .96], [14, .84]];
  return <g className="plant wheat" strokeLinecap="round" fill="none">
    {stems.map(([dx, k], j) => <path key={j} d={`M${x},${SURFACE} C${x + dx * .2},${SURFACE - h * k * .5} ${x + dx * .7 * size},${SURFACE - h * k * .8} ${x + dx * size},${SURFACE - h * k}`} stroke={leaf} strokeWidth={STROKE}/>)}
    {[[-1, .35], [1, .45], [-1, .58]].map(([side, k], j) => <path key={`l${j}`} d={`M${x},${SURFACE - h * k} q${side * 16 * size},${-6 * size} ${side * 30 * size},${4 * size}`} stroke={leaf} strokeWidth={STROKE}/>)}
    {(stage === 'mid' || stage === 'late') && stems.map(([dx, k], j) =>
      <path key={`h${j}`} d={`M${x + dx * size},${SURFACE - h * k} l${dx * .15},-16`} stroke={head} strokeWidth="5.5"/>)}
  </g>;
}
function Pea({ x, size, senescence, stage }) {
  const c = mix('#4d8040', '#b29c56', senescence), h = 105 * size, nodes = Math.max(2, Math.round(5 * size));
  return <g className="plant pea" strokeLinecap="round">
    <path d={`M${x},${SURFACE} C${x - 8},${SURFACE - h * .35} ${x + 8},${SURFACE - h * .7} ${x},${SURFACE - h}`} stroke={c} strokeWidth={STROKE} fill="none"/>
    {Array.from({ length: nodes }, (_, j) => { const y = SURFACE - h * (j + 1) / (nodes + .6), r = 5 + 4 * size, s = j % 2 ? 1 : -1;
      return <g key={j}><path d={`M${x},${y} q${s * r},${-r * .9} ${s * r * 2},0 q${-s * r},${r * .7} ${-s * r * 2},0Z`} fill={c}/>
        {(stage === 'mid' || stage === 'late') && j % 2 === 1 && <path d={`M${x - s * 2},${y + 4} l${-s * 4},14`} stroke={mix('#6c9a4a', '#c4ab66', senescence)} strokeWidth="4"/>}</g>; })}
    <path d={`M${x},${SURFACE - h} q7,-8 11,-1`} stroke={c} strokeWidth="1.5" fill="none"/>
  </g>;
}
function Potato({ x, size, senescence, stage }) {
  const c = mix('#3f7537', '#a39b4f', senescence), h = 85 * size, r = 7 + 8 * size;
  const leaves = [[0, 1], [-.6, .74], [.6, .74], [-.9, .42], [.9, .42]];
  return <g className="plant potato" strokeLinecap="round">
    <path d={`M${x - 34 * Math.max(.5, size)},${SURFACE} q${34 * Math.max(.5, size)},-9 ${68 * Math.max(.5, size)},0`} fill="rgba(80,58,38,.28)"/>
    {leaves.map(([dx, k], j) => <g key={j}><path d={`M${x},${SURFACE} Q${x + dx * 18 * size},${SURFACE - h * k * .6} ${x + dx * 38 * size},${SURFACE - h * k}`} stroke={c} strokeWidth={STROKE} fill="none"/>
      <ellipse cx={x + dx * 38 * size} cy={SURFACE - h * k} rx={r} ry={r * .62} fill={c}/></g>)}
    {stage === 'mid' && [-.35, .15, .5].map((dx, j) => <circle key={j} cx={x + dx * 38 * size} cy={SURFACE - h - 8 + j * 3} r="3" fill="#f4f1ea" stroke="#b9aecb" strokeWidth="1"/>)}
  </g>;
}
const CROPS = { spring_wheat: Wheat, spring_pea: Pea, potato: Potato };

// A slim flow arrow: width linear in mm (lib/scene.js#flowWidth), rounded head, optional outline.
function Arrow({ x, y1, y2, width, color, outline = false, dashed = false, name }) {
  if (!width) return null;
  const up = y2 < y1, head = Math.min(14, width + 6), base = up ? y2 + head : y2 - head, hw = Math.max(width / 2 + 4, width * .9);
  const d = `M${x - width / 2},${y1} L${x - width / 2},${base} L${x - hw},${base} L${x},${y2} L${x + hw},${base} L${x + width / 2},${base} L${x + width / 2},${y1} Z`;
  return <g className={`flow flow-${name}`} data-width={width.toFixed(3)}>
    <path d={d} fill={outline ? 'none' : color} stroke={color} strokeWidth={outline ? 1.6 : 0} strokeDasharray={dashed ? '5 4' : undefined} strokeLinejoin="round" opacity={outline ? .95 : .9}/>
  </g>;
}

function statusOf(frame) {
  const d = frame.day;
  if (d.drainage > 0) return { id: 'full', text: 'Soil store full · excess drains', color: FLOW_COLORS.drainage };
  if (d.active && d.dry) return { id: 'stress', text: 'Crop water stress', color: FLOW_COLORS.stress };
  if (d.active) return { id: 'ok', text: 'Crop using water freely', color: '#2f5a43' };
  return { id: 'off', text: 'Between crops', color: '#6f776d' };
}

export default function FarmScene({ frame, ghostPercent = null, ghostLabel = 'Before', animate = false }) {
  const { day, widths, flows } = frame, Crop = CROPS[frame.crop], status = statusOf(frame);
  const skyTop = mix('#c9cdc8', '#9cc4dd', frame.solarLevel), skyBottom = mix('#e2e2da', '#e3edf0', frame.solarLevel);
  const drops = frame.rainClass?.drops ?? 0, coverFraction = MODEL.assumptions.residueCoverFraction;
  const gaugeY = p => LAYER_BOTTOM - LAYER * p / 100;
  const summary = `${day.date}: calculated available soil water ${n1(frame.percent)} percent. NASA precipitation ${n1(flows.rain)} millimetres, irrigation ${n1(flows.irrigation)}, calculated water use ${n1(flows.actualET)} of ${n1(flows.demand)} demanded, drainage ${n1(flows.drainage)}. ${status.text}.`;
  return <svg className={`farm-scene${animate ? ' is-animated' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}
    data-testid="farm-scene" data-date={day.date} data-available-percent={frame.percent.toFixed(3)} data-rain={flows.rain} data-irrigation={flows.irrigation.toFixed(4)}
    data-actual-et={flows.actualET.toFixed(4)} data-demand={flows.demand.toFixed(4)} data-drainage={flows.drainage.toFixed(4)} data-rain-class={frame.rainClass.id}
    data-overflow={String(flows.drainage > 0)} data-status={status.id} data-stage={frame.stage?.id ?? 'off-season'} data-cover={frame.cover.kind} data-freezing={String(frame.freezing)} data-soil-color={frame.soilColor}>
    <defs>
      <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={skyTop}/><stop offset="1" stopColor={skyBottom}/></linearGradient>
      <pattern id="tex-sandy" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1.3" fill="rgba(255,255,255,.28)"/><circle cx="10" cy="10" r="1.1" fill="rgba(0,0,0,.12)"/><circle cx="8" cy="3" r=".8" fill="rgba(0,0,0,.08)"/></pattern>
      <pattern id="tex-loamy" width="18" height="16" patternUnits="userSpaceOnUse"><circle cx="4" cy="5" r=".9" fill="rgba(255,255,255,.2)"/><circle cx="13" cy="11" r="1.1" fill="rgba(0,0,0,.12)"/><circle cx="9" cy="2" r=".6" fill="rgba(0,0,0,.1)"/></pattern>
      <pattern id="tex-clay" width="22" height="12" patternUnits="userSpaceOnUse"><path d="M2 4h7M13 9h6" stroke="rgba(0,0,0,.11)" strokeWidth="1" strokeLinecap="round"/></pattern>
      <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v7" stroke="#8b8a82" strokeWidth="1"/></pattern>
    </defs>
    <rect width={FIELD} height={SURFACE} fill="url(#sky)"/>
    <circle cx="740" cy="56" r="20" fill="#e8c46a" opacity={.15 + .85 * frame.solarLevel} data-testid="sun"/>
    {drops > 0 && <g className={`precip ${frame.freezingPrecip ? 'precip-frozen' : 'precip-liquid'}`} data-drops={drops}>
      {Array.from({ length: drops }, (_, i) => { const x = 24 + jitter(i + 1) * (FIELD - 48), y = 14 + jitter(i + 101) * 150;
        return frame.freezingPrecip ? <circle key={i} cx={x} cy={y} r="3" fill="none" stroke="#8a96a1" strokeWidth="1.2"/>
          : <path key={i} className="drop" style={{ animationDelay: `${-jitter(i + 7) * .9}s` }} d={`M${x},${y} l-2.5,10`} stroke={FLOW_COLORS.rain} strokeWidth="1.6" strokeLinecap="round"/>; })}
    </g>}
    {/* Soil-water store: one uniform colour = one well-mixed bucket. No layers or wetting front are computed. */}
    <rect x="0" y={LAYER_TOP} width={FIELD} height={LAYER} fill={frame.soilColor} className="soil-store"/>
    <rect x="0" y={LAYER_TOP} width={FIELD} height={LAYER} fill={`url(#tex-${frame.soil})`}/>
    <rect x="0" y={LAYER_BOTTOM} width={FIELD} height={H - LAYER_BOTTOM} fill="#b9b6ac"/>
    <rect x="0" y={LAYER_BOTTOM} width={FIELD} height={H - LAYER_BOTTOM} fill="url(#hatch)" opacity=".35"/>
    <line x1="0" x2={FIELD} y1={LAYER_BOTTOM} y2={LAYER_BOTTOM} stroke="rgba(31,42,36,.35)" strokeDasharray="2 5"/>
    <text className="scene-tag" x="14" y={LAYER_BOTTOM - 12}>MODELED SOIL STORE · 0.6 m · {MODEL.soils[frame.soil].label.toUpperCase()}</text>
    <text className="scene-tag dark" x="14" y={H - 14}>BELOW THE MODEL LAYER</text>
    <rect x="0" y={SURFACE - 3} width={FIELD} height="6" fill={frame.soilColor}/>
    <line x1="0" x2={FIELD} y1={SURFACE - 3} y2={SURFACE - 3} stroke="rgba(31,42,36,.25)"/>
    {frame.cover.residue && <g className="residue" data-fraction={coverFraction}>{Array.from({ length: Math.floor(FIELD / (20 / coverFraction)) }, (_, i) =>
      <path key={i} d={`M${i * 20 / coverFraction + 4},${SURFACE - 2 + (i % 3) - 1} l18,${(i % 2 ? 1 : -1) * 1.5}`} stroke="#cdb67c" strokeWidth="3" strokeLinecap="round"/>)}</g>}
    {frame.cover.kind === 'cover' && <g className="cover-crop">{Array.from({ length: 80 }, (_, i) => { const x = 5 + i * 10;
      return <path key={i} d={`M${x},${SURFACE - 2} q2,-9 ${(i % 2 ? 4 : -3)},-${13 + 6 * jitter(i)}`} stroke="#638f45" strokeWidth={STROKE} fill="none" strokeLinecap="round"/>; })}</g>}
    {frame.freezing && <rect x="0" y={SURFACE - 5} width={FIELD} height="3" fill="#f4f8fb" opacity=".9" data-testid="frost"/>}
    {/* Roots: fixed schematic shown only in the crop season; root growth is not simulated. */}
    {frame.stage && <g className="roots" opacity=".38">{PLANTS.map(x => [-16, -6, 6, 16].map((dx, j) =>
      <path key={`${x}${j}`} d={`M${x},${SURFACE + 4} q${dx},36 ${dx * 1.7},${100 - Math.abs(dx) * 2}`} stroke="#f3ead6" strokeWidth="1.2" fill="none"/>))}</g>}
    {frame.stage && Crop && PLANTS.map(x => <Crop key={x} x={x} size={frame.stage.size} senescence={frame.stage.senescence} stage={frame.stage.id}/>)}
    {flows.irrigation > 0 && <g className="drip-line"><line x1="10" x2={FIELD - 10} y1={SURFACE - 6} y2={SURFACE - 6} stroke={FLOW_COLORS.irrigation} strokeWidth="2.5"/>
      {PLANTS.map(x => <circle key={x} cx={x + 40} cy={SURFACE - 6} r="3" fill="#fff" stroke={FLOW_COLORS.irrigation} strokeWidth="1.5"/>)}</g>}
    <Arrow name="rain" x={130} y1={96} y2={LAYER_TOP + 70} width={widths.rain} color={frame.freezingPrecip ? '#8a96a1' : FLOW_COLORS.rain} outline={frame.freezingPrecip} dashed={frame.freezingPrecip}/>
    <Arrow name="irrigation" x={265} y1={SURFACE - 8} y2={LAYER_TOP + 70} width={widths.irrigation} color={FLOW_COLORS.irrigation}/>
    {frame.waterLimited && <Arrow name="demand" x={520} y1={SURFACE + 34} y2={64} width={widths.demand} color={FLOW_COLORS.stress} outline dashed/>}
    <Arrow name="et" x={520} y1={SURFACE + 34} y2={64} width={widths.actualET} color={FLOW_COLORS.et}/>
    <Arrow name="drainage" x={430} y1={LAYER_BOTTOM - 40} y2={H - 4} width={widths.drainage} color={FLOW_COLORS.drainage}/>
    {flows.drainage > 0 && <g data-testid="overflow" className="overflow">
      <rect x="0" y={LAYER_TOP} width={FIELD} height="4" fill={FLOW_COLORS.drainage} opacity=".55"/>
      <rect x="852" y={LAYER_TOP - 3} width="56" height="6" rx="2" fill={FLOW_COLORS.drainage}/>
    </g>}
    <g className="scene-status" transform="translate(14,14)">
      <rect width={status.text.length * 7.4 + 30} height="26" rx="13" fill="rgba(251,249,244,.92)" stroke="rgba(31,42,36,.18)"/>
      <circle cx="14" cy="13" r="4.5" fill={status.color}/>
      <text x="25" y="17.5" className="scene-status-text">{status.text}</text>
    </g>
    {/* Gauge: the same store as a percentage of plant-available capacity. */}
    <g className="gauge">
      <rect x={FIELD} y="0" width={W - FIELD} height={H} fill="#f8f6f0"/>
      <line x1={FIELD} x2={FIELD} y1="0" y2={H} stroke="#ddd7c9"/>
      <text className="gauge-value" x={(FIELD + W) / 2} y="70" textAnchor="middle">{Math.round(frame.percent)}%</text>
      <text className="gauge-caption" x={(FIELD + W) / 2} y="94" textAnchor="middle">plant-available</text>
      <text className="gauge-caption" x={(FIELD + W) / 2} y="112" textAnchor="middle">{n1(frame.water)} / {n1(frame.capacity)} mm</text>
      <rect x="856" y={LAYER_TOP} width="48" height={LAYER} rx="3" fill="#ebe6da" stroke="#c9c1ae"/>
      <rect x="856" y={gaugeY(frame.percent)} width="48" height={LAYER * frame.percent / 100} rx="2" fill={FLOW_COLORS.rain} opacity=".85" className="gauge-fill"/>
      {frame.thresholdPercent !== null && <g data-testid="stress-line"><line x1="848" x2="912" y1={gaugeY(frame.thresholdPercent)} y2={gaugeY(frame.thresholdPercent)} stroke={FLOW_COLORS.stress} strokeWidth="2.5"/>
        <text className="gauge-caption halo" x="880" y={gaugeY(frame.thresholdPercent) - 7} textAnchor="middle" style={{ fill: '#8a5a12' }}>stress line</text></g>}
      {ghostPercent !== null && <g data-testid="ghost-level"><line x1="850" x2="910" y1={gaugeY(ghostPercent)} y2={gaugeY(ghostPercent)} stroke="#1f2a24" strokeWidth="1.6" strokeDasharray="4 3"/>
        <line x1="828" x2="846" y1={LAYER_BOTTOM + 62} y2={LAYER_BOTTOM + 62} stroke="#1f2a24" strokeWidth="1.6" strokeDasharray="4 3"/>
        <text className="gauge-caption" x="852" y={LAYER_BOTTOM + 66}>{ghostLabel} {Math.round(ghostPercent)}%</text></g>}
      <text className="gauge-caption" x="880" y={LAYER_TOP - 10} textAnchor="middle">100% full</text>
      <text className="gauge-caption" x="880" y={LAYER_BOTTOM + 40} textAnchor="middle">0% wilting point</text>
    </g>
  </svg>;
}

export function FlowLegend() {
  return <p className="flow-legend" aria-label="How to read the farm illustration">
    Arrow width is proportional to that day’s millimetres (capped at {FLOW_SCALE.capMm} mm). A dashed amber outline shows water demand the dry soil could not meet.
  </p>;
}
