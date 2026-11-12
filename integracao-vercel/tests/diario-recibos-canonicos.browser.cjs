const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true});let casos=0;try{
 for(const diario of [false,true])for(const novo of [false,true]){
  const c=await b.newContext(),p=await c.newPage();await p.goto('http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?cenario=resposta-perdida'+(diario?'&diario':'')+(novo?'&recibos':''));
  await p.waitForFunction(diario=>window.syncHarness?.ready&&(diario?!syncHarness.sync.pendencias.length:!syncHarness.draft()?.pending),diario);
  assert.equal(await p.evaluate(()=>syncHarness.stats.writes),1);assert.equal(await p.evaluate(()=>syncHarness.stats.posts),diario?1:2,'legado repete o mesmo pedido; diário consulta o recibo');
  assert.equal(await p.evaluate(()=>new Set(syncHarness.stats.postIds).size),1,'tentativas mantêm a chave idempotente');
  const recibos=await p.evaluate(()=>JSON.parse(localStorage.getItem('harness-receipts')));assert.equal(Object.keys(recibos).length,1,'uma única operação no servidor');assert.equal(Object.values(recibos)[0].protocoloRecibo,novo?1:undefined);
  if(diario){const item=await p.evaluate(async()=>{const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js');const f=abrirFilaIntencoes();try{return (await f.listar('00000000-0000-4000-8000-000000000001')).find(i=>i.recibo);}finally{await f.fechar();}});assert.equal(item.estado,'confirmado');assert.equal(item.recibo.protocoloRecibo,novo?1:undefined);}
  await p.reload();await p.waitForFunction(()=>window.syncHarness?.ready);assert.equal(await p.evaluate(()=>syncHarness.stats.writes),1,'reload preserva o recibo sem reenviar');await c.close();casos++;
 }
 console.log(JSON.stringify({ok:true,casos,diarioELegado:true,recibosNovosEAntigos:true,respostaPerdida:true,reload:true,umaGravacao:true}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
