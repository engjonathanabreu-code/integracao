const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});let cenarios=0;
 try{
  const context=await browser.newContext();
  await context.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  await context.route('**/tests/fila-intencoes.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Fila isolada</title>'}));
  const [a,b]=await Promise.all([context.newPage(),context.newPage()]);
  const iniciar=async p=>{await p.goto('http://127.0.0.1:5178/tests/fila-intencoes.html');await p.evaluate(async()=>{
   window.mod=await import('/src/fila-intencoes.js');window.tempo=1000000;
   window.fila=mod.abrirFilaIntencoes({nome:'fixture-intencoes',agora:()=>tempo,aleatorio:()=>0});
   window.nova=(id,unidade=id,conta='a',dependencias=[])=>fila.enfileirar({conta,id,unidade,modulo:'fixture',dependencias,operacoes:[{table:'metas',key:{id},changes:{titulo:'fictício'}}],base:{titulo:'antes'},intencao:{titulo:'fictício'}});
  });};
  await Promise.all([iniciar(a),iniciar(b)]);
  // Separate IDB connections in separate tabs append atomically, with no shared snapshot.
  await Promise.all([a.evaluate(()=>nova('antiga')),b.evaluate(()=>nova('nova'))]);
  let itens=await b.evaluate(()=>fila.listar('a'));assert.equal(itens.length,2);assert.equal(new Set(itens.map(i=>i.ordem)).size,2);cenarios++;
  const reservas=await Promise.all([a.evaluate(()=>fila.reservar('a',{dono:'aba-a'})),b.evaluate(()=>fila.reservar('a',{dono:'aba-b'}))]);
  assert.notEqual(reservas[0].id,reservas[1].id);cenarios++;
  // Reload/crash does not erase an in-flight request. Expiry requires receipt lookup.
  await a.close();await b.evaluate(()=>{tempo+=61000;});
  const recuperada=await b.evaluate(()=>fila.reservar('a',{dono:'sobrevivente'}));assert.equal(recuperada.fase,'recibo');assert.equal(recuperada.pedido,recuperada.id);cenarios++;
  await b.evaluate(async item=>{item=await fila.registrarRecibo(item,{aliases:{},receipt:'fixture'});await fila.confirmarLeitura(item);},recuperada);
  // Deterministic failures block only their business unit, not unrelated units.
  await b.evaluate(async()=>{await nova('invalida','reserva','isolamento');await nova('dependente','reserva','isolamento');await nova('plano','plano','isolamento');});
  const isolado=await b.evaluate(async()=>{const item=await fila.reservar('isolamento',{dono:'worker'});await fila.registrarFalha(item,{status:422,code:'23503'});return fila.reservar('isolamento',{dono:'worker'});});assert.equal(isolado.id,'plano');cenarios++;
  // Explicit dependencies retain parent/child ordering and typed alias handling.
  await b.evaluate(async()=>{await nova('pai','pai','deps');await fila.enfileirar({conta:'deps',id:'filho',unidade:'filho',modulo:'fixture',dependencias:['pai'],operacoes:[{table:'meta_historico',changes:{meta_id:'pai',descricao:'pai'}}],base:{},intencao:{id:'filho'}});const pai=await fila.reservar('deps',{dono:'worker'});const recebido=await fila.registrarRecibo(pai,{aliases:{pai:'canonico'}});await fila.confirmarLeitura(recebido);});
  const filho=await b.evaluate(()=>fila.reservar('deps',{dono:'worker'}));assert.equal(filho.payload[0].changes.meta_id,'canonico');assert.equal(filho.payload[0].changes.descricao,'pai');cenarios++;
  const replay=await b.evaluate(async()=>{const antes=await nova('dedup','dedup','replay');const depois=await nova('dedup','dedup','replay');let codigo;try{await fila.enfileirar({conta:'replay',id:'dedup',unidade:'dedup',modulo:'fixture',operacoes:[{changes:{titulo:'outro'}}],base:{},intencao:{}});}catch(e){codigo=e.code;}return {mesma:antes.ordem===depois.ordem,codigo};});assert.deepEqual(replay,{mesma:true,codigo:'PEDIDO_DIVERGENTE'});cenarios++;
  const legado=await b.evaluate(async()=>{const texto=' {"pending":true,"autoria":"fixture"} ';const x=await fila.preservarLegado('legado',texto);await fila.preservarLegado('legado',texto);const y=await fila.exportar('legado');return {checksum:x.checksum,quantidade:y.originais.length,original:y.originais[0].texto,envios:y.intencoes.length};});assert.equal(legado.quantidade,1);assert.equal(legado.envios,0);assert.equal(legado.original,' {"pending":true,"autoria":"fixture"} ');assert.equal(legado.checksum.length,64);cenarios++;
  // Abort after sequence write must not leave a half-entry or consume a sequence.
  const quota=await b.evaluate(async()=>{const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='intencoes')throw new DOMException('fixture','QuotaExceededError');return add.apply(this,args);};let erro;try{await nova('quota','quota','quota');}catch(e){erro=e.name;}finally{IDBObjectStore.prototype.add=add;}const vazia=await fila.listar('quota');const ok=await nova('quota','quota','quota');return {erro,quantidade:vazia.length,ordem:ok.ordem};});assert.deepEqual(quota,{erro:'QuotaExceededError',quantidade:0,ordem:1});cenarios++;
  const indisponivel=await b.evaluate(async()=>{try{await mod.abrirFilaIntencoes({indexedDB:null}).listar('a');}catch(e){return e.code;}});assert.equal(indisponivel,'PERSISTENCIA_INDISPONIVEL');cenarios++;
  // Lost response after commit: receipt lookup, same request, no second send.
  const perdida=await b.evaluate(async()=>{await nova('write','write','perdida');let envios=0,consultas=0,leituras=0;const callbacks={conta:'perdida',dono:'worker',sessaoAtual:()=>true,consultarRecibo:async()=>{consultas++;return {aliases:{}};},enviar:async()=>{envios++;throw new TypeError('resposta perdida');},reler:async()=>{leituras++;}};try{await mod.processarIntencao(fila,callbacks);}catch{}tempo+=120000;const final=await mod.processarIntencao(fila,callbacks);return {envios,consultas,leituras,estado:final.estado};});assert.deepEqual(perdida,{envios:1,consultas:1,leituras:1,estado:'confirmado'});cenarios++;
  const releitura=await b.evaluate(async()=>{await nova('write','write','releitura');let envios=0,leituras=0;const callbacks={conta:'releitura',dono:'worker',sessaoAtual:()=>true,consultarRecibo:async()=>{throw Error('não consultar');},enviar:async()=>{envios++;return {aliases:{}};},reler:async()=>{if(++leituras===1)throw Object.assign(Error('fixture'),{status:503});}};try{await mod.processarIntencao(fila,callbacks);}catch{}tempo+=120000;const final=await mod.processarIntencao(fila,callbacks);return {envios,leituras,estado:final.estado};});assert.deepEqual(releitura,{envios:1,leituras:2,estado:'confirmado'});cenarios++;
  const sessao=await b.evaluate(async()=>{await nova('write','write','sessao-a');let ativa=true,leituras=0,codigo;try{await mod.processarIntencao(fila,{conta:'sessao-a',dono:'worker',sessaoAtual:()=>ativa,consultarRecibo:async()=>null,enviar:async()=>{ativa=false;return {aliases:{}};},reler:async()=>{leituras++;}});}catch(e){codigo=e.code;}return {codigo,leituras,estado:(await fila.listar('sessao-a'))[0].estado,outra:(await fila.exportar('sessao-b')).intencoes.length};});assert.deepEqual(sessao,{codigo:'SESSAO_ALTERADA',leituras:0,estado:'resultado_desconhecido',outra:0});cenarios++;
  const limitado=await b.evaluate(async()=>{await nova('write','write','retry');let envios=0;for(let n=0;n<5;n++){try{await mod.processarIntencao(fila,{conta:'retry',dono:'worker',sessaoAtual:()=>true,consultarRecibo:async()=>null,enviar:async()=>{envios++;throw Object.assign(Error('fixture'),{status:429,retryAfterMs:90000});},reler:async()=>{}});}catch{}tempo+=120000;}return {envios,proximo:await fila.reservar('retry',{dono:'worker'}),estado:(await fila.listar('retry'))[0].estado};});assert.deepEqual(limitado,{envios:5,proximo:null,estado:'falha_transitoria'});cenarios++;
  const presenca=await b.evaluate(async()=>{
   await nova('negada','processo','presenca');const bloqueada=await fila.reservar('presenca',{dono:'worker'});await fila.registrarFalha(bloqueada,{status:403,code:'42501'});
   const original={conta:'presenca',id:'sinal',unidade:'usuario',modulo:'usuarios',dependencias:['negada'],operacoes:[],base:{},preparar:true,intencao:{arquivos:{},edicoes:[{colecao:'usuarios',id:'u',antes:{existe:true,valor:{id:'u',nome:'Pessoa',online:false}},depois:{existe:true,valor:{id:'u',nome:'Pessoa',online:true}}}]}};
   const antes=await fila.enfileirar(original);await fila.reservar('presenca',{dono:'worker'});const itens=await fila.listar('presenca'),sinal=itens.find(i=>i.id==='sinal');
   return {negada:itens[0].estado,sinal:sinal.estado,originalPreservado:JSON.stringify(antes.original)===JSON.stringify(sinal.original),checksumPreservado:antes.checksum===sinal.checksum,decisao:sinal.decisao.tipo,outraConta:(await fila.listar('inexistente')).length};
  });assert.deepEqual(presenca,{negada:'bloqueado_validacao',sinal:'dispensado',originalPreservado:true,checksumPreservado:true,decisao:'somente_presenca_ou_acesso_local',outraConta:0});cenarios++;
  console.log(JSON.stringify({ok:true,cenarios,duasAbasReais:true,indexedDBReal:true,fluxoPrincipalIntegrado:false}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
