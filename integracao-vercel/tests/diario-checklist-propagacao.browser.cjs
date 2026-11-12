const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext(),leitora=await context.newPage(),emissora=await context.newPage();
  await leitora.goto('http://127.0.0.1:5178/tests/checklist-propagacao.html?conta=leitora');
  await leitora.waitForFunction(()=>window.fluxoChecklist?.ready);
  assert.equal(await leitora.evaluate(()=>fluxoChecklist.db.metas[0].titulo),'Meta Teste');
  await emissora.goto('http://127.0.0.1:5178/tests/checklist-propagacao.html');
  await emissora.waitForFunction(()=>window.fluxoChecklist?.ready&&!fluxoChecklist.sync.pendencias.length&&fluxoChecklist.servidor().gravacoes===2);
  const resumo=await emissora.evaluate(async()=>{
   const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js'),f=abrirFilaIntencoes();
   try{const itens=await f.listar(fluxoChecklist.conta),primeiro=itens.find(i=>i.id===fluxoChecklist.pedido),segundo=itens.find(i=>i.id!==primeiro.id);return {primeiro:{estado:primeiro.estado,recibo:!!primeiro.recibo,instanteOriginal:primeiro.preparado.depois.metas[0].checklist[0].concluido_em},segundo:{estado:segundo.estado,dependencias:segundo.dependencias},servidor:fluxoChecklist.servidor()};}finally{await f.fechar();}
  });
  assert.equal(resumo.primeiro.estado,'confirmado');assert.equal(resumo.primeiro.recibo,true);assert.equal(resumo.primeiro.instanteOriginal,'2026-11-12T16:15:36.123Z');
  assert.equal(resumo.segundo.estado,'confirmado');assert.ok(resumo.segundo.dependencias.includes('00000000-0000-4000-8000-000000000091'));
  assert.equal(resumo.servidor.envios.length,1,'pedido já gravado não é reenviado');
  assert.notEqual(resumo.servidor.envios[0].pedido,'00000000-0000-4000-8000-000000000091');
  await leitora.evaluate(()=>fluxoChecklist.sync.refresh({force:true}));
  await leitora.waitForFunction(()=>fluxoChecklist.db.metas[0].titulo==='Edição posterior da mesma meta');
  assert.equal(await leitora.evaluate(()=>fluxoChecklist.db.metas[0].checklist[0].concluido),true);
  assert.equal(await leitora.evaluate(()=>fluxoChecklist.sync.pendencias.length),0);
  await emissora.reload();await emissora.waitForFunction(()=>window.fluxoChecklist?.ready&&!fluxoChecklist.sync.pendencias.length);
  assert.equal(await emissora.evaluate(()=>fluxoChecklist.servidor().envios.length),1,'reload conserva o recibo e não repete pedidos');
  console.log(JSON.stringify({ok:true,duasContas:true,indexedDBReal:true,primeiroReciboSemReenvio:true,sucessoraConfirmada:true,segundaContaAtualizadaPorLeitura:true,semDadosReais:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
