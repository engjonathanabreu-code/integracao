const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext();
 await context.route('**/tests/fila-otimizacao.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Fila sintética isolada</title>'}));
 const page=await context.newPage();await page.goto('http://127.0.0.1:5178/tests/fila-otimizacao.html');
 const passagem=await page.evaluate(async()=>{
  const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js'),{criarDiarioCompartilhado}=await import('/src/diario-compartilhado.js');
  let tempo=1000000;const fila=abrirFilaIntencoes({nome:'passagem-'+crypto.randomUUID(),agora:()=>tempo,aleatorio:()=>0});
  // Advancing a deterministic clock across queue refreshes reproduces a slow
  // pass where a failed preparation's cooldown expires before its next pick.
  const listar=fila.listar;fila.listar=async conta=>{tempo+=10000;return listar(conta);};
  const before={metas:[{id:'bloqueada',titulo:'base'},{id:'independente',titulo:'base'}],auditoria:[]},tentadas=[],enviadas=[];
  const diario=criarDiarioCompartilhado({conta:'fixture',ativo:()=>true,fila,atualizou:()=>{},
   carregar:async()=>({db:structuredClone(before)}),preparar:async(_,depois)=>{
    const id=depois.metas.find(m=>m.titulo==='local').id;tentadas.push(id);
    if(id==='bloqueada')throw new TypeError('falha temporária sintética');
    return {operacoes:[{table:'metas',key:{id},changes:{titulo:'local'}}],sent:{}};
   },enviar:async ops=>{enviadas.push(ops[0].key.id);return {aliases:{}};},consultarRecibo:async()=>null,confirmar:async()=>{}});
  try{
   for(const id of ['bloqueada','independente']){const after=structuredClone(before);after.metas.find(m=>m.id===id).titulo='local';await diario.adicionar(before,after);}
   const originais=(await fila.exportar('fixture')).intencoes.map(i=>({id:i.id,checksum:i.checksum,original:i.original}));
   await diario.executar();const rows=await fila.listar('fixture');
   return {tentadas,enviadas,estados:rows.map(i=>i.estado),originaisPreservados:originais.every(o=>rows.some(i=>i.id===o.id&&i.checksum===o.checksum&&JSON.stringify(i.original)===JSON.stringify(o.original)))};
  }finally{diario.fechar();}
 });
 console.log(JSON.stringify({passagem}));
 const reciboIncerto=await page.evaluate(async()=>{
  const {abrirFilaIntencoes,processarIntencao}=await import('/src/fila-intencoes.js');let tempo=1000000,envios=0,consultas=0;
  const fila=abrirFilaIntencoes({nome:'incerto-'+crypto.randomUUID(),agora:()=>tempo,aleatorio:()=>0});
  try{
   const original=await fila.enfileirar({conta:'fixture',id:'pedido-original',unidade:'meta',modulo:'metas',operacoes:[{table:'metas',key:{id:'meta'},changes:{titulo:'local'}}],base:{},intencao:{}});
   const callbacks={conta:'fixture',dono:'worker',sessaoAtual:()=>true,consultarRecibo:async()=>{consultas++;return undefined;},enviar:async()=>{envios++;throw new TypeError('resposta perdida');},reler:async()=>{throw Error('não há recibo');}};
   try{await processarIntencao(fila,callbacks);}catch{}
   tempo+=120000;try{await processarIntencao(fila,callbacks);}catch{}
   const [item]=await fila.listar('fixture');return {envios,consultas,estado:item.estado,pedido:item.pedido,checksumPreservado:item.checksum===original.checksum,recibo:!!item.recibo};
  }finally{await fila.fechar();}
 });
 console.log(JSON.stringify({reciboIncerto}));
 assert.deepEqual(passagem,{tentadas:['bloqueada','independente'],enviadas:['independente'],estados:['resultado_desconhecido','confirmado'],originaisPreservados:true});
 assert.deepEqual(reciboIncerto,{envios:1,consultas:1,estado:'resultado_desconhecido',pedido:'pedido-original',checksumPreservado:true,recibo:false});
 console.log(JSON.stringify({ok:true,casos:2,indexedDBReal:true,relogioSintetico:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
