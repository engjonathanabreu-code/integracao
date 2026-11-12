const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 for(const width of [1440,390]){
  const c=await browser.newContext({viewport:{width,height:900}}),p=await c.newPage();
  await p.goto('http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?diario&cenario=permissao');
  await p.waitForFunction(()=>window.syncHarness?.ready&&syncHarness.sync.pendencias.some(i=>i.estado==='bloqueado_validacao'));
  const original=await p.evaluate(()=>structuredClone(syncHarness.sync.pendencias[0]));
  const result=await p.evaluate(async()=>{
   const h=syncHarness,id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
   h.base().fin_receb_clientes.push({...h.base().fin_receb_clientes[0],id:id(44),nome:'Segunda ficha'});
   h.base().integracao_moradores.push({...h.base().integracao_moradores[0],registro_id:id(44),referencia_id:id(44),dados:{etapa:0,checks:{}}});h.salvarServidor();
   await h.sync.loadMunicipio(id(2),{id:id(44)});
   const fetch=window.fetch;window.restaurarFicha=()=>{window.fetch=fetch;};
   window.fetch=(input,o)=>{const u=new URL(typeof input==='string'?input:input.url,location.href);return u.pathname.endsWith('/fin_receb_clientes')&&u.searchParams.get('id')==='eq.'+id(4)?Promise.resolve(Response.json({message:'Consulta recusada',code:'42501'},{status:403})):fetch(input,o);};
   h.base().metas[0].titulo='Atualização independente recebida';h.salvarServidor();return h.sync.refresh({force:true});
  });
  assert.equal(result,true);await p.waitForFunction(()=>syncHarness.sync.falhasAtualizacao.length===1&&syncHarness.db.metas[0].titulo==='Atualização independente recebida');
  assert.equal(await p.evaluate(()=>syncHarness.db.processos.find(x=>x.id.endsWith('000004')).etapa),1);
  assert.deepEqual(await p.evaluate(()=>syncHarness.sync.pendencias[0].original),original.original);
  await p.evaluate(()=>{syncHarness.flags.deny=false;syncHarness.sync.mutate(d=>{d.processos.find(x=>x.id.endsWith('000044')).etapa=2;return d;});});
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('harness-server')).integracao_moradores.find(x=>x.registro_id.endsWith('000044')).dados.etapa===2);
  assert.equal(await p.evaluate(()=>syncHarness.stats.writes),1,'uma ficha independente avança sem reenviar a recusada');
  assert.equal(await p.evaluate(()=>syncHarness.sync.falhasAtualizacao.length),1,'outra operação não limpa falha sem nova leitura');
  const archived=await p.evaluate(async()=>{const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js');const f=abrirFilaIntencoes();try{return (await f.listar('00000000-0000-4000-8000-000000000001')).map(i=>({id:i.id,estado:i.estado,original:i.original,checksum:i.checksum}));}finally{await f.fechar();}});
  assert.deepEqual(archived.find(i=>i.id===original.id).original,original.original);
  assert.equal(archived.find(i=>i.id===original.id).checksum,original.checksum);
  await p.reload();await p.waitForFunction(()=>window.syncHarness?.ready);assert.equal(await p.evaluate(()=>syncHarness.stats.writes),1);
  // Reload retains the exact rejected request; it never becomes a new write.
  assert.deepEqual(await p.evaluate(id=>syncHarness.sync.pendencias.find(i=>i.id===id).original,original.id),original.original);
  await c.close();
 }

 const c=await browser.newContext(),p=await c.newPage();await p.goto('http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?diario&cenario=fantasma');await p.waitForFunction(()=>window.syncHarness?.ready&&!syncHarness.sync.pendencias.length);
 await p.evaluate(async()=>{const h=syncHarness,id='00000000-0000-4000-8000-000000000045';h.base().fin_receb_clientes.push({...h.base().fin_receb_clientes[0],id,municipio_id:null,nome:'Ficha avulsa preservada'});h.base().integracao_moradores.push({...h.base().integracao_moradores[0],registro_id:id,referencia_id:id});h.salvarServidor();await h.sync.loadMunicipio(null,{id});});
 const requests=await p.evaluate(()=>syncHarness.stats.requests.length);
 await p.evaluate(()=>syncHarness.sync.mutate(d=>{d.metas[0].titulo='Meta com avulso aberto';return d;}));
 await p.waitForFunction(()=>!syncHarness.sync.pendencias.length&&syncHarness.db.metas[0].titulo==='Meta com avulso aberto');
 assert.equal(await p.evaluate(()=>syncHarness.db.processos.find(p=>p.id==='00000000-0000-4000-8000-000000000045'&&!p.municipioId&&!p._resumo&&p._compartilhado)?.requerente.nome),'Ficha avulsa preservada','operação independente mantém cache completo de avulso');
 assert.equal(await p.evaluate(start=>syncHarness.stats.requests.slice(start).filter(u=>u.endsWith('/fin_receb_clientes')).length,requests),0,'não consulta ficha avulsa sem relação durante a lease');
 await c.close();
 console.log(JSON.stringify({ok:true,casos:3,hookReal:true,indexedDBReal:true,refreshParcial:true,outraFichaGravada:true,originaisPreservados:true,reload:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
