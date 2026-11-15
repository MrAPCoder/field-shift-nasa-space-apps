import React from 'react';
import { MODEL } from '../lib/soilWater.js';
import { FLOW_SCALE, mm } from '../lib/scene.js';

// Schematic illustration of ONE calculated model day (see lib/scene.js#sceneFrame).
// Geometry is fixed; only what the frame says changes. It is not an observed field.
const W = 960, H = 540, SURFACE = 200, LAYER_TOP = 204, LAYER_BOTTOM = 460, FIELD = 800;
const LAYER = LAYER_BOTTOM - LAYER_TOP;
const PLANTS = [70, 200, 330, 460, 590, 720];
const mix = (a, b, t) => {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  return `rgb(${p(a).map((v, i) => Math.round(v + (p(b)[i] - v) * t)).join(',')})`;
};
const n1 = v => v.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
// Deterministic pseudo-random layout so a given day always draws identically.
const jitter = i => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;

function Wheat({ x, size, senescence, stage }) {
  const color = mix('#5c8c37', '#c8a548', senescence), h = 150 * size;
  const blades = [[-26, .72], [-12, .9], [0, 1], [12, .88], [26, .7]];
  return <g className="plant wheat">
    {blades.map(([dx, k], j) => <path key={j} d={`M${x},${SURFACE} Q${x + dx * size * .3},${SURFACE - h * k * .6} ${x + dx * size},${SURFACE - h * k}`} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round"/>)}
    {(stage === 'mid' || stage === 'late') && blades.slice(1, 4).map(([dx, k], j) =>
      <ellipse key={j} cx={x + dx * size} cy={SURFACE - h * k - 9} rx="4.5" ry="13" fill={mix('#7c9d3e', '#d8b55a', senescence)} transform={`rotate(${dx / 2} ${x + dx * size} ${SURFACE - h * k - 9})`}/>)}
  </g>;
}
function Pea({ x, size, senescence, stage }) {
  const color = mix('#4f8a45', '#b59d55', senescence), h = 115 * size, nodes = Math.max(2, Math.round(6 * size));
  return <g className="plant pea">
    <path d={`M${x},${SURFACE} C${x - 10},${SURFACE - h * .35} ${x + 10},${SURFACE - h * .65} ${x},${SURFACE - h}`} stroke={color} strokeWidth="2.5" fill="none"/>
    {Array.from({ length: nodes }, (_, j) => { const y = SURFACE - h * (j + 1) / (nodes + .5), r = 5 + 4 * size;
      return <g key={j}><ellipse cx={x - r - 1} cy={y} rx={r} ry={r * .65} fill={color}/><ellipse cx={x + r + 1} cy={y - 3} rx={r} ry={r * .65} fill={color}/>
        {(stage === 'mid' || stage === 'late') && j % 2 === 1 && <ellipse cx={x + 4} cy={y + 9} rx="3" ry="10" fill={mix('#6fa451', '#c9b06a', senescence)}/>}</g>; })}
    <path d={`M${x},${SURFACE - h} q8,-8 12,0 q-2,6 -7,3`} stroke={color} strokeWidth="1.5" fill="none"/>
  </g>;
}
function Potato({ x, size, senescence, stage }) {
  const color = mix('#3f7d3a', '#a8a050', senescence), h = 95 * size, r = 8 + 9 * size;
  const leaves = [[0, 1], [-.55, .78], [.55, .78], [-.85, .45], [.85, .45], [-.3, .55], [.3, .55]];
  return <g className="plant potato">
    <ellipse cx={x} cy={SURFACE + 2} rx={30 * Math.max(.5, size)} ry="7" fill="rgba(90,62,40,.35)"/>
    {leaves.map(([dx, k], j) => <g key={j}><path d={`M${x},${SURFACE} L${x + dx * 40 * size},${SURFACE - h * k}`} stroke={color} strokeWidth="2"/>
      <ellipse cx={x + dx * 40 * size} cy={SURFACE - h * k} rx={r} ry={r * .7} fill={color}/></g>)}
    {stage === 'mid' && [-.4, .1, .5].map((dx, j) => <circle key={j} cx={x + dx * 40 * size} cy={SURFACE - h - 6 + j * 4} r="3.5" fill="#f2efe4" stroke="#c8b7d9"/>)}
  </g>;
}
const CROPS = { spring_wheat: Wheat, spring_pea: Pea, potato: Potato };

function Arrow({ x, y1, y2, width, color, label, labelSide = 1, labelY, outline = false, dashed = false, name }) {
  if (!width) return null;
  const up = y2 < y1, head = Math.min(18, width + 8), tip = y2, base = up ? y2 + head : y2 - head;
  const d = `M${x - width / 2},${y1} L${x - width / 2},${base} L${x - width / 2 - (head - width / 2) / 1.4},${base} L${x},${tip} L${x + width / 2 + (head - width / 2) / 1.4},${base} L${x + width / 2},${base} L${x + width / 2},${y1} Z`;
  return <g className={`flow flow-${name}`} data-width={width.toFixed(3)}>
    <path d={d} fill={outline ? 'none' : color} stroke={color} strokeWidth={outline ? 2 : 0} strokeDasharray={dashed ? '6 5' : undefined} opacity={outline ? .9 : .92}/>
    {label && <text className="scene-label" x={x + labelSide * (width / 2 + 12)} y={labelY ?? (y1 + y2) / 2} textAnchor={labelSide > 0 ? 'start' : 'end'}>{label}</text>}
  </g>;
}

export default function FarmScene({ frame, ghostPercent = null, ghostLabel = 'Before', animate = false }) {
  const { day, widths, flows } = frame, Crop = CROPS[frame.crop];
  const skyTop = mix('#c4cbcc', '#8fc2e3', frame.solarLevel), skyBottom = mix('#dfe3df', '#d8ebf3', frame.solarLevel);
  const drops = frame.rainClass?.drops ?? 0, coverFraction = MODEL.assumptions.residueCoverFraction;
  const gaugeY = p => LAYER_BOTTOM - LAYER * p / 100;
  const summary = `${day.date}: calculated available soil water ${n1(frame.percent)} percent. NASA precipitation ${n1(flows.rain)} millimetres, irrigation ${n1(flows.irrigation)}, calculated water loss ${n1(flows.actualET)} of ${n1(flows.demand)} demanded, drainage ${n1(flows.drainage)}.`;
  return <svg className={`farm-scene${animate ? ' is-animated' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}
    data-testid="farm-scene" data-date={day.date} data-available-percent={frame.percent.toFixed(3)} data-rain={flows.rain} data-irrigation={flows.irrigation.toFixed(4)}
    data-actual-et={flows.actualET.toFixed(4)} data-demand={flows.demand.toFixed(4)} data-drainage={flows.drainage.toFixed(4)} data-rain-class={frame.rainClass.id}
    data-overflow={String(flows.drainage > 0)} data-stage={frame.stage?.id ?? 'off-season'} data-cover={frame.cover.kind} data-freezing={String(frame.freezing)} data-soil-color={frame.soilColor}>
    <defs>
      <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={skyTop}/><stop offset="1" stopColor={skyBottom}/></linearGradient>
      <pattern id="tex-sandy" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="4" cy="5" r="2" fill="rgba(255,255,255,.22)"/><circle cx="13" cy="12" r="1.6" fill="rgba(0,0,0,.12)"/><circle cx="9" cy="16" r="1.2" fill="rgba(255,255,255,.18)"/></pattern>
      <pattern id="tex-loamy" width="16" height="14" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1.1" fill="rgba(255,255,255,.18)"/><circle cx="11" cy="9" r="1.3" fill="rgba(0,0,0,.13)"/><path d="M6 12h4" stroke="rgba(0,0,0,.1)"/></pattern>
      <pattern id="tex-clay" width="24" height="10" patternUnits="userSpaceOnUse"><path d="M2 3h12M10 8h12" stroke="rgba(0,0,0,.14)" strokeWidth="1.2"/></pattern>
      <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v8" stroke="#6f7f8c" strokeWidth="2"/></pattern>
    </defs>
    <rect width={FIELD} height={SURFACE} fill="url(#sky)"/>
    <circle cx="745" cy="58" r="24" fill="#f1c45a" opacity={.12 + .88 * frame.solarLevel} data-testid="sun"/>
    {drops > 0 && <g className={`precip ${frame.freezingPrecip ? 'precip-frozen' : 'precip-liquid'}`} data-drops={drops}>
      {Array.from({ length: drops }, (_, i) => { const x = 24 + jitter(i + 1) * (FIELD - 48), y = 18 + jitter(i + 101) * 150;
        return frame.freezingPrecip ? <circle key={i} cx={x} cy={y} r="3.5" fill="none" stroke="#7d8a96" strokeWidth="1.5"/>
          : <path key={i} className="drop" style={{ animationDelay: `${-jitter(i + 7) * .9}s` }} d={`M${x},${y} l-3,12`} stroke="#4c7ea6" strokeWidth="2" strokeLinecap="round"/>; })}
    </g>}
    {/* Soil-water store: one uniform colour = one well-mixed bucket. */}
    <rect x="0" y={LAYER_TOP} width={FIELD} height={LAYER} fill={frame.soilColor} className="soil-store"/>
    <rect x="0" y={LAYER_TOP} width={FIELD} height={LAYER} fill={`url(#tex-${frame.soil})`}/>
    <rect x="0" y={LAYER_BOTTOM} width={FIELD} height={H - LAYER_BOTTOM} fill="#8f8a80"/>
    <rect x="0" y={LAYER_BOTTOM} width={FIELD} height={H - LAYER_BOTTOM} fill="url(#hatch)" opacity=".25"/>
    <text className="scene-note" x="16" y={LAYER_BOTTOM - 14}>Modeled soil-water store · one 0.6 m layer · {MODEL.soils[frame.soil].label.toLowerCase()}</text>
    <text className="scene-note" x="16" y={H - 16}>Below the modeled layer · drained water leaves the model</text>
    {/* Ground surface and cover. */}
    <rect x="0" y={SURFACE - 4} width={FIELD} height="8" fill={frame.soilColor}/>
    {frame.cover.residue && <g className="residue" data-fraction={coverFraction}>{Array.from({ length: Math.floor(FIELD / (20 / coverFraction)) }, (_, i) =>
      <path key={i} d={`M${i * 20 / coverFraction + 4},${SURFACE - 1 + (i % 3) - 1} l20,${(i % 2 ? 1 : -1) * 1.5}`} stroke="#d9c58e" strokeWidth="4" strokeLinecap="round"/>)}</g>}
    {frame.cover.kind === 'cover' && <g className="cover-crop">{Array.from({ length: 80 }, (_, i) => { const x = 5 + i * 10;
      return <path key={i} d={`M${x},${SURFACE} q2,-10 ${(i % 2 ? 4 : -3)},-${16 + 6 * jitter(i)}`} stroke="#6b9a4a" strokeWidth="2.4" fill="none"/>; })}</g>}
    {frame.freezing && <rect x="0" y={SURFACE - 5} width={FIELD} height="4" fill="#f4f8fb" opacity=".85" data-testid="frost"/>}
    {frame.stage && <g className="roots" opacity=".42">{PLANTS.map(x => [-18, -6, 6, 18].map((dx, j) =>
      <path key={`${x}${j}`} d={`M${x},${SURFACE + 4} q${dx},40 ${dx * 1.8},${110 - Math.abs(dx) * 2}`} stroke="#f6eedb" strokeWidth="1.6" fill="none"/>))}</g>}
    {frame.stage && Crop && PLANTS.map(x => <Crop key={x} x={x} size={frame.stage.size} senescence={frame.stage.senescence} stage={frame.stage.id}/>)}
    {flows.irrigation > 0 && <path className="drip-line" d={`M10,${SURFACE - 7} H${FIELD - 10}`} stroke="#2f7f75" strokeWidth="3" strokeDasharray="22 6"/>}
    <Arrow name="rain" x={135} y1={110} y2={LAYER_TOP + 80} width={widths.rain} color={frame.freezingPrecip ? '#7d8a96' : '#3f78a6'} outline={frame.freezingPrecip} dashed={frame.freezingPrecip}
      label={`${frame.freezingPrecip ? 'Precip.*' : 'Rain'} +${mm(flows.rain)}`} labelSide={-1} labelY={150}/>
    <Arrow name="irrigation" x={265} y1={SURFACE - 10} y2={LAYER_TOP + 80} width={widths.irrigation} color="#2f8f83" label={`Irrigation +${mm(flows.irrigation)}`} labelY={LAYER_TOP + 40}/>
    {frame.waterLimited && <Arrow name="demand" x={525} y1={SURFACE + 40} y2={70} width={widths.demand} color="#b86f22" outline dashed/>}
    <Arrow name="et" x={525} y1={SURFACE + 40} y2={70} width={widths.actualET} color="#d28a3d" labelY={110}
      label={`Water loss −${mm(flows.actualET)}${frame.waterLimited ? ` of ${mm(flows.demand)} demand` : ''}`} />
    <Arrow name="drainage" x={395} y1={LAYER_BOTTOM - 50} y2={H - 6} width={widths.drainage} color="#1f5f86" label={`Drainage −${mm(flows.drainage)}`} labelY={LAYER_BOTTOM + 30}/>
    {/* Water in exceeded what the store can hold: the model's drainage term, drawn only when it is non-zero. */}
    {flows.drainage > 0 && <g data-testid="overflow" className="overflow">
      <rect x="0" y={LAYER_TOP} width={FIELD} height="6" fill="#1f5f86" opacity=".55"/>
      <text className="scene-label overflow-label" x={420} y={LAYER_BOTTOM - 62}>Soil store full · extra water drains</text>
      <rect x="852" y={LAYER_TOP - 2} width="56" height="8" rx="3" fill="#1f5f86"/>
    </g>}
    {/* Gauge: the same store as a percentage of plant-available capacity. */}
    <g className="gauge" transform="translate(0,0)">
      <rect x={FIELD} y="0" width={W - FIELD} height={H} fill="#f7f8f3"/>
      <text className="gauge-value" x={(FIELD + W) / 2} y="70" textAnchor="middle">{Math.round(frame.percent)}%</text>
      <text className="gauge-caption" x={(FIELD + W) / 2} y="96" textAnchor="middle">available water</text>
      <text className="gauge-caption" x={(FIELD + W) / 2} y="118" textAnchor="middle">{n1(frame.water)} / {n1(frame.capacity)} mm</text>
      <rect x="852" y={LAYER_TOP} width="56" height={LAYER} rx="6" fill="#e6e2d6" stroke="#b9b29f"/>
      <rect x="852" y={gaugeY(frame.percent)} width="56" height={LAYER * frame.percent / 100} rx="4" fill="#4b86ad" className="gauge-fill"/>
      {frame.thresholdPercent !== null && <g data-testid="stress-line"><line x1="842" x2="918" y1={gaugeY(frame.thresholdPercent)} y2={gaugeY(frame.thresholdPercent)} stroke="#b4462b" strokeWidth="3"/>
        <text className="gauge-caption halo" x="880" y={gaugeY(frame.thresholdPercent) - 8} textAnchor="middle" style={{fill:'#9a3a22'}}>crop stress line</text></g>}
      {ghostPercent !== null && <g data-testid="ghost-level"><line x1="846" x2="914" y1={gaugeY(ghostPercent)} y2={gaugeY(ghostPercent)} stroke="#2b2b2b" strokeWidth="2" strokeDasharray="5 4"/>
        <text className="gauge-caption halo" x="880" y={Math.min(LAYER_BOTTOM + 22, gaugeY(ghostPercent) + 20)} textAnchor="middle">{ghostLabel} {Math.round(ghostPercent)}%</text></g>}
      <text className="gauge-caption" x="880" y={LAYER_BOTTOM + 44} textAnchor="middle">0% = wilting point</text>
      <text className="gauge-caption" x="880" y={LAYER_TOP - 10} textAnchor="middle">100% = field cap.</text>
    </g>
  </svg>;
}

export function FlowLegend() {
  const bar = v => Math.min(v, FLOW_SCALE.capMm) * FLOW_SCALE.pxPerMm;
  return <div className="flow-legend" aria-label="How to read the farm illustration">
    <span><i className="key key-nasa"/>NASA POWER weather</span>
    <span><i className="key key-input"/>Your irrigation input</span>
    <span><i className="key key-calc"/>Calculated by the model</span>
    <span className="scale">Arrow width = mm of water that day:
      <svg viewBox="0 0 150 22" aria-hidden="true">{[1, 5, 10, 20].map((v, i) => <g key={v}><rect x={4 + i * 38} y={11 - bar(v) / 6} width="8" height={bar(v) / 3} fill="#73828c"/><text x={16 + i * 38} y="15">{v}{v === 20 ? '+' : ''}</text></g>)}</svg>
    </span>
    <span>Dashed outline = water the weather could pull (demand); solid = what the soil supplied.</span>
  </div>;
}
