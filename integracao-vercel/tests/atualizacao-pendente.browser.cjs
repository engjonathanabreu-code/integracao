const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});let casos=0;try{
 for(const width of [1440,390])for(const conflito of [false,true]){
 const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();await p.goto('http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?diario&cenario=permissao');await p.waitForFunction(()=>syncHarness?.ready&&syncHarness.sync.pendencias.some(i=>i.estado==='bloqueado_validacao'));
 const original=await p.evaluate(()=>syncHarness.sync.pendencias[0]),pedido=original.id;assert.equal(await p.evaluate(()=>syncHarness.db.processos[0].etapa),1);
 await p.evaluate(async conflito=>{syncHarness.base().metas[0].status='Aguardando aprovação';syncHarness.base().metas.push({...syncHarness.base().metas[0],id:'00000000-0000-4000-8000-000000000100',titulo:'Meta nova'});if(conflito)syncHarness.base().integracao_moradores[0].dados.etapa=2;syncHarness.salvarServidor();await syncHarness.sync.refresh({force:true});},conflito);
 await p.waitForFunction(()=>syncHarness.db.metas.length===2);assert.equal(await p.evaluate(()=>syncHarness.db.processos[0].etapa),conflito?2:1);assert.equal(await p.evaluate(()=>syncHarness.stats.writes),0);assert.deepEqual(await p.evaluate(()=>syncHarness.sync.pendencias[0].original),original.original);assert.deepEqual(await p.evaluate(()=>syncHarness.sync.pendencias[0].payload),original.payload);
 await p.reload();await p.waitForFunction(()=>syncHarness?.ready&&syncHarness.db.metas.length===2);assert.equal(await p.evaluate(()=>syncHarness.sync.pendencias[0].id),pedido);assert.equal(await p.evaluate(()=>syncHarness.db.processos[0].etapa),conflito?2:1);assert.deepEqual(await p.evaluate(()=>syncHarness.sync.pendencias[0].original),original.original);
 await p.evaluate(async id=>{syncHarness.flags.deny=false;await syncHarness.sync.abrirPendencia(id);},pedido);await p.waitForFunction(()=>syncHarness.sync.previaPendencia);
 await p.evaluate(()=>syncHarness.sync.resolverPendencia(Object.fromEntries(syncHarness.sync.previaPendencia.conflitos.map(c=>[c.chave,'remoto']))));await p.waitForFunction(()=>!syncHarness.sync.pendencias.length);
 assert.equal(await p.evaluate(()=>syncHarness.stats.writes),conflito?0:1);assert.equal(await p.evaluate(()=>syncHarness.base().integracao_moradores[0].dados.etapa),conflito?2:1);assert.equal(await p.evaluate(()=>syncHarness.db.metas[0].status),'Aguardando aprovação');await context.close();casos++;
 }
 for(const width of [1440,390])for(const cenario of ['ausente','erro-leitura']){
 const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();await p.goto('http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?diario&cenario=permissao');await p.waitForFunction(()=>syncHarness?.ready&&syncHarness.sync.pendencias.some(i=>i.estado==='bloqueado_validacao'));
 const original=await p.evaluate(()=>syncHarness.sync.pendencias[0]);assert.equal(await p.evaluate(()=>syncHarness.db.processos[0].etapa),1);
 const refreshed=await p.evaluate(async cenario=>{
  if(cenario==='ausente'){syncHarness.base().fin_receb_clientes=[];syncHarness.base().integracao_moradores=[];syncHarness.salvarServidor();}
  else{const fetch=window.fetch;window.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);return url.pathname.endsWith('/fin_receb_clientes')&&url.searchParams.has('id')?Promise.resolve(Response.json({message:'Consulta da ficha recusada',code:'42501'},{status:403})):fetch(input,options);};}
  return syncHarness.sync.refresh({force:true});
 },cenario);
 assert.equal(refreshed,cenario==='ausente');assert.equal(await p.evaluate(()=>syncHarness.stats.writes),0);assert.deepEqual(await p.evaluate(()=>syncHarness.sync.pendencias[0].original),original.original);assert.deepEqual(await p.evaluate(()=>syncHarness.sync.pendencias[0].payload),original.payload);
 if(cenario==='ausente'){
  await p.waitForFunction(()=>syncHarness.db.processos.length===0);await p.reload();await p.waitForFunction(()=>syncHarness?.ready&&syncHarness.sync.pendencias.length===1);assert.equal(await p.evaluate(()=>syncHarness.db.processos.length),0);assert.deepEqual(await p.evaluate(()=>syncHarness.sync.pendencias[0].original),original.original);
 }else{
  await p.waitForFunction(()=>syncHarness.sync.error.includes('Consulta da ficha recusada'));assert.equal(await p.evaluate(()=>syncHarness.db.processos[0].etapa),1);
 }
 assert.equal(await p.evaluate(()=>syncHarness.stats.requests.some(u=>u.endsWith('/rpc/integracao_moradores_carga'))),false,'hidratação é direcionada, sem baixar todos os municípios');assert.equal(await p.evaluate(()=>syncHarness.stats.writes),0);await context.close();casos++;
 }
 console.log(JSON.stringify({ok:true,casos,diarioV2:true,permissaoNaoContornada:true,refreshPreservaIntencao:true,ausenciaAutorizadaPreservada:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
