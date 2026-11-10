const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext();
  await context.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  await context.route('**/tests/retomada.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Retomada isolada</title>'}));
  const a=await context.newPage(),b=await context.newPage();
  for(const page of [a,b]){
   await page.goto('http://127.0.0.1:5178/tests/retomada.html');
   await page.evaluate(async()=>{
    window.mod=await import('/src/fila-intencoes.js');
    window.tempo=1000000;
    window.fila=mod.abrirFilaIntencoes({nome:'retomada-idempotente',agora:()=>tempo});
    window.nova=(conta,id='item')=>fila.enfileirar({conta,id,unidade:id,modulo:'metas',operacoes:[{table:'metas',key:{id},changes:{titulo:'teste'}}],base:{},intencao:{edicoes:[],arquivos:{}}});
    window.codigo=async fn=>{try{await fn();return null;}catch(e){return e.code;}};
   });
  }
  // A second tab cannot steal, extend or reset an active send's lease.
  const active=await a.evaluate(async()=>{await nova('ativa');window.claim=await fila.reservar('ativa',{dono:'aba-a'});claim=await fila.registrarEnvio(claim);return claim;});
  assert.deepEqual(await b.evaluate(()=>fila.retomar('ativa','item')),active);
  assert.equal(await b.evaluate(()=>fila.reservar('ativa',{dono:'aba-b'})),null);
  const confirmed=await a.evaluate(async()=>{claim=await fila.registrarRecibo(claim,{aliases:{},prova:'mesmo-recibo'});return fila.confirmarLeitura(claim);});
  assert.deepEqual(await b.evaluate(()=>fila.retomar('ativa','item')),confirmed);
  assert.deepEqual(await b.evaluate(()=>fila.listar('ativa')),[confirmed]);

  // All terminal decisions remain byte-for-byte intact, without writes to IDB.
  const terminal=await a.evaluate(async()=>{
   await nova('dispensada');let c=await fila.reservar('dispensada',{dono:'teste'});await fila.registrarFalha(c,{status:409});await fila.aceitarRemoto('dispensada','item');
   await nova('substituida');c=await fila.reservar('substituida',{dono:'teste'});await fila.registrarFalha(c,{status:409});
   await fila.enfileirar({conta:'substituida',id:'nova',unidade:'item',modulo:'metas',operacoes:[],base:{},preparar:true,intencao:{edicoes:[],arquivos:{}},substituirId:'item'});
   const antes=await Promise.all(['ativa','dispensada','substituida'].map(c=>fila.listar(c)));
   let writes=0;const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){writes++;return put.apply(this,args);};
   try{for(const conta of ['ativa','dispensada','substituida'])await fila.retomar(conta,'item');}finally{IDBObjectStore.prototype.put=put;}
   const depois=await Promise.all(['ativa','dispensada','substituida'].map(c=>fila.listar(c)));
   return {inalterado:JSON.stringify(antes)===JSON.stringify(depois),writes};
  });assert.deepEqual(terminal,{inalterado:true,writes:0});

  // Missing/wrong-account and new deterministic failures still require review.
  const guards=await b.evaluate(async()=>{
   const missing=await codigo(()=>fila.retomar('outra-conta','item'));
   const blocked=[];
   for(const status of [403,409]){
    const conta='bloqueada-'+status;await nova(conta);const c=await fila.reservar(conta,{dono:'teste'});await fila.registrarFalha(c,{status});
    const antes=await fila.listar(conta);const error=await codigo(()=>fila.retomar(conta,'item'));
    blocked.push({error,intacto:JSON.stringify(antes)===JSON.stringify(await fila.listar(conta))});
   }
   return {missing,blocked,outraConta:(await fila.listar('outra-conta')).length};
  });assert.deepEqual(guards,{missing:'REVISAO_NECESSARIA',blocked:[{error:'REVISAO_NECESSARIA',intacto:true},{error:'REVISAO_NECESSARIA',intacto:true}],outraConta:0});

  // Expired unknown sends consult their original receipt before any send.
  const unknown=await b.evaluate(async()=>{
   await nova('desconhecida');let c=await fila.reservar('desconhecida',{dono:'anterior'});c=await fila.registrarEnvio(c);tempo+=61000;
   const before=await fila.retomar('desconhecida','item');let consultas=0,envios=0;
   const final=await mod.processarIntencao(fila,{conta:'desconhecida',dono:'novo',sessaoAtual:()=>true,consultarRecibo:async()=>{consultas++;return {aliases:{},prova:'gravada'};},enviar:async()=>{envios++;return {};},reler:async()=>{}});
   return {before:before.estado,after:final.estado,consultas,envios,sameRequest:before.pedido===c.pedido,samePayload:JSON.stringify(before.payload)===JSON.stringify(c.payload)};
  });assert.deepEqual(unknown,{before:'resultado_desconhecido',after:'confirmado',consultas:1,envios:0,sameRequest:true,samePayload:true});

  // The real controller closes an obsolete pending preview without a new read or write.
  const preview=await b.evaluate(async()=>{
   const {criarDiarioCompartilhado}=await import('/src/diario-compartilhado.js');let reads=0,writes=0;
   const make=conta=>criarDiarioCompartilhado({conta,fila,ativo:()=>true,carregar:async()=>{reads++;return {db:{}};},preparar:async()=>({operacoes:[]}),enviar:async()=>{writes++;return {};},consultarRecibo:async()=>null,confirmar:async()=>{},atualizou:()=>{}});
   await nova('previa');const d=make('previa');
   try{await d.previa('item');let c=await fila.reservar('previa',{dono:'outra-aba'});c=await fila.registrarRecibo(c,{aliases:{}});await fila.confirmarLeitura(c);await d.resolver('item',{});return {reads,writes,state:(await fila.listar('previa'))[0].estado,pendentes:d.itens().filter(i=>i.estado!=='confirmado').length};}finally{d.fechar();}
  });assert.deepEqual(preview,{reads:1,writes:0,state:'confirmado',pendentes:0});

  // Completion between the controller's refresh and atomic resume is harmless too.
  const race=await a.evaluate(async()=>{
   const {criarDiarioCompartilhado}=await import('/src/diario-compartilhado.js');await nova('corrida');
   const original=fila.retomar.bind(fila);let writes=0;
   const d=criarDiarioCompartilhado({conta:'corrida',fila,ativo:()=>true,carregar:async()=>({db:{}}),preparar:async()=>({operacoes:[]}),enviar:async()=>{writes++;},consultarRecibo:async()=>null,confirmar:async()=>{},atualizou:()=>{}});
   try{await d.previa('item');fila.retomar=async(conta,id)=>{let c=await fila.reservar(conta,{dono:'outra-aba'});c=await fila.registrarRecibo(c,{aliases:{}});await fila.confirmarLeitura(c);return original(conta,id);};await d.resolver('item',{});return {writes,states:(await fila.listar('corrida')).map(i=>i.estado)};}finally{fila.retomar=original;d.fechar();}
  });assert.deepEqual(race,{writes:0,states:['confirmado']});
  // A real edited value confirmed during the remote read is not a new conflict.
  const duringRead=await b.evaluate(async()=>{
   const {criarDiarioCompartilhado}=await import('/src/diario-compartilhado.js');
   const edicoes=[{colecao:'metas',id:'meta',antes:{existe:true,valor:{id:'meta',titulo:'antes'}},depois:{existe:true,valor:{id:'meta',titulo:'local'}}}];
   await fila.enfileirar({conta:'corrida-leitura',id:'item',unidade:'meta',modulo:'metas',operacoes:[{table:'metas',key:{id:'meta'},changes:{titulo:'local'}}],base:{},intencao:{edicoes,arquivos:{}}});
   let reads=0,writes=0;
   const d=criarDiarioCompartilhado({conta:'corrida-leitura',fila,ativo:()=>true,carregar:async()=>{
    reads++;if(reads===2){let c=await fila.reservar('corrida-leitura',{dono:'outra-aba'});c=await fila.registrarRecibo(c,{aliases:{}});await fila.confirmarLeitura(c);}
    return {db:{metas:[{id:'meta',titulo:reads===1?'antes':'local'}]}};
   },preparar:async()=>({operacoes:[]}),enviar:async()=>{writes++;},consultarRecibo:async()=>null,confirmar:async()=>{},atualizou:()=>{}});
   try{await d.previa('item');await d.resolver('item',{});return {reads,writes,states:d.itens().map(i=>i.estado)};}finally{d.fechar();}
  });assert.deepEqual(duringRead,{reads:2,writes:0,states:['confirmado']});
  // Real hook: an obsolete completed row cannot recreate the global error banner.
  const ui=await context.newPage();
  await ui.goto('http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?diario&cenario=fantasma');
  await ui.waitForFunction(()=>window.syncHarness?.ready&&!syncHarness.sync.pendencias.length&&syncHarness.stats.writes===1);
  const completedId=await ui.evaluate(async()=>{const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js');const q=abrirFilaIntencoes();try{return (await q.listar('00000000-0000-4000-8000-000000000001')).find(i=>i.estado==='confirmado').id;}finally{q.fechar();}});
  await ui.evaluate(id=>syncHarness.sync.abrirPendencia(id),completedId);
  await ui.waitForFunction(()=>!syncHarness.sync.error&&!syncHarness.sync.previaPendencia);
  assert.equal(await ui.evaluate(()=>syncHarness.stats.writes),1);
  await ui.evaluate(()=>syncHarness.sync.abrirPendencia('item-ausente'));
  await ui.waitForFunction(()=>syncHarness.sync.error.includes('não está disponível'));

  // A genuine unpersisted edit still keeps the warning, even when another row is done.
  await ui.evaluate(()=>{window.originalAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='intencoes')throw new DOMException('fixture','QuotaExceededError');return window.originalAdd.apply(this,args);};syncHarness.sync.mutate(d=>{d.metas[0].titulo='Alteração ainda não guardada';return d;});});
  await ui.waitForFunction(()=>syncHarness.sync.pendencias.some(i=>i.estado==='persistencia_falhou'));
  await ui.evaluate(id=>syncHarness.sync.abrirPendencia(id),completedId);
  await ui.waitForFunction(()=>!!syncHarness.sync.error&&syncHarness.sync.pendencias.some(i=>i.estado==='persistencia_falhou'));
  assert.equal(await ui.evaluate(()=>syncHarness.db.metas[0].titulo),'Alteração ainda não guardada');
  assert.equal(await ui.evaluate(()=>syncHarness.stats.writes),1);
  await ui.evaluate(()=>{IDBObjectStore.prototype.add=window.originalAdd;});await ui.close();

  const deniedContext=await browser.newContext();
  await deniedContext.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  const denied=await deniedContext.newPage();await denied.goto('http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?diario&cenario=permissao');
  await denied.waitForFunction(()=>window.syncHarness?.ready&&syncHarness.sync.pendencias.some(i=>i.estado==='bloqueado_validacao'));
  await denied.evaluate(()=>syncHarness.sync.flush());
  assert.ok(await denied.evaluate(()=>!!syncHarness.sync.error&&syncHarness.sync.pendencias.some(i=>i.estado==='bloqueado_validacao')));
  assert.equal(await denied.evaluate(()=>syncHarness.stats.writes),0);await deniedContext.close();
  console.log(JSON.stringify({ok:true,cenarios:13,duasAbas:true,indexedDBReal:true,hookReal:true,semDadosReais:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
