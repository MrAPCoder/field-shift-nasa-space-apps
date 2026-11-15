// Daily model UI integration, existing Playwright only; no project dependency.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/power\.larc|usda\.gov|earthdata\.nasa/.test(r.url()))external.push(r.url());});
 const url=process.env.PREVIEW_URL||'http://127.0.0.1:4173/';
 await page.goto(url);const main=page.locator('#visual-simulator');
 assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('#advanced-details').getAttribute('open'),null);
 await main.getByRole('button',{name:'Try the Palouse demo',exact:true}).click();
 await main.getByRole('slider',{name:'Simulation day'}).waitFor();
 assert.equal(await main.locator('.water-chart').count(),1);
 assert.match(await main.locator('.soil-reading').innerText(),/120 mm capacity/);
 await main.getByRole('slider').fill('190');
 const beforeValue=await main.locator('.soil-reading').innerText();
 const beforePath=await main.locator('.water-chart path').first().getAttribute('d');
 await main.getByLabel('Net irrigation (mm/week)',{exact:true}).fill('20');
 await main.getByRole('status').waitFor();
 assert.equal(await main.locator('.soil-reading').innerText(),beforeValue,'edits do not relabel old results as new');
 await main.getByRole('button',{name:'Run comparison',exact:true}).click();
 await main.getByTestId('soil-comparison').waitFor();
 assert.equal(await main.locator('.water-chart path').count(),2);
 assert.equal(await main.locator('.water-chart path').first().getAttribute('d'),beforePath,'baseline remains unchanged');
 assert.notEqual(await main.locator('.water-chart path').nth(1).getAttribute('d'),beforePath,'irrigation changes actual trajectory');
 assert.match(await main.getByTestId('soil-comparison').innerText(),/64.5%.*84.3%/s);
 await main.getByLabel('Ground cover',{exact:true}).selectOption('residue');
 await main.getByRole('button',{name:'Run comparison',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.scenario-pair')?.textContent.includes('Crop residue'));
 assert.match(await main.getByTestId('soil-comparison').innerText(),/491.*147.3/s);
 await main.getByLabel('Soil type',{exact:true}).selectOption('sandy');
 await main.getByRole('button',{name:'Run comparison',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.soil-reading')?.textContent.includes('42 mm capacity'));
 await main.getByLabel('Crop type',{exact:true}).selectOption('potato');
 await main.getByLabel('Planting month',{exact:true}).selectOption('5');
 await main.getByLabel('Harvest month',{exact:true}).selectOption('9');
 await main.getByRole('button',{name:'Run comparison',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.scenario-pair')?.textContent.includes('Potato, sandy, 20 mm/week, May–Sep'));
 await main.getByRole('slider').fill('170');
 await main.getByRole('button',{name:'Play simulation',exact:true}).click();
 await page.waitForTimeout(350);
 await main.getByRole('button',{name:'Pause simulation',exact:true}).click();
 assert.ok(Number(await main.getByRole('slider').inputValue())>170);
 fs.mkdirSync('work',{recursive:true});
 await page.screenshot({path:'work/soil-desktop.png',fullPage:true});
 for(const width of [390,320,768]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);if(width===390)await page.screenshot({path:'work/soil-mobile.png',fullPage:true});}
 await main.getByLabel('Net irrigation (mm/week)',{exact:true}).fill('');
 await main.getByRole('button',{name:'Run comparison',exact:true}).click();
 await main.getByRole('alert').waitFor();assert.match(await main.getByRole('alert').innerText(),/0 to 200/);
 await main.getByLabel('Net irrigation (mm/week)',{exact:true}).fill('0');
 await main.getByRole('button',{name:'Retry simulation'}).click();
 await page.waitForFunction(()=>!document.querySelector('#visual-simulator [role=alert]'));
 for(const location of ['yakima','skagit']){
  await main.getByLabel('Location',{exact:true}).selectOption(location);
  await main.getByRole('button',{name:'Run simulation',exact:true}).click();
  await main.getByRole('slider').waitFor();
  assert.equal(await main.getByTestId('soil-comparison').count(),0,'location changes cannot compare different weather');
 }
 // Cross-location one-click demo must survive the location-reset effect.
 await main.getByRole('button',{name:'Try the Palouse demo',exact:true}).click();
 await main.getByRole('slider').waitFor();
 assert.equal(await main.getByLabel('Location',{exact:true}).inputValue(),'palouse');
 assert.match(await main.locator('.soil-reading').innerText(),/120 mm capacity/);
 await page.locator('#advanced-details > summary').click();
 await page.getByLabel('Historical weather year',{exact:true}).selectOption('2024');
 await main.getByRole('button',{name:'Run simulation',exact:true}).click();
 await main.getByRole('slider').waitFor();
 assert.equal(await main.getByRole('slider').getAttribute('max'),'365');
 assert.equal(await page.locator('#soil-methods .water-chart').count(),1);
 assert.match(await page.locator('#soil-methods').innerText(),/SMAP SPL3SMP v9: unavailable/);
 await page.getByTestId('rain-value').waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 // Missing forcing and failed retrieval never turn into a guessed result; retry works.
 const failed=await browser.newPage();await failed.route('**/palouse/soil-weather.json',r=>r.abort());
 await failed.goto(url);await failed.getByRole('button',{name:'Try the Palouse demo',exact:true}).click();
 await failed.locator('#visual-simulator [role=alert]').waitFor();
 assert.equal(await failed.locator('#visual-simulator .water-chart').count(),0);
 await failed.unroute('**/palouse/soil-weather.json');
 await failed.getByRole('button',{name:'Retry simulation'}).click();await failed.getByRole('slider',{name:'Simulation day'}).waitFor();
 // Late Palouse response after selecting another farm cannot show Palouse data there.
 const race=await browser.newPage();let release;const gate=new Promise(resolve=>release=resolve);
 await race.route('**/palouse/soil-weather.json',async r=>{await gate;await r.continue();});
 await race.goto(url);await race.getByRole('button',{name:'Try the Palouse demo',exact:true}).click();
 await race.getByLabel('Location',{exact:true}).selectOption('yakima');release();await race.waitForTimeout(500);
 assert.equal(await race.locator('#visual-simulator .water-chart').count(),0);
 await browser.close();console.log('PASS soil UI: six inputs, calculated irrigation/cover/soil changes, immutable baseline, playback, all farms, year/reset, error/retry, stale-request cancellation, 320/390/768px and desktop, no live data requests.');
})().catch(e=>{console.error(e);process.exit(1)});
