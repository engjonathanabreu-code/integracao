const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.TEST_CHROMIUM?{executablePath:process.env.TEST_CHROMIUM}:{})});
 try{
  const context=await browser.newContext();
  await context.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
  await context.route('**/tests/cadastro-transporte.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Retomada de transporte isolada</title>'}));
  const page=await context.newPage();
  await page.goto((process.env.BROWSER_TEST_ORIGIN||'http://127.0.0.1:5178')+'/tests/cadastro-transporte.html');
  const result=await page.evaluate(async()=>{const {verificarRetomadaCadastro}=await import('/tests/cadastro-transporte-fixture.js');return verificarRetomadaCadastro();});
  const {esperado}=await import('./cadastro-transporte-fixture.js');
  assert.deepEqual(result,esperado);
  console.log(JSON.stringify({ok:true,indexedDBReal:true,provedoresSimulados:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
