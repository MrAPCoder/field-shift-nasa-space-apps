// Optional browser integration test. Uses preinstalled Playwright, not a new dependency.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],nasa=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('request',r=>{if(r.url().includes('power.larc.nasa.gov'))nasa.push(r.url())});
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4173/');
 for(const farm of ['skagit','yakima','palouse']){
  await page.locator('#farm').selectOption(farm);
  await page.waitForFunction(id=>document.querySelector('#current-rotation')?.value===`${id}-current`,farm);
  assert.equal(await page.getByTestId('rotation-card').count(),3);
  await page.locator('.recharts-surface').nth(1).waitFor();assert.equal(await page.locator('.recharts-surface').count(),2);
  for(const card of await page.getByTestId('rotation-card').all()){
   for(const title of ['Why','Evidence','Benefits','Data gaps','Risks to check locally'])assert.equal(await card.getByRole('heading',{name:title,exact:true}).count(),1);
   assert.equal(await card.locator('.rotation-total strong').innerText(),'Not scored');
   assert.match(await card.locator('.subscores').innerText(),/Extra income\s+Not scored yet/);
   assert.ok(await card.locator('a[href^="https://"]').count()>0);
  }
  await page.locator('#current-rotation').selectOption(`${farm}-alternative-a`);
  const names=JSON.parse(fs.readFileSync('data/rotations.json')).rotations;
  assert.equal(await page.getByTestId('rotation-card').first().locator('h3').innerText(),names.find(r=>r.id===`${farm}-alternative-a`).name);
 }
 for(const id of ['water','soil','income','erosion']){await page.locator(`#priority-${id}`).press('Home');}
 assert.match(await page.locator('.rotation-section > .soft-note').innerText(),/All priority weights are zero/);
 await page.locator('#priority-water').press('End');
 assert.match(await page.locator('.weight-summary').innerText(),/Water 10\/10/);
 assert.match(await page.locator('.rotation-card').first().innerText(),/awaiting review/);
 await page.locator('#farm').selectOption('skagit');await page.waitForFunction(()=>document.querySelector('#current-rotation')?.value==='skagit-current');
 assert.equal(await page.locator('#priority-water').inputValue(),'10');
 fs.mkdirSync('work',{recursive:true});
 await page.locator('#rotation-title').scrollIntoViewIfNeeded();await page.screenshot({path:'work/m3-desktop.png',fullPage:false});
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(200);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
  if(width===390)await page.screenshot({path:'work/m3-mobile.png',fullPage:false});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(nasa,[]);
 await browser.close();console.log('PASS: all farms, 3 cards each, five evidence sections, baseline selection/reset, live slider importance, zero-weight handling, preserved climate charts, pending-review scores, 320/390px layouts, no console errors or NASA requests.');
})().catch(e=>{console.error(e);process.exit(1)});
