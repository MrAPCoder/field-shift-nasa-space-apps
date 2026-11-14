// Existing Playwright only. Synthetic calendar inputs are never real farm observations.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],nasa=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('request',r=>{if(r.url().includes('power.larc.nasa.gov'))nasa.push(r.url())});
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4173/');
 for(const farm of ['skagit','yakima','palouse']){
  await page.locator('#farm').selectOption(farm);
  await page.waitForFunction(f=>document.querySelector('#current-rotation')?.value===`${f}-current`,farm);
  const cards=page.getByTestId('rotation-card');assert.equal(await cards.count(),3);
  const expected=JSON.parse(fs.readFileSync(`public/data/${farm}/climate.json`));
  for(const card of await cards.all()){
   assert.equal(await card.locator('.rainfall-month').count(),36);
   assert.match(await card.getByTestId('rainfall-overlap').innerText(),/Exposure unavailable/);
   assert.equal(await card.locator('.exposure-highlight').count(),0);
   const cells=card.locator('.rainfall-month');
   for(let i=0;i<36;i++){
    const rain=new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:1}).format(expected.monthly[i%12].rainfall_normal_mm);
    assert.ok((await cells.nth(i).innerText()).includes(`Rain: ${rain} mm`));
   }
  }
  await cards.first().getByRole('button',{name:'View printable plan'}).click();
  const plan=page.getByRole('region',{name:'Printable three-year rotation plan'});
  await plan.waitFor();assert.ok((await plan.innerText()).includes(expected.farm.name));
  assert.match(await plan.innerText(),/Planting: Unknown/);assert.match(await plan.innerText(),/Harvest: Unknown/);
  assert.match(await plan.innerText(),/does not replace agricultural experts, field measurements/);
  assert.equal(await plan.locator('.rainfall-month').count(),36);
  assert.equal(await plan.locator('.plan-sources a[href^="https://"]').count()>0,true);
  await plan.getByRole('button',{name:'Close print view'}).click();
 }
 const card=page.getByTestId('rotation-card').first(),editor=card.locator('.management-calendar');
 await editor.locator('summary').click();
 await editor.getByLabel('Field and actual years, or scenario description').fill('SYNTHETIC M4 TEST — not a real farm observation');
 await editor.getByLabel('Confirmed by',{exact:true}).fill('Automated test');
 for(let i=0;i<36;i++){
  await editor.locator('.calendar-month select').nth(i).selectOption(i%3===0?'bare':i%3===1?'cover':'cash');
  if(i%3!==0)await editor.locator('.calendar-month input').nth(i).fill('25');
 }
 assert.match(await card.getByTestId('rainfall-overlap').innerText(),/Exposure unavailable/);
 await editor.getByRole('button',{name:'Confirm complete calendar'}).click();
 const expected=JSON.parse(fs.readFileSync('public/data/palouse/climate.json')).monthly;
 const annual=expected.reduce((s,r)=>s+r.rainfall_normal_mm,0);
 const numerator=expected.reduce((s,r,i)=>s+r.rainfall_normal_mm*(i%3===0?1:.25),0);
 const pct=new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:1}).format(100*numerator/annual);
 assert.equal(await card.getByTestId('rainfall-overlap').locator(':scope > strong').innerText(),`${pct}%`);
 assert.match(await card.getByTestId('rainfall-overlap').innerText(),/overlaps with the field’s estimated exposed-soil conditions/);
 assert.ok(await card.locator('.exposure-highlight').count()>=9);
 await editor.locator('summary').click();
 await card.getByRole('button',{name:'View printable plan'}).click();
 const plan=page.getByRole('region',{name:'Printable three-year rotation plan'});
 assert.ok((await plan.innerText()).includes(`${pct}%`));
 assert.match(await plan.innerText(),/Proposed scenario — farmer assumptions/);
 await page.evaluate(()=>{window.__printCalls=0;window.print=()=>window.__printCalls++;});
 await plan.getByRole('button',{name:'Print this plan'}).click();assert.equal(await page.evaluate(()=>window.__printCalls),1);
 fs.mkdirSync('work',{recursive:true});
 await page.emulateMedia({media:'print'});
 assert.equal(await page.locator('.rotation-grid').isVisible(),false);
 assert.equal(await page.locator('.topbar').isVisible(),false);
 assert.equal(await plan.isVisible(),true);
 assert.equal(await plan.locator('.plan-actions').isVisible(),false);
 await page.pdf({path:'work/m4-plan-test.pdf',format:'A4',printBackground:true});
 await page.screenshot({path:'work/m4-print.png',fullPage:true});
 await page.emulateMedia({media:'screen'});
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await plan.scrollIntoViewIfNeeded();
  if(width===390)await page.screenshot({path:'work/m4-mobile.png'});
  if(width===1440)await page.screenshot({path:'work/m4-desktop.png'});
 }
 await plan.getByRole('button',{name:'Close print view'}).click();
 await editor.locator('summary').click();await editor.locator('.calendar-month select').first().selectOption('unknown');
 assert.match(await card.getByTestId('rainfall-overlap').innerText(),/Exposure unavailable/);
 await card.getByRole('button',{name:'View printable plan'}).click();assert.match(await plan.innerText(),/Unconfirmed draft/);
 assert.match(await plan.getByTestId('rainfall-overlap').innerText(),/Exposure unavailable/);
 await plan.getByRole('button',{name:'Close print view'}).click();
 // Every card prints its own rotation, independent of the comparison baseline.
 const alternatives=page.getByTestId('rotation-card');
 const name=await alternatives.nth(1).locator('h3').first().innerText();
 await alternatives.nth(1).getByRole('button',{name:'View printable plan'}).click();assert.ok((await plan.innerText()).includes(name));
 await page.locator('#farm').selectOption('skagit');await page.waitForFunction(()=>document.querySelector('#current-rotation')?.value==='skagit-current');
 assert.equal(await plan.count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(nasa,[]);
 await browser.close();console.log('PASS M4: nine visual calendars, 324 NASA month values, three-farm incomplete plans, partial exposure calculation, highlights, print selection and browser print invocation, print CSS/PDF, desktop/mobile, edit invalidation, no runtime errors or NASA requests.');
})().catch(e=>{console.error(e);process.exit(1)});
