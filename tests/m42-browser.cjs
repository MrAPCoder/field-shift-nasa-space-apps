// Uses existing Playwright. Every entered percentage is an explicitly synthetic test assumption.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('request',r=>{if(/power\.larc|sdmdataaccess/.test(r.url()))external.push(r.url());});
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4173/');
 await page.locator('#advanced-details > summary').click();
 for(const farm of ['skagit','yakima','palouse']){
  await page.locator('#farm').selectOption(farm);
  const soil=page.getByRole('region',{name:'USDA soil survey context'});
  assert.match(await soil.innerText(),/Soil characteristics unavailable/);
  assert.match(await soil.innerText(),/403 Forbidden/);
  await soil.getByText('Soil source and retrieval details',{exact:true}).click();
  assert.equal(await soil.getByRole('link',{name:'Saved USDA query and response receipt'}).getAttribute('href'),`./data/${farm}/soil-source.json`);
  await soil.getByText('Soil source and retrieval details',{exact:true}).click();
 }
 await page.locator('#farm').selectOption('skagit');
 await page.getByRole('button',{name:/Try the Palouse demo/}).click();
 await page.waitForFunction(()=>document.querySelector('#current-rotation')?.value==='palouse-current');
 assert.equal(await page.locator('.comparison-summary tbody tr').count(),3);
 const card=page.getByTestId('rotation-card').first();
 await card.locator('.crop-evidence summary').click();
 assert.match(await card.locator('.crop-evidence').innerText(),/450–650 mm/);
 assert.match(await card.locator('.crop-evidence').innerText(),/1.5–1.8 m/);
 assert.match(await card.locator('.crop-evidence').innerText(),/Review pending/);
 assert.equal(await card.locator('.rotation-total strong').innerText(),'Not scored');
 await card.locator('.crop-evidence summary').click();
 const editor=card.locator('.management-calendar');await editor.locator('summary').click();
 await editor.getByLabel('Field and actual years, or scenario description').fill('SYNTHETIC M4.2 scenario — no observed farm data');
 await editor.getByLabel('Confirmed by',{exact:true}).fill('Automated test');
 await editor.getByRole('combobox',{name:'Range ends',exact:true}).selectOption('11');
 await editor.getByRole('combobox',{name:'Range status',exact:true}).selectOption('cash');
 await editor.getByRole('button',{name:'Preview range edit'}).click();
 assert.match(await editor.getByRole('alert').innerText(),/explicit exposure/);
 await editor.getByLabel('Range exposed soil (%)',{exact:true}).fill('25');
 await editor.getByRole('button',{name:'Preview range edit'}).click();
 assert.equal(await editor.locator('.calendar-month select').first().inputValue(),'unknown');
 assert.ok(await editor.getByRole('button',{name:'Apply reviewed changes'}).isDisabled());
 const apply=async()=>{await editor.getByLabel('I reviewed these replacements and their assumptions.').check();await editor.getByRole('button',{name:'Apply reviewed changes'}).click();};
 await apply();
 assert.equal(await editor.locator('.calendar-month input').first().inputValue(),'25');
 assert.ok(await editor.getByRole('button',{name:'Confirm complete calendar'}).isDisabled());
 for(const target of ['2','3']){
  await editor.getByRole('combobox',{name:'Copy to year',exact:true}).selectOption(target);
  await editor.getByRole('button',{name:'Preview year copy'}).click();
  assert.match(await editor.locator('.bulk-preview').innerText(),/12 months would change/);
  await apply();
 }
 assert.match(await card.getByTestId('rainfall-overlap').innerText(),/Exposure unavailable/);
 await editor.getByRole('button',{name:'Confirm complete calendar'}).click();
 assert.equal(await card.locator('.rotation-total strong').innerText(),'75.0 / 100');
 assert.match(await card.innerText(),/Exposure-only index/);
 // An unapplied preview cannot affect a score. Applying reviewed edits revokes confirmation.
 await editor.getByRole('combobox',{name:'Range status',exact:true}).selectOption('bare');
 await editor.getByRole('button',{name:'Preview range edit'}).click();
 assert.equal(await card.locator('.rotation-total strong').innerText(),'75.0 / 100');
 await apply();assert.equal(await card.locator('.rotation-total strong').innerText(),'Not scored');
 await editor.getByRole('button',{name:'Confirm complete calendar'}).click();
 assert.equal(await card.locator('.rotation-total strong').innerText(),'50.0 / 100');
 // A later manual edit cancels a stale bulk preview.
 await editor.getByRole('button',{name:'Preview year copy'}).click();
 await editor.locator('.calendar-month select').first().selectOption('unknown');
 assert.equal(await editor.locator('.bulk-preview').count(),0);
 assert.equal(await card.locator('.rotation-total strong').innerText(),'Not scored');
 await card.getByRole('button',{name:'View printable plan'}).click();
 const plan=page.getByRole('region',{name:'Printable three-year rotation plan'});
 assert.match(await plan.innerText(),/No overall index is available/);
 assert.match(await plan.innerText(),/Soil characteristics unavailable/);
 assert.match(await plan.innerText(),/450–650 mm/);
 assert.match(await plan.innerText(),/Review pending/);
 assert.match(await plan.innerText(),/Planting: Unknown/);
 fs.mkdirSync('work',{recursive:true});
 await page.emulateMedia({media:'print'});
 await page.pdf({path:'work/m42-plan.pdf',format:'A4',printBackground:true});
 await page.emulateMedia({media:'screen'});
 await plan.getByRole('button',{name:'Close print view'}).click();
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  await editor.locator('.calendar-tools').scrollIntoViewIfNeeded();
  await page.screenshot({path:`work/m42-editor-${width}.png`});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await browser.close();
 console.log('PASS M4.2: soil failure provenance, evidence ranges, pending approval, Palouse entry, range/copy preview and review, confirmation invalidation, stale preview cancellation, dynamic print/PDF, responsive controls, no runtime errors or external data requests.');
})().catch(e=>{console.error(e);process.exit(1)});
