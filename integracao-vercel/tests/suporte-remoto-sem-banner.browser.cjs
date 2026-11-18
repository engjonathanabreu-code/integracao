const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Exercise the real React component with an isolated executor, never a live account.
  await page.route('**/src/suporte-remoto-api.js',r=>r.fulfill({contentType:'application/javascript',body:'export const SUPORTE_REMOTO_HABILITADO=true;'}));
  await page.route('**/src/suporte-remoto-executor.js',r=>r.fulfill({contentType:'application/javascript',body:`
   window.executorFixture={passos:0,fechados:0,atualizacoes:0};
   export function criarExecutorSuporte(options){window.executorFixture.avisar=options.onAtualizacao;return {passo:async()=>{window.executorFixture.passos++;},fechar:()=>window.executorFixture.fechados++};}
   export async function atualizarSuporteComSeguranca(){window.executorFixture.atualizacoes++;return false;}
  `}));
  await page.goto('http://127.0.0.1:5178/tests/suporte-remoto-sem-banner.html');
  await page.waitForFunction(()=>executorFixture.passos===1);
  assert.equal(await page.locator('#root').innerText(),'','worker ativo sem aviso permanente');
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForFunction(()=>executorFixture.passos===2);
  await page.evaluate(()=>executorFixture.avisar());
  await page.getByRole('button',{name:'Agora não'}).click();
  assert.equal(await page.getByRole('status').count(),0,'dispensa preservada');
  await page.evaluate(()=>executorFixture.avisar());
  await page.getByRole('button',{name:'Verificar e atualizar'}).click();
  await page.getByText('Não foi possível confirmar um ponto seguro para atualizar.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>executorFixture.atualizacoes),1,'atualização mantém guarda segura');
  await page.evaluate(()=>renderizarExecutor('outra-conta'));
  await page.waitForFunction(()=>executorFixture.fechados===1&&executorFixture.passos===3);
  assert.equal(await page.getByRole('status').count(),0,'troca de conta descarta aviso anterior');
  assert.equal(await page.getByRole('note',{name:'Suporte de sincronização'}).count(),0);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(JSON.stringify({ok:true,desktopEMobile:true,executorAtivo:true,atualizacaoExplicitaPreservada:true,trocaDeConta:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
