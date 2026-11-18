const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:false});
 try{
  const context=await browser.newContext(),page=await context.newPage();
  await page.goto('http://127.0.0.1:5178/tests/suporte-background.html');
  await page.locator('body[data-ready="1"]').waitFor();
  // Use duas abas de uma janela real (Xvfb no CI), sem redefinir document.visibilityState.
  const outra=await context.newPage();await outra.bringToFront();
  try{await page.getByText('PASSOU: execução única com aba realmente oculta.',{exact:true}).waitFor({timeout:10000});}catch(e){console.error(await page.locator('body').innerText());throw e;}
  const evidence=JSON.parse(await page.locator('#resultado').innerText());
  assert.equal(evidence.efeitos,1);assert.equal(evidence.resultado.estado,'concluida');
  assert.ok(evidence.chamadas.length>=6);assert.ok(evidence.chamadas.every(c=>c.visibilidade==='hidden'));
  console.log(JSON.stringify({ok:true,realLifecycle:true,...evidence}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
