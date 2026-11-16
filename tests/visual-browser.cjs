// Daily model UI integration, existing Playwright only; no project dependency.
// Expected values are recomputed here in Node from the same archived NASA file, so every rendered
// frame is checked against an independent model run, not against the page's own numbers.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const {runSoilSimulation,startupSensitivity,monthlyBalance}=await import(path.join(root,'src/lib/soilWater.js'));
 const weather=id=>JSON.parse(fs.readFileSync(path.join(root,`public/data/${id}/soil-weather.json`)));
 const base={location:'palouse',year:2023,crop:'spring_wheat',soil:'loamy',irrigation:0,planting:4,harvest:8,cover:'bare'};
 const expected=runSoilSimulation(weather('palouse'),base), expectedIrrigated=runSoilSimulation(weather('palouse'),{...base,irrigation:20});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/power\.larc|usda\.gov|earthdata\.nasa/.test(r.url()))external.push(r.url());});
 const url=process.env.PREVIEW_URL||'http://127.0.0.1:4173/';
 await page.goto(url);const main=page.locator('#visual-simulator'),scene=main.getByTestId('farm-scene'),slider=main.getByRole('slider',{name:'Simulation day'});
 assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('#advanced-details').count(),0,'no Advanced Details on the main page');
 // The default Palouse scenario runs on load, so the farm is visible immediately; it opens on planting day.
 await slider.waitFor();
 assert.equal(Number(await slider.inputValue()),90,'opens on April 1');
 await slider.fill('0');
 assert.equal(await main.locator('.water-chart').count(),0,'the main view is the farm illustration, not a graph');
 assert.equal(await scene.count(),1);
 // Rendered frame ≡ independent model record for that day, everywhere it is shown.
 async function checkFrame(i,result=expected,label='after'){
  const d=result.days[i];
  assert.equal(await scene.getAttribute('data-date'),d.date,`${label} scene date ${i}`);
  assert.equal(await main.getByTestId('playback-date').getAttribute('datetime'),d.date);
  assert.equal(await main.locator('time.farm-date').getAttribute('datetime'),d.date);
  assert.equal(Number(await scene.getAttribute('data-available-percent')),Number(d.availablePercent.toFixed(3)));
  assert.equal(Number(await scene.getAttribute('data-rain')),d.rain);
  for(const [attr,key] of [['data-irrigation','irrigation'],['data-actual-et','actualET'],['data-demand','demand'],['data-drainage','drainage']])
   assert.equal(Number(await scene.getAttribute(attr)),Number(d[key].toFixed(4)),`${attr} ${d.date}`);
  assert.equal(await scene.getAttribute('data-freezing'),String(d.tMin<=0));
  assert.equal(await main.getByTestId('panel-percent').innerText(),`${Math.round(d.availablePercent)}%`);
  assert.equal(await main.getByTestId('stress-line').count(),d.active?1:0);
  assert.equal(await scene.locator('.flow-drainage').count(),d.drainage>0?1:0,'drainage arrow only when the model drains');
  assert.equal(await scene.locator('.flow-irrigation').count(),d.irrigation>0?1:0);
  assert.equal(await scene.locator('.precip').count(),d.rain>0?1:0,'precipitation marks only on days with NASA precipitation');
 }
 assert.match(await main.getByTestId('soil-panel').innerText(),/of 120 mm plant-available water/);
 await checkFrame(0);
 // M9 score: every shown number equals an independent Node analysis; try-improvement and undo.
 const {analyzeFarm,gradeScenario}=await import(path.join(root,'src/lib/grade.js'));
 const analysis=analyzeFarm(weather('palouse'),base),imp=analysis.improvement;
 await main.getByTestId('score-total').waitFor();
 assert.equal(await main.getByTestId('score-total').innerText(),`${analysis.score}/100`);
 assert.equal(await main.getByTestId('problem-title').innerText(),analysis.problem.title);
 assert.match(await main.getByTestId('improve-total').innerText(),new RegExp(`${imp.totalBefore} → ${imp.totalAfter}`));
 for(const hidden of ['.score-bar','.grade','details.other'])assert.equal(await main.locator(hidden).count(),0,`no ${hidden} in the simple card`);
 assert.equal(await main.getByRole('radio',{name:'Balanced'}).getAttribute('aria-checked'),'true');
 assert.equal(await main.getByTestId('options-table').locator('tbody tr').count(),1+new Set(Object.values(analysis.options).filter(Boolean).map(o=>JSON.stringify(o.scenario))).size);
 await main.getByTestId('how-to-improve').getByRole('button',{name:'Try this change'}).click();
 await main.getByTestId('applied-banner').waitFor();
 await page.waitForFunction(t=>document.querySelector('[data-testid=score-total]')?.textContent===t,`${imp.totalAfter}/100`);
 assert.match(await main.getByTestId('applied-banner').innerText(),new RegExp(`${imp.totalBefore} → ${imp.totalAfter}`));
 assert.match(await main.getByTestId('compare-score').innerText(),new RegExp(`${imp.totalBefore}\\s+${imp.totalAfter}`));
 assert.equal(Number(await main.getByLabel('Net irrigation (mm/week)',{exact:true}).inputValue()),imp.scenario.irrigation);
 assert.equal(await main.getByLabel('Ground cover',{exact:true}).inputValue(),imp.scenario.cover);
 const applied=runSoilSimulation(weather('palouse'),imp.scenario);
 await slider.fill('150');await checkFrame(150,applied,'applied');
 await main.getByTestId('applied-banner').getByRole('button',{name:'Undo'}).click();
 await page.waitForFunction(t=>document.querySelector('[data-testid=score-total]')?.textContent===t,`${analysis.score}/100`);
 assert.equal(await main.getByTestId('soil-comparison').count(),0,'undo returns to the single baseline run');
 assert.equal(await main.getByLabel('Ground cover',{exact:true}).inputValue(),'bare');
 assert.equal(await main.getByLabel('Net irrigation (mm/week)',{exact:true}).inputValue(),'0');
 for(const i of [10,50,123,190,200,364]){await slider.fill(String(i));await checkFrame(i);}
 // Known archived days: freezing precipitation is not drawn as liquid infiltration; saturated day drains.
 await slider.fill('10');assert.equal(await scene.locator('.precip-frozen').count(),1);assert.equal(await scene.locator('.precip-liquid').count(),0);
 assert.match(await main.getByTestId('panel-explain').innerText(),/may have been snow.*frozen ground are not modeled/s);
 await slider.fill('50');assert.ok(Number(await scene.locator('.flow-drainage').getAttribute('data-width'))>0);assert.match(await main.getByTestId('panel-explain').innerText(),/drained below/);
 await slider.fill('200');assert.equal(await main.getByTestId('panel-status').innerText(),'Water stress: the soil is below the crop stress line, so the crop cannot use water at the full rate.');
 assert.equal(await scene.locator('.flow-demand').count(),1,'demand outline shown when the soil limits water use');
 // Month jump, single-day steps, month-to-date readout summed from daily values.
 const months=monthlyBalance(expected);
 await main.getByRole('button',{name:'Jump to July',exact:true}).click();
 assert.equal(Number(await slider.inputValue()),months[6].first);await checkFrame(months[6].first);
 assert.equal(await main.getByRole('button',{name:'Jump to July'}).getAttribute('aria-pressed'),'true');
 await main.getByRole('button',{name:'Next day'}).click();await main.getByRole('button',{name:'Next day'}).click();await checkFrame(months[6].first+2);
 await main.getByRole('button',{name:'Previous day'}).click();await checkFrame(months[6].first+1);
 await main.getByRole('button',{name:'Jump to February'}).click();await checkFrame(months[1].first);
 await main.getByRole('button',{name:'Jump to December'}).click();await checkFrame(months[11].first);
 // Starting-water band matches the independently computed sensitivity date.
 const st=startupSensitivity(weather('palouse'),base);
 const band=await main.locator('.startup-band').evaluate(e=>parseFloat(e.style.width));
 assert.ok(Math.abs(band-100*st.index/364)<.01);assert.match(await main.locator('.startup-key').innerText(),/Mar 6, 2023/);
 // Play/pause: advancing, and scene/date stay in sync after pausing. Reduced motion: no falling animation.
 await slider.fill('170');
 await main.getByRole('button',{name:'Play simulation',exact:true}).click();
 await page.waitForTimeout(450);
 assert.equal(await main.locator('.farm-scene.is-animated').count(),0,'reduced motion: no animated marks');
 await main.getByRole('button',{name:'Pause simulation',exact:true}).click();
 const paused=Number(await slider.inputValue());assert.ok(paused>170);await checkFrame(paused);
 // Inputs edits never relabel the old run; comparison uses identical weather and a frozen baseline.
 await slider.fill('190');
 const beforeScene=await scene.getAttribute('data-available-percent');
 await main.getByLabel('Net irrigation (mm/week)',{exact:true}).fill('20');
 await main.getByRole('status').waitFor();
 assert.equal(await scene.getAttribute('data-available-percent'),beforeScene,'edits do not relabel old results as new');
 await main.getByRole('button',{name:'Compare this change',exact:true}).click();
 await main.getByTestId('soil-comparison').waitFor();
 await slider.fill('190');await checkFrame(190,expectedIrrigated);
 assert.equal(await main.getByTestId('ghost-level').count(),1,'baseline level on the same date is shown');
 assert.match(await main.getByTestId('soil-panel').innerText(),new RegExp(`Before: ${Math.round(expected.days[190].availablePercent)}% on this date`));
 await main.getByRole('button',{name:'Before',exact:true}).click();
 await checkFrame(190,expected,'before');assert.equal(await scene.getAttribute('data-available-percent'),beforeScene,'baseline unchanged');
 await main.getByRole('button',{name:'After',exact:true}).click();await checkFrame(190,expectedIrrigated);
 const cards=await main.getByTestId('soil-comparison').innerText();
 const g0=gradeScenario(weather('palouse'),base),g20=gradeScenario(weather('palouse'),{...base,irrigation:20});
 assert.match(cards,new RegExp(`${Math.round(g0.score.metrics.meanAvailable)}%.*${Math.round(g20.score.metrics.meanAvailable)}%`,'s'));
 assert.match(cards,new RegExp(`${g0.score.metrics.stressDays} days.*${g20.score.metrics.stressDays} days`,'s'));
 assert.match(await main.getByTestId('compare-score').innerText(),new RegExp(`${g0.score.total}\\s+${g20.score.total}`));
 await main.getByLabel('Ground cover',{exact:true}).selectOption('residue');
 await main.getByRole('button',{name:'Compare this change',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#visual-simulator .compare')?.textContent.includes('crop residue'));
 const ex0=gradeScenario(weather('palouse'),{...base,irrigation:20}).score.metrics.liquidExposed,ex1=gradeScenario(weather('palouse'),{...base,irrigation:20,cover:'residue'}).score.metrics.liquidExposed;
 assert.match(await main.getByTestId('compare-exposed').innerText(),new RegExp(`${Math.round(ex0)} mm\\s+${Math.round(ex1)} mm`));
 assert.equal(await scene.locator('.residue').count(),1);
 await main.getByLabel('Soil type',{exact:true}).selectOption('sandy');
 await main.getByRole('button',{name:'Compare this change',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid=soil-panel]')?.textContent.includes('of 42 mm plant-available'));
 await main.getByLabel('Crop type',{exact:true}).selectOption('potato');
 await main.getByLabel('Planting month',{exact:true}).selectOption('5');
 await main.getByLabel('Harvest month',{exact:true}).selectOption('9');
 await main.getByRole('button',{name:'Compare this change',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#visual-simulator .compare')?.textContent.includes('Potato, sandy soil, 20 mm/week, May–Sep'));
 // May–Sep season: Aug 1 is 60% through the assumed calendar → mid-season (50–80%).
 await main.getByRole('button',{name:'Jump to August'}).click();
 assert.equal(await scene.locator('.plant.potato').count(),6);assert.equal(await scene.getAttribute('data-stage'),'mid');
 assert.match(await main.getByTestId('stage-line').innerText(),/Potato: mid-season · stage from your season dates, not simulated growth/);
 // Season crossing New Year is labelled, not silently carried over.
 await main.getByLabel('Planting month',{exact:true}).selectOption('10');await main.getByLabel('Harvest month',{exact:true}).selectOption('7');
 assert.match(await main.locator('.field-note').innerText(),/not simulated/);
 await main.getByRole('button',{name:'Compare this change',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#visual-simulator .compare')?.textContent.includes('Oct–Jul'));
 await main.getByRole('button',{name:'Jump to January'}).click();
 assert.match(await main.getByTestId('panel-cautions').innerText(),/Planted in October 2022\. That autumn is not simulated/);
 await page.waitForFunction(()=>document.querySelector('[data-testid=score-total]')?.textContent==='Not scored');
 assert.match(await main.getByTestId('score-reasons').innerText(),/crosses New Year/);
 fs.mkdirSync('work',{recursive:true});
 await page.screenshot({path:'work/soil-desktop.png',fullPage:true});
 for(const width of [390,320,768]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
  assert.ok(await scene.evaluate(e=>e.getBoundingClientRect().width<=innerWidth));if(width===390)await page.screenshot({path:'work/soil-mobile.png',fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});
 await main.getByLabel('Net irrigation (mm/week)',{exact:true}).fill('');
 await main.getByRole('button',{name:'Compare this change',exact:true}).click();
 await main.getByRole('alert').waitFor();assert.match(await main.getByRole('alert').innerText(),/0 to 200/);
 await main.getByLabel('Net irrigation (mm/week)',{exact:true}).fill('0');
 await main.getByRole('button',{name:'Retry simulation'}).click();
 await page.waitForFunction(()=>!document.querySelector('#visual-simulator [role=alert]'));
 for(const location of ['yakima','skagit']){
  await main.getByLabel('Location',{exact:true}).selectOption(location);
  await page.waitForFunction(l=>document.querySelector('.farm-panel')?.dataset.run===`${l}-2023`,location);
  assert.equal(await main.getByTestId('soil-comparison').count(),0,'location changes cannot compare different weather');
  const sim=runSoilSimulation(weather(location),{...base,location,crop:'potato',soil:'sandy',planting:10,harvest:7,cover:'residue'});
  await slider.fill('150');await checkFrame(150,sim,location);
 }
 // Cross-location one-click demo must survive the location-reset effect.
 await main.getByRole('button',{name:'Try Demo',exact:true}).click();
 await slider.waitFor();
 assert.equal(await main.getByLabel('Location',{exact:true}).inputValue(),'palouse');
 assert.match(await main.getByTestId('soil-panel').innerText(),/of 120 mm plant-available/);
 // Demo: no irrigation vs. a labelled illustrative amount, on identical weather, Apr–Aug season.
 assert.match(await main.getByTestId('demo-story').innerText(),/The farm\..*The soil\..*illustrative 40 mm\/week.*The problem\..*An alternative we tested\..*Benefits and tradeoffs\./s);
 assert.match(await page.locator('#visual-simulator .compare').innerText(),/No irrigation: Spring wheat, loamy soil, 0 mm\/week, Apr–Aug.*Illustrative: Spring wheat, loamy soil, 40 mm\/week, Apr–Aug/s);
 const demoIrr=runSoilSimulation(weather('palouse'),{...base,irrigation:40}),overflowDay=demoIrr.days.findIndex(d=>d.irrigation>0&&d.drainage>0);
 await slider.fill(String(overflowDay));await checkFrame(overflowDay,demoIrr,'demo');
 assert.equal(await scene.getByTestId('overflow').count(),1,'storage overflow is drawn when added water exceeds capacity');
 assert.match(await main.getByTestId('panel-overflow').innerText(),/more than the soil could hold/);
 // Demo score story, calculated in Node: no irrigation vs. the illustrative amount.
 const demoA=analyzeFarm(weather('palouse'),{...base,irrigation:40}),demo0=gradeScenario(weather('palouse'),base).score.total;
 await page.waitForFunction(t=>document.querySelector('[data-testid=score-total]')?.textContent===t,`${demoA.score}/100`);
 assert.equal(await main.getByTestId('problem-title').innerText(),demoA.problem.title);
 assert.match(await main.getByTestId('compare-score').innerText(),new RegExp(`${demo0}\\s+${demoA.score}`));
 await page.waitForFunction(t=>document.querySelector('[data-testid=demo-story]')?.textContent.includes(t),`Score ${demoA.options.balanced.totalBefore} → ${demoA.options.balanced.totalAfter}`);
 // Save-water priority: a labelled tradeoff option, never presented as an unqualified improvement.
 await main.getByRole('radio',{name:'Save irrigation water'}).click();
 assert.match(await main.getByTestId('improve-action').innerText(),new RegExp(demoA.options.water.action.replace(/[()]/g,'.')));
 if(demoA.options.water.shortage.material)assert.match(await main.getByTestId('shortage-warning').innerText(),/not an unqualified improvement/);
 await main.getByRole('radio',{name:'Balanced'}).click();
 // The historical-year selector lives in the main experience; leap year works.
 await main.getByLabel('Historical weather year',{exact:true}).selectOption('2024');
 await page.waitForFunction(()=>document.querySelector('.farm-panel')?.dataset.run==='palouse-2024');
 assert.equal(await slider.getAttribute('max'),'365');
 await main.getByRole('button',{name:'Jump to March'}).click();
 assert.equal(await scene.getAttribute('data-date'),'2024-03-01');await main.getByRole('button',{name:'Previous day'}).click();assert.equal(await scene.getAttribute('data-date'),'2024-02-29');
 // Keyboard: slider arrows and buttons activate without a mouse.
 await slider.focus();await page.keyboard.press('ArrowRight');assert.equal(await scene.getAttribute('data-date'),'2024-03-01');
 await main.getByRole('button',{name:'Jump to June'}).focus();await page.keyboard.press('Enter');assert.equal(await scene.getAttribute('data-date'),'2024-06-01');
 // Footer documentation links resolve; the research archive still loads the earlier tools.
 const docs=await page.locator('footer nav a').evaluateAll(as=>as.map(a=>[a.textContent,a.href]));
 assert.deepEqual(docs.map(d=>d[0]),['NASA Data & Sources','How It Works','Scientific Limitations']);
 for(const [,href] of docs){const r=await page.request.get(href);assert.equal(r.status(),200,href);assert.match(await r.text(),/Back to the simulator/);}
 const research=await browser.newPage();await research.goto(new URL('research.html',url).href);
 await research.locator('#advanced-details > summary').click();await research.getByTestId('rain-value').waitFor();
 assert.equal(await research.locator('#visual-simulator').count(),0);await research.close();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 // Without reduced motion, a rainy day animates only while playing.
 const motion=await browser.newPage({viewport:{width:1200,height:900}});
 await motion.goto(url);await motion.getByRole('button',{name:'Try Demo',exact:true}).click();
 const ms=motion.locator('[data-testid=farm-scene]');await motion.getByRole('slider',{name:'Simulation day'}).fill('97');
 assert.equal(await motion.locator('.farm-scene.is-animated').count(),0,'paused frames are static');
 await motion.getByRole('button',{name:'Play simulation'}).click();await motion.waitForTimeout(150);
 assert.equal(await motion.locator('.farm-scene.is-animated').count(),1);await motion.getByRole('button',{name:'Pause simulation'}).click();
 assert.ok(await ms.getAttribute('data-date'));
 // Missing forcing and failed retrieval never turn into a guessed result; retry works.
 const failed=await browser.newPage();await failed.route('**/palouse/soil-weather.json',r=>r.abort());
 await failed.goto(url);
 await failed.locator('#visual-simulator [role=alert]').waitFor();
 assert.match(await failed.locator('.farm-empty').innerText(),/could not run/);
 assert.equal(await failed.locator('[data-testid=farm-scene]').count(),0);
 await failed.unroute('**/palouse/soil-weather.json');
 await failed.getByRole('button',{name:'Retry simulation'}).click();await failed.getByRole('slider',{name:'Simulation day'}).waitFor();
 // Late Palouse response after selecting another farm cannot show Palouse data there.
 const race=await browser.newPage();let release;const gate=new Promise(resolve=>release=resolve);
 await race.route('**/palouse/soil-weather.json',async r=>{await gate;await r.continue();});
 await race.goto(url);
 await race.getByLabel('Location',{exact:true}).selectOption('yakima');release();
 await race.waitForFunction(()=>document.querySelector('.farm-panel')?.dataset.run==='yakima-2023');await race.waitForTimeout(500);
 assert.equal(await race.locator('.farm-panel').getAttribute('data-run'),'yakima-2023','a late Palouse response never replaces the Yakima run');
 await browser.close();console.log('PASS farm scene: every checked frame equals an independent model run (date, water, flows, stress line, arrows, precipitation), month jump/day step/play-pause sync, freezing and drainage days, frozen baseline + before/after toggle, six inputs, wrapped season, leap day, all farms, reduced motion, 320/390/768px and desktop, score/problem/improvement equal Node analysis, apply/undo, Not scored season, demo score story, year selector, keyboard, docs links and research archive, error/retry, stale-request cancellation, no live data requests.');
})().catch(e=>{console.error(e);process.exit(1)});
