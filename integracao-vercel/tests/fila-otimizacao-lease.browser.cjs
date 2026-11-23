const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext();await context.route('**/tests/lease.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Lease isolado</title>'}));
 const a=await context.newPage(),b=await context.newPage(),nome='lease-'+Date.now();
 for(const p of [a,b]){await p.goto('http://127.0.0.1:5178/tests/lease.html');await p.evaluate(async nome=>{
  window.mod=await import('/src/fila-intencoes.js');window.fila=mod.abrirFilaIntencoes({nome});window.envios=[];window.renovacoes=0;
  const renovar=fila.renovarReserva;fila.renovarReserva=async(...args)=>{renovacoes++;return renovar(...args);};
  window.nova=(id,conta='longa')=>fila.enfileirar({conta,id,unidade:id,modulo:'metas',operacoes:[{table:'metas',key:{id},changes:{titulo:'fixture'}}],base:{},intencao:{}});
  window.opcoes=conta=>({conta,dono:crypto.randomUUID(),leaseMs:1000,renovarCadaMs:100,sessaoAtual:()=>true,consultarRecibo:async()=>({aliases:{}}),enviar:async i=>{envios.push(i.id);return {aliases:{}};},reler:async()=>{}});
 },nome);}
 // The first tab's network callback stays active longer than the whole lease.
 await a.evaluate(async()=>{await nova('demorada');await nova('independente');const o=opcoes('longa');o.enviar=async i=>{envios.push(i.id);window.iniciou=true;await new Promise(r=>window.liberar=r);return {aliases:{}};};window.trabalho=mod.processarIntencao(fila,o);});
 await a.waitForFunction(()=>window.iniciou);await a.waitForTimeout(1400);
 const lease=await a.evaluate(async()=>{const [i]=await fila.listar('longa');return {ativo:i.leaseAte>Date.now(),renovacoes,estado:i.estado};});
 assert.equal(lease.ativo,true);assert.ok(lease.renovacoes>4);assert.equal(lease.estado,'resultado_desconhecido');
 const independente=await b.evaluate(async()=>{const i=await mod.processarIntencao(fila,opcoes('longa'));return {id:i.id,estado:i.estado,envios};});
 assert.deepEqual(independente,{id:'independente',estado:'confirmado',envios:['independente']});
 const primeiro=await a.evaluate(async()=>{liberar();const i=await trabalho;return {id:i.id,estado:i.estado,envios};});
 assert.deepEqual(primeiro,{id:'demorada',estado:'confirmado',envios:['demorada']});
 // A held Web Lock is skipped without executing callbacks or increasing retry
 // counters; an unrelated request can still be selected in that same call.
 await a.evaluate(async()=>{await nova('travada','locks');await nova('livre','locks');window.trava=navigator.locks.request(fila.nomeTrava((await fila.listar('locks'))[0]),async()=>{window.travada=true;await new Promise(r=>window.soltarTrava=r);});});
 await a.waitForFunction(()=>window.travada);
 const contencao=await b.evaluate(async()=>{const i=await mod.processarIntencao(fila,opcoes('locks')),rows=await fila.listar('locks'),travada=rows[0];return {id:i.id,estado:i.estado,tentativas:travada.tentativas,falhas:travada.falhas||0,semErro:!travada.erro,envios:envios.filter(id=>['travada','livre'].includes(id))};});
 assert.deepEqual(contencao,{id:'livre',estado:'confirmado',tentativas:0,falhas:0,semErro:true,envios:['livre']});
 await a.evaluate(async()=>{soltarTrava();await trava;});
 // Losing the durable reservation while a callback is in flight never marks
 // the stale attempt saved, even when its network callback returns a receipt.
 await a.evaluate(async()=>{await nova('perdida','perda');const o=opcoes('perda');o.enviar=async()=>{window.enviando=true;await new Promise(r=>window.finalizar=r);return {aliases:{}};};window.perdida=mod.processarIntencao(fila,o).catch(e=>e.code);});
 await a.waitForFunction(()=>window.enviando);
 // Simulate an old client that ignores Web Locks and sees this lease expired.
 await b.evaluate(async nome=>{const legado=mod.abrirFilaIntencoes({nome,agora:()=>Date.now()+61000});await legado.reservar('perda',{dono:'cliente-antigo'});await legado.fechar();},nome);
 const perda=await a.evaluate(async()=>{await new Promise(r=>setTimeout(r,150));finalizar();const codigo=await perdida,[i]=await fila.listar('perda');return {codigo,estado:i.estado,semLeitura:!i.lidoEm};});
 assert.equal(perda.codigo,'RESERVA_EXPIRADA');assert.notEqual(perda.estado,'confirmado');assert.equal(perda.semLeitura,true);
 // Support's receipt revalidation and read-back use the same renewal/lock path.
 await a.evaluate(async()=>{await nova('suporte','leitura');let i=await fila.reservar('leitura',{dono:'fixture'});i=await fila.registrarRecibo(i,{aliases:{}});await fila.liberarReserva(i);window.lendo=false;window.leitura=mod.lerIntencaoExistente(fila,{...opcoes('leitura'),id:'suporte',modo:'releitura',reler:async()=>{window.lendo=true;await new Promise(r=>window.encerrarLeitura=r);}});});
 await a.waitForFunction(()=>window.lendo);await a.waitForTimeout(1400);
 const outraLeitura=await b.evaluate(()=>mod.lerIntencaoExistente(fila,{...opcoes('leitura'),id:'suporte',modo:'releitura',reler:async()=>{throw Error('segunda leitura concorrente');}}));
 assert.equal(outraLeitura,null);assert.equal(await a.evaluate(async()=>{encerrarLeitura();return (await leitura).estado;}),'confirmado');
 // Closing the consumer drains renewal promises; timers cannot reopen its DB.
 await Promise.all([a.evaluate(()=>fila.fechar()),b.evaluate(()=>fila.fechar())]);
 console.log(JSON.stringify({ok:true,casos:4,duasAbasReais:true,leaseMs:1000,callbackMs:1400,webLocks:true,contencaoSemRetry:true,reservaPerdidaSemSalvo:true,releituraLonga:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
