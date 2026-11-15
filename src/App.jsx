import React, { useState } from 'react';
import config from './config/config.js';
import VisualSimulator from './components/VisualSimulator.jsx';

// The main experience is the simulator only. The earlier climate dashboard, M5 replay simulator,
// rotation scoring and calendars are preserved unchanged on research.html (src/research.jsx).
export function Brand() {
  return <header className="topbar"><div className="topbar-inner"><a className="brand" href="./" aria-label="Field Shift home"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25V7h22M5 14h18M5 21h13"/><path d="M21 27c0-8 3-11 7-12-1 6-3 10-7 12Z"/></svg>Field Shift<span className="brand-dot">.</span></a><span className="topbar-label">NASA SPACE APPS <span>2026</span></span></div></header>;
}
export function Footer() {
  return <footer className="site-footer">
    <nav aria-label="Documentation"><a href="./docs/nasa-data.html">NASA Data &amp; Sources</a><a href="./docs/how-it-works.html">How It Works</a><a href="./docs/limitations.html">Scientific Limitations</a></nav>
    <p>Field Shift · NASA Space Apps 2026. An educational simulation driven by NASA POWER data. It does not replace local agronomists, extension specialists, soil testing or a farmer’s experience.</p>
  </footer>;
}
export default function App() {
  const [selected, setSelected] = useState('palouse');
  const [year, setYear] = useState(2023);
  return <>
    <a className="skip-link" href="#visual-simulator">Skip to simulator</a>
    <Brand/>
    <main>
      <VisualSimulator farms={config.farms} selected={selected} onSelect={setSelected} year={year} onYear={setYear}/>
      <Footer/>
    </main>
  </>;
}
