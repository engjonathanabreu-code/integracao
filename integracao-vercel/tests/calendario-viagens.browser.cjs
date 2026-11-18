const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage({timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  await page.clock.setFixedTime(new Date('2026-11-18T15:00:00Z'));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto((process.env.BROWSER_TEST_ORIGIN||'http://127.0.0.1:5178')+'/tests/browser.html');
  await page.evaluate(()=>{
   const b=window.baseFixture;b.erp_agendas=[{id:'ee6fe017-981f-406a-9813-0eea37877543',nome:'HB20',cor:'#2563b8'}];b.erp_eventos=[];
   window.viagensFixture=[{solicitacao_id:'viagem-teste',veiculo_id:'hb20',solicitante_id:b.profiles[0].id,solicitante_nome:'Ana Fixture',inicio:'2026-11-18',fim:'2026-11-20',status:'ativo'}];
   window.viagensReads=0;window.viagensFail=false;const original=window.fetch;
   window.fetch=async (input,options)=>{
    if(String(input).includes('/rpc/integracao_viagens_financeiro')){
     window.viagensReads++;
     return new Response(JSON.stringify(window.viagensFail?{message:'Fixture failure'}:window.viagensFixture),{status:window.viagensFail?500:200,headers:{'content-type':'application/json'}});
    }
    return original(input,options);
   };
  });
  await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('button',{name:'Calendário',exact:true}).click();
  const row=page.locator('.chip-prazo').filter({hasText:'Viagem • HB20 • Ana Fixture'});
  await row.first().waitFor();assert.equal(await row.count(),3);assert.equal(await page.locator('.bloco-evento').filter({hasText:'Viagem • HB20'}).count(),0);
  await row.first().click();const modal=page.getByRole('dialog');await modal.waitFor();assert.match(await modal.innerText(),/18\/11\/2026 a 20\/11\/2026/);assert.equal(await modal.getByRole('button',{name:/Salvar|Cancelar evento|Vou participar/}).count(),0);
  await modal.getByRole('button',{name:'Fechar',exact:true}).last().click();
  await page.getByRole('button',{name:'HB20',exact:true}).click();assert.equal(await row.count(),0);await page.getByRole('button',{name:'HB20',exact:true}).click();assert.equal(await row.count(),3);
  // The actual hook refreshes on focus; changing fixture simulates updated server source.
  await page.evaluate(()=>{window.viagensFixture[0]={...window.viagensFixture[0],veiculo_id:'gol',fim:'2026-11-18'};window.dispatchEvent(new Event('focus'));});
  const gol=page.locator('.chip-prazo').filter({hasText:'Viagem • Gol • Ana Fixture'});await gol.waitFor();assert.equal(await gol.count(),1);assert.equal(await row.count(),0);assert.equal(await page.getByRole('button',{name:'Editar agenda Gol',exact:true}).count(),0);
  await gol.click();await modal.waitFor();
  await page.evaluate(()=>{window.viagensFixture=[];window.dispatchEvent(new Event('focus'));});
  await modal.waitFor({state:'hidden'});assert.equal(await gol.count(),0);
  await page.evaluate(()=>{window.viagensFail=true;window.dispatchEvent(new Event('focus'));});
  await page.getByText('Não foi possível atualizar as viagens do Financeiro. Não considere a agenda de veículos completa.',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({multiday:true,sharedAgendaToggle:true,readOnly:true,vehicleChange:true,cancelRefresh:true,failedRefreshWarning:true,realDataUsed:false}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
