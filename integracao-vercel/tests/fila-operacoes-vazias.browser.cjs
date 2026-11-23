const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext();await context.route('**/tests/vazio.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Operações vazias isoladas</title>'}));
 const page=await context.newPage();await page.goto('http://127.0.0.1:5178/tests/vazio.html');
 const r=await page.evaluate(async()=>{
  const {abrirFilaIntencoes,processarIntencao,lerIntencaoExistente}=await import('/src/fila-intencoes.js'),{gravarOperacoes}=await import('/src/dados-compartilhados.js');
  let tempo=1000000,envios=0,recibosConsultados=0,leituras=0,fetches=0;const fetchOriginal=fetch;
  const fila=abrirFilaIntencoes({nome:'vazio-'+crypto.randomUUID(),agora:()=>tempo,aleatorio:()=>0});
  const base={metas:[{id:'meta',titulo:'base'}]},depois={metas:[{id:'meta',titulo:'pretendido'}]},edicoes=[{colecao:'metas',id:'meta',antes:{existe:true,valor:base.metas[0]},depois:{existe:true,valor:depois.metas[0]}}];
  const nova=(conta,legado=null)=>fila.enfileirar({conta,id:'pedido',unidade:'meta',modulo:'metas',operacoes:[],preparar:true,base:{},intencao:{edicoes,arquivos:{}},legado});
  const callbacks=conta=>({conta,dono:'fixture',sessaoAtual:()=>true,preparar:async()=>({operacoes:[],sent:{}}),enviar:i=>{envios++;return gravarOperacoes(i.payload,i.pedido,{});},consultarRecibo:async()=>{recibosConsultados++;return {aliases:{}};},reler:async()=>{leituras++;}});
  try{
   globalThis.fetch=async()=>{fetches++;throw Error('Rede externa bloqueada na reprodução');};
   const original=await nova('nova');let codigo;try{await processarIntencao(fila,callbacks('nova'));}catch(e){codigo=e.code;}
   tempo+=120000;const repetida=await processarIntencao(fila,callbacks('nova')),[item]=await fila.listar('nova');
   const novas={codigo,estado:item.estado,recibo:!!item.recibo,lido:!!item.lidoEm,proxima:item.proximaTentativa,repetida,envios: item.tentativasTotais,falhas:item.falhas,rejeicaoConfirmada:item.erro.rejeicaoConfirmada,checksum:item.checksum===original.checksum,original:JSON.stringify(item.original)===JSON.stringify(original.original)};
   const antigas=[];
   for(const recibo of [false,true])for(const suporte of [false,true]){
    const conta='antiga-'+recibo+'-'+suporte,original=await nova(conta,{before:base,after:depois,sent:{},...(recibo?{confirmacao:{aliases:{}}}:{})});
    let codigo;try{await(suporte?lerIntencaoExistente(fila,{...callbacks(conta),id:'pedido',modo:'releitura'}):processarIntencao(fila,callbacks(conta)));}catch(e){codigo=e.code;}
    const [i]=await fila.listar(conta);antigas.push({recibo,suporte,codigo:codigo||null,confirmado:i.estado==='confirmado',mesmo:i.checksum===original.checksum&&JSON.stringify(i.original)===JSON.stringify(original.original)});
   }
   const projecao={colecao:'_contagensClientes',antes:{existe:true,valor:[{total:1}]},depois:{existe:true,valor:[{total:2}]}},presenca={colecao:'usuarios',id:'u',antes:{existe:true,valor:{id:'u',online:false}},depois:{existe:true,valor:{id:'u',online:true}}};
   const puro=await fila.enfileirar({conta:'local',id:'local',unidade:'local',modulo:'usuarios',operacoes:[],preparar:true,base:{},intencao:{edicoes:[projecao,presenca],arquivos:{}}});
   await processarIntencao(fila,callbacks('local'));const [local]=await fila.listar('local');
   return {novas,antigas,local:{estado:local.estado,recibo:!!local.recibo,confirmado:!!local.confirmadoEm,lido:!!local.lidoEm,decisao:local.decisao.tipo,mesmo:local.checksum===puro.checksum&&JSON.stringify(local.original)===JSON.stringify(puro.original)},envios,recibosConsultados,leituras,fetches};
  }finally{globalThis.fetch=fetchOriginal;await fila.fechar();}
 });
 assert.deepEqual(r.novas,{codigo:'INTENCAO_SEM_OPERACOES',estado:'bloqueado_validacao',recibo:false,lido:false,proxima:Number.MAX_SAFE_INTEGER,repetida:null,envios:0,falhas:1,rejeicaoConfirmada:false,checksum:true,original:true});
 for(const i of r.antigas){assert.equal(i.confirmado,false);assert.equal(i.mesmo,true);if(!i.suporte||i.recibo)assert.equal(i.codigo,'INTENCAO_SEM_OPERACOES');}
 assert.deepEqual(r.local,{estado:'dispensado',recibo:false,confirmado:false,lido:false,decisao:'somente_projecao_derivada_local',mesmo:true});
 assert.equal(r.envios,0);assert.equal(r.recibosConsultados,0);assert.equal(r.leituras,0);assert.equal(r.fetches,0);
 console.log(JSON.stringify({ok:true,casos:6,indexedDBReal:true,adaptadorGravarReal:true,nenhumReciboFabricado:true,semRetryDeValidacao:true,dispensaLocalSemConfirmacao:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
