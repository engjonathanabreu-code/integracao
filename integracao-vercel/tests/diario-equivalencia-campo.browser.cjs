const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.FIXTURE_CHROMIUM?{executablePath:process.env.FIXTURE_CHROMIUM,args:['--no-sandbox']}:{})});
 try{
  const context=await browser.newContext(),origin=process.env.BROWSER_TEST_ORIGIN||'http://127.0.0.1:5178';
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await context.route('**/tests/campo-idb-fixture.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Campo isolado</title>'}));
  const page=await context.newPage();await page.goto(origin+'/tests/campo-idb-fixture.html');
  const result=await page.evaluate(async()=>{
   const {abrirFilaIntencoes,processarIntencao}=await import('/src/fila-intencoes.js');
   let agora=100000,envios=0;const fila=abrirFilaIntencoes({nome:'fixture-equivalencia-campo',agora:()=>agora,aleatorio:()=>0});
   const conta='conta-ficticia',chave='integracao-campo-offline-v1',idArq=conta+'|'+chave,value='{"versao":"fixture"}';
   const arquivo={key:chave,value,version:'versao-original',expected:null},arquivos={[idArq]:arquivo},hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)).then(h=>Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,'0')).join(''));
   const original=await fila.enfileirar({conta,id:'copia',unidade:'arquivo:'+idArq,recursos:['arquivo:'+idArq],modulo:'arquivos',operacoes:[],base:{},preparar:true,intencao:{edicoes:[],arquivos}});
   const callbacks={conta,dono:'worker',sessaoAtual:()=>true,preparar:async()=>({operacoes:[],sent:arquivos,identicos:{[idArq]:{version:arquivo.version,dados:{chave,path:conta+'/'+hash,hash,bytes:new TextEncoder().encode(value).length}}}}),
    consultarRecibo:async()=>{throw Error('não consultar recibo')},enviar:async()=>{envios++;throw Error('não salvar novamente')},reler:async()=>{throw Error('não gerar recibo')}};
   const baixado=await processarIntencao(fila,callbacks);
   await fila.fechar();const relido=(await fila.listar(conta))[0];
   await fila.enfileirar({conta,id:'copia-em-corrida',unidade:'arquivo:'+idArq,recursos:['arquivo:'+idArq],modulo:'arquivos',operacoes:[],base:{},preparar:true,intencao:{edicoes:[],arquivos}});
   const outraAba=abrirFilaIntencoes({nome:'fixture-equivalencia-campo',agora:()=>agora});
   let concorrencia;
   try{await processarIntencao(fila,{...callbacks,somenteId:'copia-em-corrida',preparar:async()=>{
    await outraAba.enfileirar({conta,id:'sucessor',unidade:'arquivo:'+idArq,recursos:['arquivo:'+idArq],modulo:'arquivos',operacoes:[],base:{},preparar:true,intencao:{edicoes:[],arquivos:{[idArq]:{...arquivo,value:'nova',version:'v2'}}}});
    return callbacks.preparar();
   }});}catch(e){concorrencia=e.code;}finally{await outraAba.fechar();}
   const atual=(await fila.listar(conta)).find(i=>i.id==='copia-em-corrida');
   await fila.enfileirar({conta,id:'processo',unidade:'processo',modulo:'processos',operacoes:[],base:{},preparar:true,intencao:{edicoes:[{colecao:'processos'},{colecao:'auditoria',id:'a',antes:{existe:false},depois:{existe:true,valor:{id:'a',acao:'Cadastro alterado'}}}],arquivos:{}}});
   for(let i=0;i<5;i++){try{await processarIntencao(fila,{...callbacks,somenteId:'processo',preparar:async()=>{throw new TypeError('transporte fixture')}});}catch{}agora+=61000;}
   // Contrato C1: cinco falhas transitórias de preparação não deixam o pedido parado (MAX_SAFE_INTEGER);
   // ele continua elegível com backoff, e o reparo único ao reconectar fica sem candidato.
   const reservadoDeNovo=await fila.reservar(conta,{dono:'worker',somenteId:'processo'});
   const dormindo=reservadoDeNovo?.proximaTentativa===Number.MAX_SAFE_INTEGER?reservadoDeNovo:null,elegivel=reservadoDeNovo?.id==='processo';
   if(reservadoDeNovo)await fila.liberarReserva(reservadoDeNovo);
   const reaberto=await fila.reabrirPreparacoesAoReconectar(conta);
   try{await processarIntencao(fila,{...callbacks,somenteId:'processo',preparar:async()=>{throw new TypeError('transporte fixture')}});}catch{}
   const segundo=await fila.reabrirPreparacoesAoReconectar(conta);
   const processo=(await fila.listar(conta)).find(i=>i.id==='processo');
   return {envios,concorrencia,corridaPreservada:atual.estado!=='dispensado'&&atual.original.intencao.arquivos[idArq].value===value,estado:baixado.estado,decisao:relido.decisao.tipo,mesmo:JSON.stringify(relido.original)===JSON.stringify(original.original),checksum:relido.checksum===original.checksum,recibo:!!relido.recibo,dormindo,elegivel,reaberto,segundo,enviosProcesso:processo.tentativasTotais};
  });
  assert.deepEqual(result,{envios:0,concorrencia:'CAMPO_COPIA_COM_DEPENDENTES',corridaPreservada:true,estado:'dispensado',decisao:'campo_ja_presente_no_servidor',mesmo:true,checksum:true,recibo:false,dormindo:null,elegivel:true,reaberto:0,segundo:0,enviosProcesso:0});
  console.log(JSON.stringify({ok:true,indexedDBReal:true,retomadaSemEscrita:true,reconexaoLimitada:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
