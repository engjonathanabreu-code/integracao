const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});let casos=0;
 try{
  const context=await browser.newContext();
  await context.route('**/tests/otimizacao-seguranca.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>QA sintética</title>'}));
  const page=await context.newPage();await page.goto('http://127.0.0.1:5178/tests/otimizacao-seguranca.html');
  await page.evaluate(async()=>{
   window.mod=await import('/src/fila-intencoes.js');window.tempo=1000000;
   window.fila=mod.abrirFilaIntencoes({nome:'qa-otimizacao-seguranca',agora:()=>tempo,aleatorio:()=>0});
   window.nova=(conta,id,unidade=id,dependencias=[])=>fila.enfileirar({conta,id,unidade,dependencias,modulo:'metas',operacoes:[{table:'metas',key:{id},changes:{titulo:'sintético'}}],base:{},intencao:{edicoes:[]}});
   window.opcoes=(conta,callbacks={})=>({conta,dono:'qa',sessaoAtual:()=>true,consultarRecibo:async()=>null,enviar:async()=>({aliases:{}}),reler:async()=>{},...callbacks});
  });
  let r=await page.evaluate(async()=>{
   await nova('normal','n');let envios=0,consultas=0,leituras=0;
   const i=await mod.processarIntencao(fila,opcoes('normal',{consultarRecibo:async()=>{consultas++;return null;},enviar:async()=>{envios++;return {aliases:{}};},reler:async()=>{leituras++;}}));
   return {envios,consultas,leituras,estado:i.estado};
  });assert.deepEqual(r,{envios:1,consultas:0,leituras:1,estado:'confirmado'});casos++;
  // Queda antes/depois do commit conserva a identidade e nunca duplica a gravação.
  for(const depois of [false,true]){
   r=await page.evaluate(async depois=>{
    const conta='queda-'+depois,original=await nova(conta,'pedido');let envios=0,gravacoes=0,consultas=0,leituras=0,recibo=null;const pedidos=[];
    const cb=opcoes(conta,{consultarRecibo:async()=>{consultas++;return recibo;},enviar:async i=>{envios++;pedidos.push(i.pedido);if(envios===1){if(depois){gravacoes++;recibo={aliases:{}};}throw new TypeError('queda sintética');}gravacoes++;return {aliases:{}};},reler:async()=>{leituras++;}});
    try{await mod.processarIntencao(fila,cb);}catch{}tempo+=120000;const i=await mod.processarIntencao(fila,cb);
    return {envios,gravacoes,consultas,leituras,pedidos,estado:i.estado,checksumIgual:i.checksum===original.checksum,total:(await fila.listar(conta)).length};
   },depois);assert.deepEqual(r,{envios:depois?1:2,gravacoes:1,consultas:1,leituras:1,pedidos:depois?['pedido']:['pedido','pedido'],estado:'confirmado',checksumIgual:true,total:1});casos++;
  }
  // undefined e erro não provam ausência e não autorizam nova escrita.
  for(const resultado of ['undefined','erro']){
   r=await page.evaluate(async resultado=>{
    const conta='incerta-'+resultado,original=await nova(conta,'i');let envios=0,leituras=0,consultas=0;
    const cb=opcoes(conta,{consultarRecibo:async()=>{consultas++;if(resultado==='erro')throw new TypeError('consulta sintética indisponível');return undefined;},enviar:async()=>{envios++;throw new TypeError('resposta desconhecida');},reler:async()=>{leituras++;}});
    for(let n=0;n<8;n++){try{await mod.processarIntencao(fila,cb);}catch{}tempo+=120000;}
    const itens=await fila.listar(conta),i=itens[0];return {envios,leituras,consultas,estado:i.estado,semRecibo:!i.recibo,originalIgual:JSON.stringify(i.original)===JSON.stringify(original.original),checksumIgual:i.checksum===original.checksum,total:itens.length};
   },resultado);assert.equal(r.envios,1);assert.equal(r.leituras,0);assert.ok(r.consultas>0&&r.consultas<=5);assert.equal(r.estado,'resultado_desconhecido');assert.equal(r.semRecibo,true);assert.equal(r.originalIgual,true);assert.equal(r.checksumIgual,true);assert.equal(r.total,1);casos++;
  }
  // Regra genérica, permissão e conflito mantêm a unidade e liberam a independente.
  for(const [code,status,estado] of [['P0001',null,'bloqueado_validacao'],['42501',403,'bloqueado_validacao'],['PT409',409,'bloqueado_conflito']]){
   r=await page.evaluate(async({code,status})=>{
    const conta='recusa-'+code,original=await nova(conta,'bloqueado','registro');await nova(conta,'sucessor','registro');await nova(conta,'livre','outro');const envios=[];
    const cb=opcoes(conta,{enviar:async i=>{envios.push(i.id);if(i.id==='bloqueado')throw Object.assign(Error('CPF privado sintético'),{code,...(status?{status}:{})});return {aliases:{}};}});
    for(let n=0;n<8;n++){try{await mod.processarIntencao(fila,cb);}catch{}tempo+=120000;}
    const itens=await fila.listar(conta),i=itens[0];return {envios,estado:i.estado,sucessor:itens[1].estado,livre:itens[2].estado,rejeicaoConfirmada:i.erro.rejeicaoConfirmada,erro:JSON.stringify(i.erro),checksumIgual:i.checksum===original.checksum,total:itens.length};
   },{code,status});assert.deepEqual(r.envios,['bloqueado','livre']);assert.equal(r.estado,estado);assert.equal(r.sucessor,'pendente_local');assert.equal(r.livre,'confirmado');assert.equal(r.rejeicaoConfirmada,!!status);assert.doesNotMatch(r.erro,/CPF|privado|message/);assert.equal(r.checksumIgual,true);assert.equal(r.total,3);casos++;
  }
  // Recibo antigo só encerra após leitura válida; falha não cria nova escrita.
  r=await page.evaluate(async()=>{
   const original=await fila.enfileirar({conta:'antiga',id:'pedido-antigo',unidade:'evento',modulo:'eventos',operacoes:[{table:'erp_eventos',key:{id:'evento'},changes:{titulo:'sintético'}}],base:{},intencao:{edicoes:[]},legado:{before:{},after:{},confirmacao:{aliases:{}}}});
   let envios=0,consultas=0,leituras=0;
   const cb=opcoes('antiga',{consultarRecibo:async()=>{consultas++;return {aliases:{}};},enviar:async()=>{envios++;return {aliases:{}};},reler:async()=>{if(++leituras===1)throw Object.assign(Error('leitura sintética indisponível'),{status:503});}});
   try{await mod.processarIntencao(fila,cb);}catch{}const antes=(await fila.listar('antiga'))[0];tempo+=120000;const i=await mod.processarIntencao(fila,cb);
   return {envios,consultas,leituras,antes:antes.estado,depois:i.estado,total:(await fila.listar('antiga')).length,originalIgual:JSON.stringify(i.original)===JSON.stringify(original.original),checksumIgual:i.checksum===original.checksum};
  });assert.deepEqual(r,{envios:0,consultas:2,leituras:2,antes:'confirmado_aguardando_leitura',depois:'confirmado',total:1,originalIgual:true,checksumIgual:true});casos++;
  // Um recibo apenas local não prova autoria/pedido: consulta ausente ou diferente preserva.
  for(const resultado of ['ausente','diferente']){
   r=await page.evaluate(async resultado=>{
    const conta='local-'+resultado;const original=await fila.enfileirar({conta,id:'antigo',unidade:'evento',modulo:'eventos',operacoes:[{table:'erp_eventos',key:{id:'evento'},changes:{titulo:'sintético'}}],base:{},intencao:{edicoes:[]},legado:{before:{},after:{},confirmacao:{aliases:{}}}});
    let envios=0,leituras=0,consultas=0,codigo;
    try{await mod.processarIntencao(fila,opcoes(conta,{consultarRecibo:async()=>{consultas++;return resultado==='ausente'?null:{aliases:{outro:'valor'}};},enviar:async()=>{envios++;return {aliases:{}};},reler:async()=>{leituras++;}}));}catch(e){codigo=e.code;}
    const i=(await fila.listar(conta))[0];return {envios,leituras,consultas,codigo,estado:i.estado,recibo:i.recibo,checksumIgual:i.checksum===original.checksum,total:(await fila.listar(conta)).length};
   },resultado);assert.deepEqual(r,{envios:0,leituras:0,consultas:1,codigo:'RECIBO_INCONCLUSIVO',estado:'confirmado_aguardando_leitura',recibo:{aliases:{}},checksumIgual:true,total:1});casos++;
  }
  // Recibo de outro pedido não comprova esta intenção.
  r=await page.evaluate(async()=>{
   await nova('recibo-invalido','pedido-real');let leituras=0,codigo;
   try{await mod.processarIntencao(fila,opcoes('recibo-invalido',{enviar:async()=>({aliases:{},protocoloRecibo:1,pedido:'outro-pedido',confirmadoEm:new Date().toISOString(),resultados:[]}),reler:async()=>{leituras++;}}));}catch(e){codigo=e.code;}
   const i=(await fila.listar('recibo-invalido'))[0];return {codigo,leituras,estado:i.estado,recibo:!!i.recibo,total:(await fila.listar('recibo-invalido')).length};
  });assert.deepEqual(r,{codigo:'RECIBO_INVALIDO',leituras:0,estado:'resultado_desconhecido',recibo:false,total:1});casos++;
  const outra=await context.newPage();await outra.goto('http://127.0.0.1:5178/tests/otimizacao-seguranca.html');
  await outra.evaluate(async()=>{window.mod=await import('/src/fila-intencoes.js');window.fila=mod.abrirFilaIntencoes({nome:'qa-otimizacao-seguranca',agora:()=>999999999,aleatorio:()=>0});});
  await page.evaluate(()=>nova('abas','unico'));
  const reservas=await Promise.all([page.evaluate(()=>fila.reservar('abas',{dono:'primeira',leaseMs:1000000000})),outra.evaluate(()=>fila.reservar('abas',{dono:'segunda',leaseMs:1000000000}))]);
  assert.equal(reservas.filter(Boolean).length,1);assert.equal(reservas.find(Boolean).id,'unico');casos++;
  await outra.evaluate(()=>fila.fechar());await page.evaluate(()=>fila.fechar());await context.close();
  console.log(JSON.stringify({ok:true,casos,indexedDBReal:true,duasAbasReais:true,dadosSinteticos:true,redeExternaBloqueada:!!process.env.PLAYWRIGHT_MODULE,producaoAcessada:false}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
