const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});const errors=[];let casos=0;try{
 for(const width of [1440,390])for(const conflito of [false,true]){
  const ctx=await b.newContext({viewport:{width,height:900}}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto('http://127.0.0.1:5182/tests/sincronizacao-ciclo.html?cenario=permissao&tipo=Diretor%20de%20Projetos');await p.waitForFunction(()=>syncHarness?.ready&&!!syncHarness.sync.error);const original=await p.evaluate(()=>syncHarness.draft().attempt.id);
  await p.evaluate(conflito=>{syncHarness.base().metas[0].status='Aguardando aprovação';syncHarness.base().metas.push({...syncHarness.base().metas[0],id:'00000000-0000-4000-8000-000000000100',titulo:'Meta nova'});if(conflito)syncHarness.base().integracao_moradores[0].dados.etapa=2;syncHarness.salvarServidor();window.dispatchEvent(new Event('focus'));},conflito);
  await p.waitForFunction(()=>syncHarness.db.metas.length===2&&syncHarness.db.metas[0].status==='Aguardando aprovação');
  let s=await p.evaluate(()=>({draft:syncHarness.draft(),writes:syncHarness.stats.writes,etapa:syncHarness.db.processos[0].etapa,metas:syncHarness.db.metas.length}));assert.equal(s.writes,0);assert.equal(s.etapa,1);assert.equal(s.draft.attempt.id,original);assert.equal(s.draft.pending,true);
  await p.reload();await p.waitForFunction(()=>syncHarness?.ready&&syncHarness.db.metas.length===2);assert.equal(await p.evaluate(()=>syncHarness.db.metas[0].status),'Aguardando aprovação');
  if(conflito){await p.getByRole('region',{name:'Revisar alterações simultâneas'}).waitFor();await p.getByRole('radio',{name:/Valor atual compartilhado/}).check();await p.getByRole('button',{name:'Salvar escolhas e continuar'}).click();}
  else{await p.evaluate(()=>{syncHarness.flags.deny=false;syncHarness.sync.flush();});}
  await p.waitForFunction(()=>!syncHarness.draft().pending,{},{timeout:10000});s=await p.evaluate(()=>({writes:syncHarness.stats.writes,etapa:syncHarness.db.processos[0].etapa,meta:syncHarness.db.metas[0].status,error:syncHarness.sync.error}));assert.equal(s.writes,conflito?0:1);assert.equal(s.etapa,conflito?2:1);assert.equal(s.meta,'Aguardando aprovação');assert.equal(s.error,'');await ctx.close();casos++;
 }
 {
  const ctx=await b.newContext(),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5182/tests/sincronizacao-ciclo.html?cenario=resposta-perdida');await p.waitForFunction(()=>syncHarness?.ready&&!!syncHarness.sync.error);const pedido=await p.evaluate(()=>syncHarness.draft().attempt.id);
  await p.evaluate(()=>syncHarness.sync.refresh({force:true,manual:true}));assert.equal(await p.evaluate(()=>syncHarness.draft().attempt.id),pedido);await p.waitForFunction(()=>!syncHarness.draft().pending);assert.equal(await p.evaluate(()=>syncHarness.stats.writes),1);await ctx.close();casos++;
 }
 {
  const ctx=await b.newContext(),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5182/tests/sincronizacao-ciclo.html?cenario=resposta-perdida');await p.waitForFunction(()=>syncHarness?.ready&&!!syncHarness.sync.error);
  await p.evaluate(async()=>{syncHarness.base().integracao_moradores[0].dados.etapa=2;syncHarness.salvarServidor();syncHarness.sync.mutate(d=>{d.processos[0].etapa=3;return d;});await syncHarness.sync.refresh({force:true,manual:true});});
  await p.getByRole('region',{name:'Revisar alterações simultâneas'}).waitFor();await p.waitForFunction(()=>syncHarness.draft().attempt===null);assert.equal(await p.evaluate(()=>syncHarness.stats.writes),1);
  await p.getByRole('radio',{name:/Valor atual compartilhado/}).check();await p.getByRole('button',{name:'Salvar escolhas e continuar'}).click();await p.waitForFunction(()=>!syncHarness.draft().pending);assert.equal(await p.evaluate(()=>syncHarness.db.processos[0].etapa),2);assert.equal(await p.evaluate(()=>syncHarness.stats.writes),1);await ctx.close();casos++;
 }
 assert.deepEqual(errors,[]);console.log(`${casos} cenários: RLS bloqueada recebe aprovação e novas metas; F5 preserva rascunho; revisão e retomada sem duplicação: OK`);
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
