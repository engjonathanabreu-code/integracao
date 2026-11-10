const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});let casos=0;try{
 for(const width of [1440,390])for(const scenario of ['concorrente-igual','concorrente-independente','concorrente-divergente'])for(const escolha of scenario==='concorrente-divergente'?['local','remoto']:['']){
 const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();const erros=[];p.on('pageerror',e=>erros.push(e.message));
 await p.goto(`http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?diario&cenario=${scenario}`);await p.waitForFunction(()=>syncHarness?.ready&&syncHarness.sync.pendencias.some(i=>i.estado.startsWith('bloqueado')));
 const pedido=await p.evaluate(()=>syncHarness.sync.pendencias[0].id);await p.reload();await p.waitForFunction(()=>syncHarness?.ready);assert.equal(await p.evaluate(()=>syncHarness.sync.pendencias[0].id),pedido);
 await p.evaluate(id=>syncHarness.sync.abrirPendencia(id),pedido);await p.waitForFunction(()=>syncHarness.sync.previaPendencia);
 const conflitos=await p.evaluate(()=>syncHarness.sync.previaPendencia.conflitos.length);assert.equal(conflitos>0,!!escolha);
 await p.evaluate(escolha=>syncHarness.sync.resolverPendencia(Object.fromEntries(syncHarness.sync.previaPendencia.conflitos.map(c=>[c.chave,escolha]))),escolha);
 await p.waitForFunction(()=>!syncHarness.sync.pendencias.length);
 const s=await p.evaluate(()=>({etapa:syncHarness.base().integracao_moradores[0].dados.etapa,checks:syncHarness.base().integracao_moradores[0].dados.checks,writes:syncHarness.stats.writes}));
 assert.equal(s.etapa,escolha==='remoto'?2:1);if(scenario==='concorrente-independente')assert.equal(s.checks.remoto,true);assert.equal(s.writes,scenario==='concorrente-igual'||escolha==='remoto'?0:1);assert.deepEqual(erros,[]);await context.close();casos++;
 }console.log(JSON.stringify({ok:true,casos,diarioV2:true,desktopMobile:true,reloadPreservaPedido:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
