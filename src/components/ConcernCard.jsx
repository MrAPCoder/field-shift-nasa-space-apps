import React from 'react';
import { CHIPS } from '../lib/concerns.js';

const CHIP_CLASS = { [CHIPS.nasa]: 'nasa', [CHIPS.model]: 'model', [CHIPS.farmer]: 'farmer', [CHIPS.demo]: 'demo', [CHIPS.simulated]: 'simulated' };
/** Provenance label carried by every displayed number. */
export function Chip({ label }) {
  return <span className={`prov-chip prov-${CHIP_CLASS[label] ?? 'simulated'}`}>{label}</span>;
}

/** One tick per three-year replay, in start-year order. Filled = screen met. Plain SVG. */
export function FrequencyStrip({ flags, startYears, label }) {
  const step = 10, height = 26, width = flags.length * step;
  const first = startYears[0], last = startYears.at(-1);
  return <figure className="frequency-strip">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
      {flags.map((flag, i) => <rect key={startYears[i]} x={i * step + 1.5} y={flag === null ? 9 : 1} width={step - 3} height={flag === null ? 8 : height - 2} rx="1.5"
        className={flag === null ? 'tick-missing' : flag ? 'tick-flagged' : 'tick-clear'}>
        <title>{`${startYears[i]}–${startYears[i] + 2}: ${flag === null ? 'not evaluated (incomplete inputs)' : flag ? 'screen met' : 'screen not met'}`}</title>
      </rect>)}
    </svg>
    <figcaption><span>{first}–{first + 2}</span><span>Each tick is one three-year replay · filled = screen met</span><span>{last}–{last + 2}</span></figcaption>
  </figure>;
}

export default function ConcernCard({ card, rank, onLever }) {
  return <article className="concern-card" data-testid="concern-card" data-family={card.family}>
    <div className="concern-rank">CONCERN {rank} <span className="provisional-tag">{card.status} screen</span></div>
    <h4>{card.title}</h4>
    <div className="concern-frequency"><strong>{card.flagged}</strong><span>of {card.valid} historical replays</span></div>
    <Chip label={card.howOftenChip}/>
    <FrequencyStrip flags={card.flags} startYears={card.startYears} label={`${card.howOften} met this screen.`}/>
    <p className="concern-rule">{card.rule}</p>
    <dl className="concern-detail">
      <div><dt>Why it matters</dt><dd>{card.why}</dd></div>
      <div><dt>NASA evidence · worst replay</dt><dd>{card.evidence} <Chip label={card.evidenceChip}/></dd></div>
      {card.context && <div><dt>Soil wetness context</dt><dd>{card.context.text} <Chip label={card.context.chip}/></dd></div>}
      <div><dt>Plan input</dt><dd>{card.assumption} <Chip label={card.assumptionChip}/></dd></div>
      <div><dt>Uncertainty</dt><dd>{card.uncertainty}{card.notes.map(note => <span key={note}> {note}</span>)}</dd></div>
    </dl>
    {card.lever && onLever && <button type="button" className="concern-lever" onClick={() => onLever(card.lever.id)}>{card.lever.label} →</button>}
  </article>;
}
