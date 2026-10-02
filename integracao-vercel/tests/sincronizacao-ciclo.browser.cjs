const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5182';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[];let cases=0;
 const open=async(scenario,tipo='Comercial')=>{
  const context=await browser.newContext();const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(`${origin}/tests/sincronizacao-ciclo.html?cenario=${scenario}&tipo=${encodeURIComponent(tipo)}`);
  await page.waitForFunction(()=>window.syncHarness?.ready);
  return {page,context};
 };
 const settled=page=>page.waitForFunction(()=>window.syncHarness?.ready&&!window.syncHarness.draft().pending,{},{timeout:15000});
 const state=page=>page.evaluate(()=>({writes:syncHarness.stats.writes,posts:syncHarness.stats.posts,draft:syncHarness.draft(),etapa:syncHarness.base().integracao_moradores[0].dados.etapa,error:syncHarness.sync.error}));
 try{
  for(const tipo of ['Administrador','Diretor Técnico','Diretor de Projetos','Comercial','Atendimentos','Jurídico','Topografia','Projetos','Pós-protocolo','Financeiro','Consulta']){
   const {page,context}=await open('fantasma',tipo);await settled(page);
   let s=await state(page);assert.equal(s.writes,1);assert.equal(s.etapa,1);assert.equal(s.error,'');
   assert.equal(s.draft.db.processos.some(p=>p.id.endsWith('000099')),false);
   await page.getByRole('button',{name:'Editar novamente'}).click();await settled(page);
   s=await state(page);assert.equal(s.etapa,2);assert.equal(s.writes,2);assert.equal(s.error,'');
   await context.close();cases++;
  }
  for(const newer of [false,true]){
   const {page,context}=await open('falha-leitura');
   await page.waitForFunction(()=>!!syncHarness.draft().attempt?.confirmacao&&!!syncHarness.sync.error);
   assert.equal((await state(page)).writes,1);
   if(newer)await page.getByRole('button',{name:'Editar novamente'}).click();
   await page.reload();await page.waitForFunction(()=>syncHarness?.ready);
   let s=await state(page);assert.equal(s.posts,0);assert.ok(s.draft.attempt.confirmacao);
   await page.getByRole('button',{name:'Restaurar conexão'}).click();await settled(page);
   s=await state(page);assert.equal(s.writes,newer?2:1);assert.equal(s.etapa,newer?2:1);
   assert.equal(s.posts,newer?1:0);assert.equal(s.error,'');await context.close();cases++;
  }
  {
   const {page,context}=await open('resposta-perdida');await settled(page);
   const s=await state(page);assert.equal(s.writes,1);assert.equal(s.posts,2);assert.equal(s.etapa,1);
   await context.close();cases++;
  }
  for(const scenario of ['permissao','conflito']){
   const {page,context}=await open(scenario);await page.waitForFunction(()=>!!syncHarness.sync.error);
   const s=await state(page);assert.equal(s.writes,0);assert.equal(s.draft.pending,true);assert.ok(s.draft.attempt);
   assert.equal(s.draft.db.processos.find(p=>p.id.endsWith('000004')).etapa,1);
   await context.close();cases++;
  }
  assert.deepEqual(errors,[]);console.log(`${cases} cenários de navegador: OK (cadastro ausente, edições sequenciais, recibo persistente, reconexão, F5, resposta perdida, permissão e conflito real).`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
