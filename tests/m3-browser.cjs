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
 await page.locator('#advanced-details > summary').click();
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
 assert.match(await page.locator('.rotation-section > .soft-note').first().innerText(),/All priority weights are zero/);
 await page.locator('#priority-water').press('End');
 assert.match(await page.locator('.weight-summary').innerText(),/Water 10\/10/);
 assert.match(await page.locator('.rotation-card').first().innerText(),/Published sequence approved/);
 // SYNTHETIC browser inputs only: never published as farm observations.
 await page.locator('#current-rotation').selectOption('palouse-current');
 await page.locator('#priority-erosion').press('End');
 const cards=page.getByTestId('rotation-card');
 for(let c=0;c<3;c++){
  const card=cards.nth(c),calendar=card.locator('.management-calendar');
  await calendar.locator('summary').click();
  const status=calendar.locator('.calendar-month select'),exposure=calendar.locator('.calendar-month input');
  assert.equal(await status.count(),36);
  for(let m=0;m<36;m++){assert.equal(await status.nth(m).inputValue(),'unknown');assert.equal(await exposure.nth(m).inputValue(),'');}
  await calendar.getByLabel('Field and actual years, or scenario description').fill('SYNTHETIC browser test scenario');
  await calendar.getByLabel('Confirmed by',{exact:true}).fill('Automated test fixture');
  for(let m=0;m<36;m++)await status.nth(m).selectOption('cash');
  assert.ok(await calendar.getByRole('button',{name:'Confirm complete calendar'}).isDisabled());
  assert.equal(await card.getByTestId('exposure-result').count(),0);
  for(let m=0;m<36;m++)await exposure.nth(m).fill(String([50,25,75][c]));
  await calendar.getByRole('button',{name:'Confirm complete calendar'}).click();
  assert.match(await card.getByTestId('exposure-result').innerText(),/Scenario estimate/);
  assert.equal(await card.locator('.rotation-total strong').innerText(),`${[50,75,25][c]}.0 / 100`);
  assert.match(await card.locator('.subscores').innerText(),/Provisional soil-management practice index\s+Not scored/);
  await calendar.locator('summary').click();
 }
 // Other priorities cannot change an erosion-only total.
 for(const id of ['water','soil','income'])await page.locator(`#priority-${id}`).press('End');
 assert.equal(await cards.first().locator('.rotation-total strong').innerText(),'50.0 / 100');
 await page.locator('#priority-erosion').press('Home');
 assert.equal(await cards.first().locator('.rotation-total strong').innerText(),'Not scored');
 assert.equal(await cards.first().getByTestId('exposure-result').count(),1);
 await page.locator('#priority-erosion').press('End');
 const first=cards.first(),calendar=first.locator('.management-calendar');
 await calendar.locator('summary').click();
 await calendar.locator('.calendar-month select').first().selectOption('unknown');
 assert.equal(await first.getByTestId('exposure-result').count(),0);
 assert.equal(await calendar.locator('.calendar-month input').first().inputValue(),'');
 assert.ok(await calendar.getByRole('button',{name:'Confirm complete calendar'}).isDisabled());
 await calendar.locator('.calendar-month select').first().selectOption('cash');
 await calendar.locator('.calendar-month input').first().fill('50');
 assert.equal(await first.getByTestId('exposure-result').count(),0);
 await calendar.getByLabel('Calendar describes').selectOption('observed');
 await calendar.getByRole('button',{name:'Confirm complete calendar'}).click();
 assert.match(await first.getByTestId('exposure-result').innerText(),/Farmer-reported management estimate/);
 // Farm switching retains separate calendars; an unapproved farm does not inherit scores.
 await page.locator('#farm').selectOption('yakima');
 await page.waitForFunction(()=>document.querySelector('#current-rotation')?.value==='yakima-current');
 assert.equal(await page.getByTestId('exposure-result').count(),0);
 await page.locator('#farm').selectOption('palouse');
 await page.waitForFunction(()=>document.querySelector('#current-rotation')?.value==='palouse-current');
 assert.equal(await page.getByTestId('exposure-result').count(),3);
 await page.getByTestId('rotation-card').first().locator('.management-calendar summary').click();
 for(const width of [390,320,768]){
  await page.setViewportSize({width,height:844});
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`open calendar overflow at ${width}`);
 }
 await page.screenshot({path:'work/m3-calendar-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.reload(); await page.locator('#advanced-details > summary').click();
 await page.locator('#farm').selectOption('palouse');
 await page.waitForFunction(()=>document.querySelector('#current-rotation')?.value==='palouse-current');
 assert.equal(await page.getByTestId('exposure-result').count(),0);
 await page.locator('#priority-water').press('End');
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
 await browser.close();console.log('PASS: all farms, 3 cards each, five evidence sections, baseline selection/reset, live slider importance, zero-weight handling, preserved climate charts, three confirmed synthetic scenario scores, unknown/exposure gates, edit invalidation, observed/proposed provenance, farm retention and reload reset, erosion-only weighting, 320/390/768px open calendar layouts, no console errors or NASA requests.');
})().catch(e=>{console.error(e);process.exit(1)});
