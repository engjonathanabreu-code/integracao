const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
// Playwright 1.57 has no public opt-out from its per-session focus emulation.
// Disable only that automation override on the ORIGINAL protocol session.
// A separate CDPSession cannot release the original session's Chromium capturer.
// Do not mock document.visibilityState or the executor/environment predicate.
const core=path.dirname(require.resolve('playwright-core/package.json'));
const {CRSession}=require(path.join(core,'lib/server/chromium/crConnection.js'));
const originalSend=CRSession.prototype.send;let overridesRemoved=0;
CRSession.prototype.send=function(method,params,...rest){
 if(method==='Emulation.setFocusEmulationEnabled'&&params?.enabled===true){
  overridesRemoved++;params={...params,enabled:false};
 }
 return originalSend.call(this,method,params,...rest);
};
(async()=>{
 let browser;
 try{
  browser=await chromium.launch({headless:false});
  const context=await browser.newContext(),page=await context.newPage();
  await page.goto('http://127.0.0.1:5178/tests/suporte-background.html');
  await page.locator('body[data-ready="1"]').waitFor();
  await page.bringToFront();
  assert.equal(await page.evaluate(()=>document.visibilityState),'visible');
  const outra=await context.newPage();await outra.bringToFront();
  assert.ok(overridesRemoved>=1,'o harness deve remover a emulação na sessão original');
  await page.waitForFunction(()=>document.visibilityState==='hidden',null,{polling:100,timeout:10000});
  try{await page.waitForFunction(()=>document.querySelector('#estado').textContent==='PASSOU: execução única com aba realmente oculta.',null,{polling:100,timeout:10000});}catch(e){console.error(await page.locator('body').innerText());throw e;}
  const evidence=JSON.parse(await page.locator('#resultado').innerText());
  assert.equal(evidence.efeitos,1);assert.equal(evidence.resultado.estado,'concluida');
  assert.ok(evidence.chamadas.length>=6);assert.ok(evidence.chamadas.every(c=>c.visibilidade==='hidden'));
  await page.bringToFront();
  await page.waitForFunction(()=>document.visibilityState==='visible',null,{polling:100,timeout:10000});
  assert.equal(JSON.parse(await page.locator('#resultado').innerText()).efeitos,1);
  console.log(JSON.stringify({ok:true,realLifecycle:true,overridesRemoved,transition:['visible','hidden','visible'],...evidence}));
 }finally{if(browser)await browser.close();CRSession.prototype.send=originalSend;}
})().catch(e=>{console.error(e);process.exitCode=1;});
