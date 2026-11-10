const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const p=await browser.newPage();await p.goto('http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?diario&cenario=morador-sem-marcador');
 await p.waitForFunction(()=>syncHarness?.ready&&syncHarness.sync.pendencias.some(i=>i.estado==='bloqueado_validacao'));
 await p.evaluate(()=>syncHarness.sync.abrirPendencia(syncHarness.sync.pendencias[0].id));await p.waitForFunction(()=>syncHarness.sync.previaPendencia);
 const previa=await p.evaluate(()=>({conflitos:syncHarness.sync.previaPendencia.conflitos.length,checks:syncHarness.sync.previaPendencia.dados.processos[0].checks}));
 assert.equal(previa.conflitos,0);assert.deepEqual(previa.checks,{remoto:true});
 await p.evaluate(()=>syncHarness.sync.resolverPendencia({}));await p.waitForFunction(()=>!syncHarness.sync.pendencias.length);
 assert.deepEqual(await p.evaluate(()=>({etapa:syncHarness.base().integracao_moradores[0].dados.etapa,checks:syncHarness.base().integracao_moradores[0].dados.checks,rows:syncHarness.base().integracao_moradores.length,writes:syncHarness.stats.writes})),{etapa:1,checks:{remoto:true},rows:1,writes:1});
 for(const caso of ['ausente','divergente']){
  const q=await browser.newPage();await q.goto('http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?diario&cenario=morador-sem-marcador');await q.waitForFunction(()=>syncHarness?.ready&&syncHarness.sync.pendencias.some(i=>i.estado==='bloqueado_validacao'));
  await q.evaluate(caso=>{if(caso==='ausente'){syncHarness.base().fin_receb_clientes=[];syncHarness.base().integracao_moradores=[];}else syncHarness.base().integracao_moradores[0].dados.etapa=2;},caso);
  await q.evaluate(()=>syncHarness.sync.abrirPendencia(syncHarness.sync.pendencias[0].id));await q.waitForFunction(()=>syncHarness.sync.previaPendencia?.conflitos.length>0);
  assert.equal(await q.evaluate(()=>syncHarness.stats.writes),0);assert.equal(await q.evaluate(()=>syncHarness.sync.pendencias.length),1);await q.close();
 }
 console.log(JSON.stringify({ok:true,semMarcador:true,originalMigrado:true,releituraAntesDaRevisao:true,alteracaoRemotaPreservada:true,semDuplicacao:true,ausenciaEDivergenciaExigemRevisao:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
