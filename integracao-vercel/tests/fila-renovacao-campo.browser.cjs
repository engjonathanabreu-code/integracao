const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true});try{
 const c=await b.newContext();await c.route('**/tests/folga.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Folga sintética</title>'}));
 const p=await c.newPage();await p.goto('http://127.0.0.1:5178/tests/folga.html');
 const rows=await p.evaluate(async()=>{
  const {abrirFilaIntencoes,processarIntencao}=await import('/src/fila-intencoes.js'),result=[];
  for(const modo of ['web-lock-real','sem-web-lock','trava-injetada']){
   const fila=abrirFilaIntencoes({nome:'folga-'+modo+'-'+crypto.randomUUID()});let renovacoes=0,envios=0,consultas=0,leituras=0;
   const renovar=fila.renovarReserva;fila.renovarReserva=async(...args)=>{renovacoes++;return renovar(...args);};
   await fila.enfileirar({conta:'a',id:'p',unidade:'meta',modulo:'metas',operacoes:[],preparar:true,base:{},intencao:{edicoes:[{colecao:'metas',id:'meta',antes:{existe:true,valor:{id:'meta',titulo:'antes'}},depois:{existe:true,valor:{id:'meta',titulo:'depois'}}}],arquivos:{}}});
   const extras=modo==='sem-web-lock'?{travas:null}:modo==='trava-injetada'?{travas:{request:(name,_,fn)=>fn({name,mode:'exclusive'})}}:{};
   try{const i=await processarIntencao(fila,{conta:'a',dono:'fixture',sessaoAtual:()=>true,...extras,preparar:async()=>({operacoes:[{table:'metas',key:{id:'meta'},changes:{titulo:'depois'}}],sent:{}}),consultarRecibo:async()=>{consultas++;return null;},enviar:async()=>{envios++;return {aliases:{}};},reler:async()=>{leituras++;}});result.push({modo,renovacoes,envios,consultas,leituras,estado:i.estado});}finally{await fila.fechar();}
  }
  return result;
 });
 assert.deepEqual(rows,[{modo:'web-lock-real',renovacoes:0,envios:1,consultas:0,leituras:1,estado:'confirmado'},{modo:'sem-web-lock',renovacoes:6,envios:1,consultas:0,leituras:1,estado:'confirmado'},{modo:'trava-injetada',renovacoes:6,envios:1,consultas:0,leituras:1,estado:'confirmado'}]);
 const fronteiras=await p.evaluate(async()=>{
  const {abrirFilaIntencoes,processarIntencao}=await import('/src/fila-intencoes.js'),result=[];
  for(const caso of ['perto','expirado','recuo','prazo-renovado']){
   let tempo=1000,renovacoes=0,envios=0,leituras=0;const fila=abrirFilaIntencoes({nome:'fronteira-'+caso+'-'+crypto.randomUUID(),agora:()=>tempo});
   const renovar=fila.renovarReserva;fila.renovarReserva=async(...args)=>{renovacoes++;return renovar(...args);};
   const original=await fila.enfileirar({conta:'a',id:'p',unidade:'meta',modulo:'metas',operacoes:[],preparar:true,base:{},intencao:{edicoes:[{colecao:'metas',id:'meta',antes:{existe:true,valor:{id:'meta',titulo:'antes'}},depois:{existe:true,valor:{id:'meta',titulo:'depois'}}}],arquivos:{}}});
   try{
    const i=await processarIntencao(fila,{conta:'a',dono:'fixture',sessaoAtual:()=>true,preparar:async()=>{tempo+=caso==='expirado'?61000:caso==='recuo'?-1:40000;return {operacoes:[{table:'metas',key:{id:'meta'},changes:{titulo:'depois'}}],sent:{}};},enviar:async()=>{envios++;if(caso==='prazo-renovado')tempo+=20000;return {aliases:{}};},reler:async()=>{leituras++;}});
    result.push({caso,renovacoes,envios,leituras,estado:i.estado,preservado:i.checksum===original.checksum&&JSON.stringify(i.original)===JSON.stringify(original.original)});
   }finally{await fila.fechar();}
  }
  return result;
 });
 for(const r of fronteiras)assert.deepEqual(r,{caso:r.caso,renovacoes:1,envios:1,leituras:1,estado:'confirmado',preservado:true});
 const roubadas=await p.evaluate(async()=>{
  const {abrirFilaIntencoes,processarIntencao}=await import('/src/fila-intencoes.js'),result=[];
  for(const fase of ['preparacao','envio','releitura']){
   const nome='roubo-'+fase+'-'+crypto.randomUUID(),fila=abrirFilaIntencoes({nome,agora:()=>1000}),legado=abrirFilaIntencoes({nome,agora:()=>62000});let envios=0,leituras=0,codigo;
   const original=await fila.enfileirar({conta:'a',id:'p',unidade:'meta',modulo:'metas',operacoes:[],preparar:true,base:{},intencao:{edicoes:[{colecao:'metas',id:'meta',antes:{existe:true,valor:{id:'meta',titulo:'antes'}},depois:{existe:true,valor:{id:'meta',titulo:'depois'}}}],arquivos:{}}});
   const roubar=()=>legado.reservar('a',{dono:'cliente-antigo'});
   try{
    try{await processarIntencao(fila,{conta:'a',dono:'fixture',sessaoAtual:()=>true,preparar:async()=>{if(fase==='preparacao')await roubar();return {operacoes:[{table:'metas',key:{id:'meta'},changes:{titulo:'depois'}}],sent:{}};},enviar:async()=>{envios++;if(fase==='envio')await roubar();return {aliases:{}};},reler:async()=>{leituras++;if(fase==='releitura')await roubar();}});}catch(e){codigo=e.code;}
    const [i]=await fila.listar('a');result.push({fase,codigo,envios,leituras,confirmado:i.estado==='confirmado',lido:!!i.lidoEm,preservado:i.checksum===original.checksum&&JSON.stringify(i.original)===JSON.stringify(original.original)});
   }finally{await fila.fechar();await legado.fechar();}
  }
  return result;
 });
 for(const r of roubadas)assert.deepEqual(r,{fase:r.fase,codigo:'RESERVA_EXPIRADA',envios:r.fase==='preparacao'?0:1,leituras:r.fase==='releitura'?1:0,confirmado:false,lido:false,preservado:true});
 const contencao=await p.evaluate(async()=>{
  const {abrirFilaIntencoes,processarIntencao}=await import('/src/fila-intencoes.js'),fila=abrirFilaIntencoes({nome:'nula-'+crypto.randomUUID()});let callbacks=0,renovacoes=0;
  const renovar=fila.renovarReserva;fila.renovarReserva=async(...args)=>{renovacoes++;return renovar(...args);};
  await fila.enfileirar({conta:'a',id:'p',unidade:'meta',modulo:'metas',operacoes:[{table:'metas',key:{id:'meta'},changes:{titulo:'depois'}}],base:{},intencao:{}});
  try{const r=await processarIntencao(fila,{conta:'a',dono:'fixture',sessaoAtual:()=>true,travas:{request:(_,__,fn)=>fn(null)},enviar:async()=>{callbacks++;},reler:async()=>{callbacks++;}}),[i]=await fila.listar('a');return {nulo:r===null,callbacks,renovacoes,tentativas:i.tentativas,falhas:i.falhas||0};}finally{await fila.fechar();}
 });
 assert.deepEqual(contencao,{nulo:true,callbacks:0,renovacoes:0,tentativas:0,falhas:0});
 const encerramento=await p.evaluate(async()=>{
  const {abrirFilaIntencoes,processarIntencao}=await import('/src/fila-intencoes.js'),result=[],ativos=new Set(),intervalo=globalThis.setInterval,limpar=globalThis.clearInterval;
  globalThis.setInterval=(...args)=>{const id=intervalo(...args);ativos.add(id);return id;};globalThis.clearInterval=id=>{ativos.delete(id);return limpar(id);};
  try{
   for(const falhar of [false,true]){
    const fila=abrirFilaIntencoes({nome:'cleanup-'+falhar+'-'+crypto.randomUUID()});let renovacoes=0,codigo;
    const renovar=fila.renovarReserva;fila.renovarReserva=async(...args)=>{renovacoes++;await new Promise(r=>setTimeout(r,20));return renovar(...args);};
    await fila.enfileirar({conta:'a',id:'p',unidade:'meta',modulo:'metas',operacoes:[{table:'metas',key:{id:'meta'},changes:{titulo:'depois'}}],base:{},intencao:{}});
    try{
     try{await processarIntencao(fila,{conta:'a',dono:'fixture',renovarCadaMs:50,sessaoAtual:()=>true,enviar:async()=>{await new Promise(r=>setTimeout(r,180));if(falhar)throw new TypeError('falha sintética');return {aliases:{}};},reler:async()=>{}});}catch(e){codigo=e.name;}
     const antes=renovacoes;await fila.fechar();await new Promise(r=>setTimeout(r,120));result.push({falhar,teveHeartbeat:antes>0,semRenovacaoTardia:renovacoes===antes,timers:ativos.size,codigo:codigo||null});
    }finally{await fila.fechar();}
   }
  }finally{globalThis.setInterval=intervalo;globalThis.clearInterval=limpar;}
  return result;
 });
 assert.deepEqual(encerramento,[{falhar:false,teveHeartbeat:true,semRenovacaoTardia:true,timers:0,codigo:null},{falhar:true,teveHeartbeat:true,semRenovacaoTardia:true,timers:0,codigo:'TypeError'}]);
 console.log(JSON.stringify({ok:true,casos:13,renovacaoCondicional:rows,fronteiras,roubadas,contencao,encerramento}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
