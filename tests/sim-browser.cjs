// M5 simulator browser check. Uses an existing Playwright install (not a project dependency).
// Honors CHROMIUM_PATH and PREVIEW_URL. Calendar values typed below are SYNTHETIC test
// assumptions; the demo calendar is illustrative. Nothing here is farm data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], external = [], replayRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => {
    if (/power\.larc\.nasa\.gov|sdmdataaccess|usda\.gov/.test(r.url())) external.push(r.url());
    if (r.url().endsWith('/replay.json')) replayRequests.push(r.url());
  });
  fs.mkdirSync('work', { recursive: true });
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4173/');
 await page.locator('#advanced-details > summary').click();
  await page.getByTestId('rain-value').waitFor();
  const sim = page.locator('.simulator');
  const simulateButton = sim.getByRole('button', { name: 'Simulate My Farm' });
  const banned = text => assert.doesNotMatch(text, /erosion\s+reduc|water\s+sav|yield|profit|soil\s+loss/i);

  // Landing state: hero, one #farm, nothing fetched, Simulate disabled with an inline hint.
  assert.match(await sim.locator('h2').first().innerText(), /Replay your farm plan through 45 years of NASA weather/);
  assert.equal(await page.locator('#farm').count(), 1);
  assert.equal(await page.locator('h1').count(), 1);
  assert.ok(await simulateButton.isDisabled());
  assert.match(await sim.locator('#sim-hint').innerText(), /Choose the first and last crop month/);
  assert.match(await sim.innerText(), /The plan starts January 1 of year 1/);
  assert.equal(await page.getByTestId('sim-results').count(), 0);
  assert.deepEqual(replayRequests, [], 'replay is fetched lazily, on first Simulate');

  // 1. One click: demo selects Palouse, simulates the illustrative baseline, shows 1–3 cards and the banner.
  await sim.getByRole('button', { name: /Try the illustrative Palouse demo/ }).click();
  await page.getByTestId('concern-card').first().waitFor();
  assert.equal(await page.locator('#farm').inputValue(), 'palouse');
  assert.equal(await sim.locator('.sim-tile[aria-pressed="true"]').innerText().then(t => t.split('\n')[0]), 'Palouse');
  const cards = page.getByTestId('concern-card');
  const cardCount = await cards.count();
  assert.ok(cardCount >= 1 && cardCount <= 3, `expected 1–3 concern cards, got ${cardCount}`);
  assert.equal(await page.getByTestId('demo-banner').innerText().then(t => t.replace(/\s+/g, ' ')), 'HYPOTHETICAL DEMO Hypothetical demonstration. Calendar and exposure values are illustrative, not farm data or recommendations.');
  assert.match(await page.getByTestId('sim-summary').innerText(), /Illustrative demo calendar.*Illustrative demo assumption.*43 replays, 1981–1983 to 2023–2025/s);
  for (let i = 0; i < cardCount; i++) {
    const card = cards.nth(i), text = await card.innerText();
    assert.equal(await card.locator('.frequency-strip rect').count(), 43, '43 ticks, one per replay');
    assert.match(text, /of 43 historical replays/);
    assert.match(text, /provisional screen/i);
    assert.match(text, /Gridded data \(~50 km\), not your field\. Irrigation and soil storage are not modeled\. Overlapping replays are not independent\./);
    for (const chip of ['Simulated indicator', 'Historical NASA weather', 'Illustrative demo assumption']) assert.ok(text.includes(chip), `${chip} chip on card ${i + 1}`);
    assert.ok(!text.includes('Farmer assumption'), 'demo values are never labeled as farmer input');
    assert.match(text, /\d{4}/, 'evidence carries real years');
    assert.equal(await card.locator('.frequency-strip rect.tick-flagged').count(), Number(await card.locator('.concern-frequency strong').innerText()));
  }
  assert.equal(await cards.first().getAttribute('data-family'), 'exposed');
  await page.waitForTimeout(700);
  assert.ok(await page.getByTestId('sim-results').evaluate(el => el.getBoundingClientRect().top < innerHeight), 'results scrolled into view');
  await page.screenshot({ path: 'work/m5-demo-concerns.png' });

  // 2. Improvement: apply the illustrative improved calendar → before/after on identical weather.
  await cards.first().getByRole('button', { name: /Try keeping cover or residue/ }).click();
  await sim.getByRole('button', { name: 'Apply the illustrative improved calendar' }).click();
  const comparison = page.getByTestId('sim-comparison');
  await comparison.waitFor();
  assert.equal(await comparison.locator('tbody tr').count(), 4);
  const exposedRow = await comparison.locator('tr[data-family="exposed"]').innerText();
  assert.match(exposedRow, /43 → \d+ of 43 replays/);
  assert.match(exposedRow, /less precipitation on assumed-exposed soil in 43 of 43 replays/);
  assert.match(exposedRow, /median [\d,]+ → [\d,]+ mm/);
  const comparisonText = await comparison.innerText();
  assert.match(comparisonText, /same weather, same 43 start years/i);
  assert.match(comparisonText, /Simulated indicator/);
  assert.ok((comparisonText.match(/Illustrative demo assumption/g) ?? []).length >= 2, 'before and after are both labeled as demo assumptions');
  banned(comparisonText);
  await comparison.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'work/m5-demo-comparison.png' });

  // 3. Print view: report content, print invocation, print CSS and a sample PDF.
  await sim.getByRole('button', { name: 'Print simulation report' }).click();
  const report = page.getByRole('region', { name: 'Printable simulation report' });
  await report.waitFor();
  const reportText = await report.innerText();
  for (const expected of [/Historical replay simulation report/, /Palouse/, /HYPOTHETICAL DEMO/, /Demo — illustrative calendar, not farm data/, /Screening thresholds — provisional/,
    /21\+ consecutive in-crop dry days/, /daily maximum ≥ 32 °C/, /25%\+ of a plan year’s precipitation/, /Before \/ after comparison/, /less precipitation on assumed-exposed soil/,
    /data\/palouse\/replay\.json/, /does not replace agricultural experts/, /NASA Langley Research Center \(LaRC\) POWER Project/, /not a forecast/i, /Bare 100%/, /Cover 30%/, /Crop 20%/])
    assert.match(reportText, expected);
  assert.equal(await report.locator('.report-thresholds tbody tr').count(), 10);
  assert.ok((await report.locator('.report-thresholds tbody tr td:last-child').allInnerTexts()).every(text => text === 'provisional'));
  assert.equal(await report.locator('.report-calendar').count(), 2);
  await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++; }; });
  await report.getByRole('button', { name: 'Print this report' }).click();
  assert.equal(await page.evaluate(() => window.__printCalls), 1);
  await page.emulateMedia({ media: 'print' });
  assert.ok(await report.isVisible());
  for (const hidden of ['.topbar', '.sim-hero', '.concern-grid', '.rotation-section', '.intro', '.sim-report .plan-actions']) assert.ok(!(await page.locator(hidden).first().isVisible()), `${hidden} hidden in print`);
  await page.pdf({ path: 'work/m5-simulation-report.pdf', format: 'A4', printBackground: true });
  assert.ok(fs.statSync('work/m5-simulation-report.pdf').size > 20000);
  await page.emulateMedia({ media: 'screen' });
  await report.getByRole('button', { name: 'Close report view' }).click();
  assert.equal(await report.count(), 0);
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('sim-report-open'))));

  // Demo assumptions never reach farmer management or rotation scoring.
  const rotationCard = page.getByTestId('rotation-card').first();
  assert.equal(await rotationCard.locator('.rotation-total strong').innerText(), 'Not scored');
  assert.equal(await rotationCard.locator('.calendar-month select').first().inputValue(), 'unknown');

  // 4. Palouse without a calendar: weather screens run from the growing window; exposed is not evaluated.
  assert.match(await page.getByTestId('sim-calendar-status').innerText(), /No confirmed field calendar for this rotation/);
  await sim.locator('#sim-window-start').selectOption('10');
  await sim.locator('#sim-window-end').selectOption('7');
  assert.match(await sim.innerText(), /Oct → Jul wraps the new year/);
  await simulateButton.click();
  await page.waitForFunction(() => /Climate-only growing window Oct → Jul/.test(document.querySelector('[data-testid="sim-summary"]')?.textContent ?? ''));
  assert.equal(await page.getByTestId('demo-banner').count(), 0, 'banner belongs to the demo only');
  const notEvaluated = await page.getByTestId('not-evaluated').innerText();
  assert.match(notEvaluated, /Not evaluated: Precipitation on exposed soil — Climate-only plan: exposed-soil precipitation needs a complete field calendar\. Enter or confirm a field calendar below\./);
  assert.equal(await page.getByTestId('not-evaluated').locator('a').getAttribute('href'), '#rotation-title');
  assert.ok(!(await page.getByTestId('concern-card').evaluateAll(nodes => nodes.map(n => n.dataset.family))).includes('exposed'));
  assert.equal(await page.getByTestId('sim-comparison').count(), 0);

  // 5. Farmer-confirmed calendar (SYNTHETIC values entered through the existing, unchanged calendar tools).
  const editor = rotationCard.locator('.management-calendar');
  await editor.locator('summary').click();
  await editor.getByLabel('Field and actual years, or scenario description').fill('SYNTHETIC M5 browser test — no observed farm data');
  await editor.getByLabel('Confirmed by', { exact: true }).fill('Automated test');
  const applyRange = async (start, end, status, exposure) => {
    await editor.getByRole('combobox', { name: 'Range starts', exact: true }).selectOption(String(start));
    await editor.getByRole('combobox', { name: 'Range ends', exact: true }).selectOption(String(end));
    await editor.getByRole('combobox', { name: 'Range status', exact: true }).selectOption(status);
    if (status !== 'bare') await editor.getByLabel('Range exposed soil (%)', { exact: true }).fill(String(exposure));
    await editor.getByRole('button', { name: 'Preview range edit' }).click();
    await editor.getByLabel('I reviewed these replacements and their assumptions.').check();
    await editor.getByRole('button', { name: 'Apply reviewed changes' }).click();
  };
  await applyRange(0, 35, 'cash', 10);
  await applyRange(8, 11, 'bare');
  assert.match(await page.getByTestId('sim-calendar-status').innerText(), /not complete and confirmed yet/);
  await editor.getByRole('button', { name: 'Confirm complete calendar' }).click();
  const scoreBefore = await rotationCard.locator('.rotation-total strong').innerText();
  assert.match(scoreBefore, /\/ 100$/);
  const useCalendar = sim.getByLabel(/Use my confirmed field calendar/);
  assert.ok(await useCalendar.isChecked());
  assert.equal(await sim.locator('#sim-window-start').count(), 0, 'the calendar replaces the growing window');
  await simulateButton.click();
  await page.waitForFunction(() => /Farmer-confirmed field calendar/.test(document.querySelector('[data-testid="sim-summary"]')?.textContent ?? ''));
  const farmerCards = page.getByTestId('concern-card');
  assert.equal(await farmerCards.first().getAttribute('data-family'), 'exposed');
  const farmerText = await page.getByTestId('sim-results').innerText();
  assert.ok(farmerText.includes('Farmer assumption') && !farmerText.includes('Illustrative demo assumption') && !farmerText.includes('HYPOTHETICAL'));
  await farmerCards.first().getByRole('button', { name: /Try keeping cover or residue/ }).click();
  const whatIf = sim.locator('.lever-months fieldset');
  assert.equal(await whatIf.count(), 3);
  assert.ok((await whatIf.allInnerTexts()).every(text => /Year 1 · (Sep|Oct|Nov|Dec)/.test(text) && /Bare soil · 100% exposed/.test(text)), 'the three most-exposed months are the bare ones');
  assert.ok((await whatIf.locator('input').evaluateAll(nodes => nodes.map(n => n.value))).every(value => value === ''), 'no exposure value is prefilled');
  await sim.getByRole('button', { name: 'Replay with these what-if months' }).click();
  assert.match(await sim.locator('.lever-panel [role="status"]').innerText(), /Enter an explicit exposure from 0 to 100/);
  assert.equal(await page.getByTestId('sim-comparison').count(), 0);
  for (let i = 0; i < 3; i++) await whatIf.nth(i).locator('input').fill('15');
  await sim.getByRole('button', { name: 'Replay with these what-if months' }).click();
  await page.getByTestId('sim-comparison').waitFor();
  const whatIfText = await page.getByTestId('sim-comparison').innerText();
  assert.match(whatIfText, /What-if edit of your confirmed calendar \(unconfirmed\)/);
  assert.match(whatIfText, /less precipitation on assumed-exposed soil in 43 of 43 replays/);
  banned(whatIfText);
  // The what-if is not written back: the confirmed calendar, its score and its inputs are unchanged.
  assert.equal(await rotationCard.locator('.rotation-total strong').innerText(), scoreBefore);
  assert.equal(await editor.getByLabel('Year 1 Oct status').inputValue(), 'bare');
  assert.ok(await editor.getByRole('button', { name: 'Confirm complete calendar' }).isDisabled(), 'still confirmed');
  // Editing the real calendar afterwards marks the simulation as stale and withdraws the calendar option.
  await editor.getByLabel('Year 1 Jan exposed soil percent').fill('12');
  assert.match(await page.getByTestId('sim-results').innerText(), /Your field calendar changed after this simulation/);
  assert.equal(await useCalendar.count(), 0);

  // 6. Climate-only Yakima: growing window required; Dry card notes irrigation; window lever compares.
  await sim.getByRole('button', { name: /Yakima Valley/ }).click();
  assert.equal(await page.locator('#farm').inputValue(), 'yakima');
  assert.equal(await page.getByTestId('sim-results').count(), 0, 'results belong to the farm they were simulated for');
  assert.equal(await sim.locator('#sim-rotation').count(), 0);
  await sim.locator('#sim-window-end').selectOption('');
  assert.ok(await simulateButton.isDisabled());
  await sim.locator('#sim-window-start').selectOption('4');
  await sim.locator('#sim-window-end').selectOption('9');
  await simulateButton.click();
  await page.locator('[data-testid="concern-card"][data-family="dry"]').waitFor();
  const dryText = await page.locator('[data-testid="concern-card"][data-family="dry"]').innerText();
  assert.match(dryText, /Irrigation, where available, may offset low precipitation; it is not modeled here\./);
  assert.match(dryText, /\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}: \d+ in-crop days without ≥1 mm/);
  assert.match(dryText, /Model estimate \(GWETROOT\)/);
  assert.match(dryText, /Context only/);
  await page.locator('[data-testid="concern-card"][data-family="dry"]').getByRole('button', { name: /Try a different growing window/ }).click();
  assert.ok(await sim.getByRole('button', { name: 'Replay with this growing window' }).isDisabled(), 'an unchanged window is not a comparison');
  await sim.locator('#lever-window-start').selectOption('6');
  await sim.locator('#lever-window-end').selectOption('8');
  await sim.getByRole('button', { name: 'Replay with this growing window' }).click();
  await page.getByTestId('sim-comparison').waitFor();
  const windowText = await page.getByTestId('sim-comparison').innerText();
  assert.match(windowText, /Climate-only growing window Apr → Sep[\s\S]*Climate-only growing window Jun → Aug/);
  assert.match(windowText, /fewer in-crop hot days in \d+ of 43 replays/);
  assert.match(windowText, /not evaluated in either plan/);
  banned(windowText);

  // Responsive: no horizontal overflow with results and comparison open.
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `overflow at ${width}`);
    if (width === 390) { await page.getByTestId('sim-results').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'work/m5-mobile.png' }); }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, [], 'no NASA or USDA request during app use');
  assert.equal(replayRequests.filter(url => url.includes('/palouse/')).length, 1, 'Palouse replay fetched once, then served from memory');
  assert.equal(replayRequests.filter(url => url.includes('/yakima/')).length, 1);

  // 7. Replay load failure: clear message and Retry; the dashboard keeps working.
  await page.route('**/data/skagit/replay.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await sim.getByRole('button', { name: /Skagit Valley/ }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="rain-value"]')?.textContent.startsWith('1,323.3'));
  await simulateButton.click();
  const failure = sim.getByRole('alert');
  await failure.waitFor();
  assert.match(await failure.innerText(), /Simulation data could not be loaded/);
  assert.equal(await page.getByTestId('sim-results').count(), 0);
  assert.ok((await page.getByTestId('rain-value').innerText()).includes('1,323.3'), 'dashboard still works');
  assert.equal(await page.locator('.recharts-surface').count(), 2);
  // A corrupted file is rejected by validation rather than simulated.
  await page.unroute('**/data/skagit/replay.json');
  const corrupt = JSON.parse(fs.readFileSync('public/data/skagit/replay.json'));
  corrupt.series.PRECTOTCORR.pop();
  await page.route('**/data/skagit/replay.json', route => route.fulfill({ json: corrupt }));
  await failure.getByRole('button', { name: 'Retry' }).click();
  await page.waitForFunction(() => /does not have exactly 16436 days/.test(document.querySelector('.sim-error')?.textContent ?? ''));
  await page.unroute('**/data/skagit/replay.json');
  await sim.getByRole('alert').getByRole('button', { name: 'Retry' }).click();
  await page.getByTestId('sim-results').waitFor();
  assert.equal(await sim.getByRole('alert').count(), 0);
  assert.match(await page.getByTestId('sim-summary').innerText(), /Skagit Valley · Climate-only growing window Apr → Sep/);
  assert.ok(await page.getByTestId('concern-card').count() <= 3);
  assert.deepEqual(external, []);
  assert.equal(errors.filter(e => !e.includes('503')).length, 0, 'only the deliberately simulated 503 may log a resource error');
  await browser.close();
  console.log('PASS M5: lazy replay load; one-click Palouse demo with 1–3 concern cards, 43-tick strips, provenance chips and HYPOTHETICAL banner; illustrative improvement with paired before/after on identical weather; print report, print CSS and PDF; demo isolated from farmer management and scoring; climate-only Palouse and Yakima with exposed "Not evaluated"; farmer-confirmed calendar with unsaved what-if lever and stale detection; growing-window lever; 320/390/768px layouts; replay failure, validation rejection and Retry; no runtime errors and no NASA/USDA requests.');
})().catch(e => { console.error(e); process.exit(1); });
