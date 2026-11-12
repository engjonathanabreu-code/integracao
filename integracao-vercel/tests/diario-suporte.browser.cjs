const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true});try{
 const c=await b.newContext();await c.route('**/tests/suporte-core.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Suporte isolado</title>'}));
 const p=await c.newPage();await p.goto('http://127.0.0.1:5178/tests/suporte-core.html');
 const r=await p.evaluate(async()=>{
  const {abrirFilaIntencoes,lerIntencaoExistente,processarIntencao}=await import('/src/fila-intencoes.js');
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');let tempo=1000000,envios=0,leituras=0;
  const f=abrirFilaIntencoes({nome:'suporte-core',agora:()=>tempo,aleatorio:()=>0});
  const nova=(n,conta='a',unidade='meta-'+n)=>f.enfileirar({conta,id:id(n),unidade,modulo:'metas',operacoes:[{table:'metas',key:{id:id(n)},changes:{titulo:'fixture'}}],base:{},intencao:{}});
  try{
   await nova(1);let a=await f.reservar('a',{dono:'original'});a=await f.registrarEnvio(a);await f.registrarFalha(a,{status:400,code:'23514'});
   const antes=(await f.listar('a'))[0],original=JSON.stringify(antes.original),checksum=antes.checksum,payload=JSON.stringify(antes.payload);
   const sem=await lerIntencaoExistente(f,{conta:'a',dono:'suporte',id:id(1),modo:'consulta',sessaoAtual:()=>true,consultarRecibo:async()=>null});
   if(sem.estado!=='bloqueado_validacao'||sem.erro.codigo!=='23514')throw Error('consulta alterou recusa');
   let consultaFalhou=false;try{await lerIntencaoExistente(f,{conta:'a',dono:'suporte',id:id(1),modo:'consulta',sessaoAtual:()=>true,consultarRecibo:async()=>{throw new TypeError('rede');}});}catch{consultaFalhou=true;}
   const depoisFalha=(await f.listar('a'))[0];if(depoisFalha.estado!=='bloqueado_validacao')throw Error('leitura autorizou escrita');
   const recibo=await lerIntencaoExistente(f,{conta:'a',dono:'suporte',id:id(1),modo:'consulta',sessaoAtual:()=>true,consultarRecibo:async()=>({aliases:{}})});
   if(recibo.estado!=='confirmado_aguardando_leitura')throw Error('recibo não preservado');
   await nova(2,'a','meta-1');
   const bloqueado=await processarIntencao(f,{conta:'a',dono:'normal',somenteId:id(2),sessaoAtual:()=>true,enviar:async()=>{envios++;return {aliases:{}};},reler:async()=>{}});
   if(bloqueado!==null)throw Error('dependência foi ignorada');
   const lido=await lerIntencaoExistente(f,{conta:'a',dono:'suporte',id:id(1),modo:'releitura',sessaoAtual:()=>true,consultarRecibo:async()=>{throw Error('não consultar recibo local');},reler:async()=>{leituras++;}});
   if(lido.estado!=='confirmado')throw Error('releitura não confirmou');
   await processarIntencao(f,{conta:'a',dono:'normal',somenteId:id(2),sessaoAtual:()=>true,enviar:async()=>{envios++;return {aliases:{}};},reler:async()=>{leituras++;}});
   const lista=await f.listar('a');
   const outra=await lerIntencaoExistente(f,{conta:'b',dono:'suporte',id:id(1),modo:'consulta',sessaoAtual:()=>true,consultarRecibo:async()=>{throw Error('vazou conta');}});
   // Concurrent connections cannot consume the same receipt read.
   await nova(3);let t=await f.reservar('a',{dono:'normal',somenteId:id(3)});t=await f.registrarRecibo(t,{aliases:{}});await f.liberarReserva(t);
   let liberar;const barreira=new Promise(r=>liberar=r),f2=abrirFilaIntencoes({nome:'suporte-core',agora:()=>tempo});
   const leitura1=lerIntencaoExistente(f,{conta:'a',dono:'um',id:id(3),modo:'releitura',sessaoAtual:()=>true,reler:async()=>{await barreira;}});
   await new Promise(r=>setTimeout(r,30));const leitura2=await lerIntencaoExistente(f2,{conta:'a',dono:'dois',id:id(3),modo:'releitura',sessaoAtual:()=>true,reler:async()=>{throw Error('dupla execução');}});liberar();await leitura1;await f2.fechar();
   return {envios,leituras,consultaFalhou,outra:outra===null,duasAbas:leitura2===null,preservado:JSON.stringify(lista[0].original)===original&&lista[0].checksum===checksum&&JSON.stringify(lista[0].payload)===payload,dependente:lista[1].estado};
  }finally{await f.fechar();}
 });
 assert.deepEqual(r,{envios:1,leituras:2,consultaFalhou:true,outra:true,duasAbas:true,preservado:true,dependente:'confirmado'});
 const q=await c.newPage();await q.goto('http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?diario&cenario=fantasma');await q.waitForFunction(()=>window.syncHarness?.ready&&!syncHarness.sync.pendencias.length);
 const agendado=await q.evaluate(async()=>{const h=syncHarness,antes=h.stats.writes;h.sync.mutate(d=>{d.metas[0].titulo='Edição preservada após diagnóstico';return d;});const diagnostico=await h.sync.executarSuporte({tipo:'diagnostico'});return {antes,codigo:diagnostico.codigo};});
 await q.waitForFunction(()=>JSON.parse(localStorage.getItem('harness-server')).metas[0].titulo==='Edição preservada após diagnóstico');
 assert.equal(agendado.codigo,'DIAGNOSTICO');assert.equal(await q.evaluate(()=>syncHarness.stats.writes),agendado.antes+1,'diagnóstico não consome o único agendamento da edição local');
 console.log(JSON.stringify({ok:true,casos:8,indexedDBReal:true,consultaSemReenvio:true,reagendamentoNormal:true,...r}));
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
