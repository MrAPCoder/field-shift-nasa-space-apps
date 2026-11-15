// Optional browser verification: uses an already available Playwright installation.
// No project dependency is added. See docs/M2_VERIFICATION.md.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page = await browser.newPage({viewport:{width:1440,height:1100}});
 const errors = [], nasa = [];
 page.on('pageerror', e => errors.push(e.message));
 page.on('console', m => {if(m.type()==='error')errors.push(m.text())});
 page.on('request', r => {if(r.url().includes('power.larc.nasa.gov'))nasa.push(r.url())});
 fs.mkdirSync('work', {recursive:true});
 await page.goto(new URL('research.html',process.env.PREVIEW_URL || 'http://127.0.0.1:4173/').href);
 await page.locator('#advanced-details > summary').click();
 await page.getByTestId('rain-value').waitFor();
 for(const [farm, rain, frost, hot] of [['skagit','1,323.3','247.4','0.6'],['yakima','321.5','195.8','37.9'],['palouse','731.7','152.2','14.0']]) {
   await page.locator('#farm').selectOption(farm);
   await page.waitForFunction(([rain]) => document.querySelector('[data-testid="rain-value"]')?.textContent.startsWith(rain),[rain]);
   assert.ok((await page.getByTestId('frost-value').innerText()).includes(frost));
   assert.ok((await page.getByTestId('hot-value').innerText()).includes(hot));
   await page.locator('.recharts-surface').nth(1).waitFor();
   assert.equal(await page.locator('.recharts-surface').count(),2);
   const expected = JSON.parse(fs.readFileSync(`public/data/${farm}/climate.json`));
   for(let i=0;i<2;i++) {
     const detail=page.locator('.data-table').nth(i); await detail.locator('summary').click();
     assert.equal(await detail.locator('tbody tr').count(),12);
     for(let m=0;m<12;m++) {
       const value=i ? expected.monthly[m].gwetroot_mean : expected.monthly[m].rainfall_normal_mm;
       const formatted=new Intl.NumberFormat('en-US',{maximumFractionDigits:i?3:1,minimumFractionDigits:i?3:1}).format(value);
       assert.equal(await detail.locator('tbody tr').nth(m).locator('td').first().innerText(),formatted);
     }
     await detail.locator('summary').click();
   }
 }
 for(const id of ['water','soil','income','erosion']) {
   const input=page.locator(`#priority-${id}`);await input.focus();await input.press('Home');assert.equal(await input.inputValue(),'0');
   await input.press('End');assert.equal(await input.inputValue(),'10');
   await input.press('ArrowLeft');assert.equal(await input.inputValue(),'9');
   assert.match(await page.locator(`output[for="priority-${id}"]`).innerText(),/^9/);
 }
 await page.locator('#farm').selectOption('skagit');
 await page.waitForFunction(()=>document.querySelector('[data-testid="rain-value"]')?.textContent.startsWith('1,323.3'));
 assert.equal(await page.locator('#priority-water').inputValue(),'9');
 await page.screenshot({path:'work/m2-desktop.png',fullPage:true});
 for (const width of [390,320,768]) {
   await page.setViewportSize({width,height:844});await page.waitForTimeout(200);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`overflow at ${width}`);
   await page.locator('.recharts-surface').nth(1).waitFor();
   assert.equal(await page.locator('.recharts-surface').count(),2);
   if(width===390)await page.screenshot({path:'work/m2-mobile.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(nasa,[]);
 // A failed cache load exposes a usable retry; no stale location statistics.
 await page.route('**/data/yakima/climate.json',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.locator('#farm').selectOption('yakima');await page.getByRole('alert').waitFor();
 assert.equal(await page.getByTestId('rain-value').count(),0);
 await page.unroute('**/data/yakima/climate.json');await page.getByRole('button',{name:'Try again'}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid="rain-value"]')?.textContent.startsWith('321.5'));
 // Delay an old request, select another farm, and ensure it never overwrites it.
 await page.route('**/data/skagit/climate.json',async route=>{await new Promise(r=>setTimeout(r,500));await route.continue().catch(()=>{});});
 await page.locator('#farm').selectOption('skagit');await page.locator('#farm').selectOption('palouse');
 await page.waitForFunction(()=>document.querySelector('[data-testid="rain-value"]')?.textContent.startsWith('731.7'));
 await page.waitForTimeout(700);assert.ok((await page.getByTestId('rain-value').innerText()).includes('731.7'));
 await page.unroute('**/data/skagit/climate.json');
 const missing = JSON.parse(fs.readFileSync('public/data/skagit/climate.json'));
 missing.summary.mean_hot_days = null;
 missing.monthly[0].rainfall_normal_mm = null;
 missing.monthly[0].gwetroot_mean = null;
 await page.route('**/data/skagit/climate.json', route => route.fulfill({json:missing}));
 await page.locator('#farm').selectOption('skagit');
 await page.waitForFunction(()=>document.querySelector('[data-testid="hot-value"]')?.textContent==='Unavailable');
 await page.locator('.data-table').first().locator('summary').click();
 assert.equal(await page.locator('.data-table').first().locator('tbody tr').first().locator('td').first().innerText(),'Unavailable');
 assert.deepEqual(nasa,[]);
 assert.equal(errors.filter(e=>!e.includes('503')).length,0,'Only the deliberately simulated 503 may log a resource error');
 console.log('PASS: 3 farm indicators; 72 monthly displayed values; charts; four keyboard sliders 0–10; preference retention; desktop and 320/390/768px layouts; no runtime errors or NASA requests; HTTP failure/retry; stale-request cancellation; missing-value display.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
