const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext();
  await context.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  await context.route('**/tests/fila-arquivos.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Arquivos isolados</title>'}));
  const page=await context.newPage();
  const iniciar=async()=>{await page.goto('http://127.0.0.1:5178/tests/fila-arquivos.html');await page.evaluate(async()=>{
   window.mod=await import('/src/fila-intencoes.js');window.arq=await import('/src/arquivos-intencoes.js');
   window.fila=mod.abrirFilaIntencoes({nome:'fixture-arquivos-isolamento'});
  });};
  await iniciar();
  const criado=await page.evaluate(async()=>{
   const arquivo={key:'integracao-foto-v4-f',value:'fixture',version:'v1',expected:null};
   await fila.enfileirar({conta:'a',id:'arquivo',unidade:'arquivo:f',modulo:'arquivos',recursos:['arquivo:f'],operacoes:[],preparar:true,base:{},intencao:{edicoes:[],arquivos:{f:arquivo}}});
   const bloqueio=await fila.reservar('a',{dono:'worker'});await fila.registrarFalha(bloqueio,{status:422,code:'23503'});
   const original=await fila.enfileirar({conta:'a',id:'independente',unidade:'meta:m',modulo:'metas',recursos:['meta:m','arquivo:f'],operacoes:[],preparar:true,base:{},intencao:{edicoes:[{colecao:'metas',id:'m',antes:{existe:true,valor:{id:'m',titulo:'Antes'}},depois:{existe:true,valor:{id:'m',titulo:'Depois'}}}],arquivos:{f:arquivo}}});
   const reservado=await fila.reservar('a',{dono:'worker'});
   if(!reservado)return {erro:'não reservou'};
   const selecionados=arq.arquivosDaIntencao(reservado,await fila.listar('a'));
   await fila.fixarPayload(reservado,[{table:'metas',changes:{titulo:'Depois'}}],{sent:selecionados});
   const recebido=await fila.registrarRecibo(reservado,{aliases:{}});
   await fila.registrarFalha(recebido,{status:503});
   await fila.retomar('a',reservado.id);
   return {id:reservado.id,original:original.original,checksum:original.checksum,selecionados,dependencias:reservado.dependencias,escopo:reservado.escopoArquivos};
  });
  assert.equal(criado.id,'independente');assert.deepEqual(criado.selecionados,{});assert.deepEqual(criado.dependencias,['arquivo']);assert.deepEqual(criado.escopo.dependencias,[]);
  await iniciar();
  const retomado=await page.evaluate(async()=>{
   const item=await fila.reservar('a',{dono:'apos-reload'});if(!item)return null;
   await fila.confirmarLeitura(item);return {id:item.id,fase:item.fase,original:item.original,checksum:item.checksum,arquivos:(await fila.listar('a')).find(i=>i.id==='arquivo').estado};
  });
  assert.equal(retomado.id,'independente');assert.equal(retomado.fase,'releitura');assert.deepEqual(retomado.original,criado.original);assert.equal(retomado.checksum,criado.checksum);assert.equal(retomado.arquivos,'bloqueado_validacao');
  const orfao=await page.evaluate(async()=>{
   const arquivo={key:'integracao-foto-v4-f',value:'fixture',version:'v1',expected:null};
   const original=await fila.enfileirar({conta:'orfao',id:'dados',unidade:'meta:m',modulo:'metas',recursos:['meta:m','arquivo:f'],operacoes:[],preparar:true,base:{},intencao:{edicoes:[{colecao:'metas',id:'m',antes:{existe:true,valor:{id:'m',titulo:'Antes'}},depois:{existe:true,valor:{id:'m',titulo:'Depois'}}}],arquivos:{f:arquivo}}});
   // Capturing the orphan freezes the predecessor scope in this same IDB transaction.
   const filho=await fila.enfileirar({conta:'orfao',id:'arquivo',unidade:'arquivo:f',modulo:'arquivos',recursos:['arquivo:f'],operacoes:[],preparar:true,base:{},intencao:{edicoes:[],arquivos:{f:arquivo}}});
   const dados=await fila.reservar('orfao',{dono:'worker'});await fila.registrarFalha(dados,{status:409,code:'PT409'});
   const liberado=await fila.reservar('orfao',{dono:'worker'});
   return {dependencias:filho.dependencias,id:liberado?.id,arquivo:liberado&&arq.arquivosDaIntencao(liberado,await fila.listar('orfao')),originalPreservado:JSON.stringify(dados.original)===JSON.stringify(original.original),checksumPreservado:dados.checksum===original.checksum,escopo:dados.escopoArquivos};
  });
  assert.deepEqual(orfao.dependencias,[]);assert.equal(orfao.id,'arquivo');assert.equal(orfao.arquivo.f.value,'fixture');assert.equal(orfao.originalPreservado,true);assert.equal(orfao.checksumPreservado,true);assert.deepEqual(orfao.escopo.ids,[]);
  const substituicoes=await page.evaluate(async()=>{
   const resultados=[];
   for(const caminho of ['enfileirar','substituir']){
    const conta='revisao-'+caminho,arquivo={key:'integracao-foto-v4-f',value:'fixture',version:'v1',expected:null};
    const base={conta,modulo:'metas',operacoes:[],preparar:true,base:{}};
    await fila.enfileirar({...base,id:'arquivo',unidade:'arquivo:f',recursos:['arquivo:f'],intencao:{edicoes:[],arquivos:{f:arquivo}}});
    await fila.registrarFalha(await fila.reservar(conta,{dono:'worker'}),{status:422,code:'23503'});
    const edicoes=[{colecao:'metas',id:'m',antes:{existe:true,valor:{id:'m',titulo:'Antes'}},depois:{existe:true,valor:{id:'m',titulo:'Depois'}}}];
    const original=await fila.enfileirar({...base,id:'dados',unidade:'meta:m',recursos:['meta:m','arquivo:f'],intencao:{edicoes,arquivos:{f:arquivo}}});
    const dados=await fila.reservar(conta,{dono:'worker'});await fila.registrarFalha(dados,{status:409,code:'PT409'});
    const substituta={...base,id:'corrigida',unidade:'meta:m',recursos:['meta:m'],intencao:{edicoes,arquivos:{}}};
    if(caminho==='enfileirar')await fila.enfileirar({...substituta,substituirId:'dados'});
    else{
     await fila.enfileirar(substituta);
     // Another enqueue may have frozen a scope on the replacement before review.
     await fila.enfileirar({...base,id:'posterior',unidade:'meta:z',recursos:['meta:z'],dependencias:['corrigida'],intencao:{edicoes:[],arquivos:{}}});
     await fila.substituir(conta,'dados','corrigida');
    }
    const pronta=await fila.reservar(conta,{dono:'worker'}),historica=(await fila.listar(conta)).find(i=>i.id==='dados');
    resultados.push({caminho,id:pronta?.id,dependencias:pronta?.dependencias,escopo:pronta?.escopoArquivos?.dependencias,originalPreservado:JSON.stringify(historica.original)===JSON.stringify(original.original),checksumPreservado:historica.checksum===original.checksum,historicas:historica.dependencias});
   }
   return resultados;
  });
  for(const r of substituicoes){assert.equal(r.id,'corrigida',r.caminho);assert.deepEqual(r.dependencias,[]);if(r.escopo)assert.deepEqual(r.escopo,[]);assert.deepEqual(r.historicas,['arquivo']);assert.equal(r.originalPreservado,true);assert.equal(r.checksumPreservado,true);}
  const legadoBloqueado=await page.evaluate(async()=>{
   const conta='historico-sem-enqueue',arquivo={key:'integracao-foto-v4-f',value:'fixture',version:'v1',expected:null};
   const base={conta,modulo:'metas',operacoes:[],preparar:true,base:{}};
   await fila.enfileirar({...base,id:'pai',unidade:'pai',recursos:['pai'],intencao:{edicoes:[],arquivos:{}}});
   await fila.registrarFalha(await fila.reservar(conta,{dono:'worker'}),{status:422,code:'23503'});
   const dados=await fila.enfileirar({...base,id:'dados',unidade:'meta:m',recursos:['meta:m','arquivo:f'],dependencias:['pai'],intencao:{edicoes:[{colecao:'metas',id:'m',antes:{existe:true,valor:{id:'m',titulo:'Antes'}},depois:{existe:true,valor:{id:'m',titulo:'Depois'}}}],arquivos:{f:arquivo}}});
   const arqOriginal=await fila.enfileirar({...base,id:'arquivo',unidade:'arquivo:f',recursos:['arquivo:f'],intencao:{edicoes:[],arquivos:{f:arquivo}}});
   // Restore the exact shape of old persisted entries: no execution scopes and
   // an automatic global-file dependency. No enqueue is allowed after this point.
   await fila.fechar();
   await new Promise((resolve,reject)=>{
    const request=indexedDB.open('fixture-arquivos-isolamento');request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
     const db=request.result,tx=db.transaction('intencoes','readwrite'),store=tx.objectStore('intencoes');
     for(const [id,deps] of [['dados',['pai']],['arquivo',['dados']]]){
      const get=store.get([conta,id]);get.onsuccess=()=>{const item=get.result;delete item.escopoArquivos;item.dependencias=deps;store.put(item);};
     }
     tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
   });
   const pronta=await fila.reservar(conta,{dono:'apos-reload'}),items=await fila.listar(conta),a=items.find(i=>i.id==='dados'),b=items.find(i=>i.id==='arquivo');
   return {id:pronta?.id,dadosEstado:a.estado,dadosDeps:a.escopoArquivos?.dependencias,arquivoDeps:b.escopoArquivos?.dependencias,historicas:b.dependencias,dadosPreservados:JSON.stringify(a.original)===JSON.stringify(dados.original)&&a.checksum===dados.checksum,arquivoPreservado:JSON.stringify(b.original)===JSON.stringify(arqOriginal.original)&&b.checksum===arqOriginal.checksum};
  });
  assert.equal(legadoBloqueado.id,'arquivo');assert.equal(legadoBloqueado.dadosEstado,'pendente_local');assert.deepEqual(legadoBloqueado.dadosDeps,['pai']);assert.deepEqual(legadoBloqueado.arquivoDeps,[]);assert.deepEqual(legadoBloqueado.historicas,['dados']);assert.equal(legadoBloqueado.dadosPreservados,true);assert.equal(legadoBloqueado.arquivoPreservado,true);
  console.log(JSON.stringify({ok:true,cenarios:6,indexedDBReal:true,reload:true,originaisPreservados:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
