const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5178';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/tests/sincronizacao-ciclo.html?diario&cenario=falha-leitura');
  await page.waitForFunction(()=>syncHarness?.ready&&syncHarness.sync.pendencias.some(i=>i.recibo&&i.erro));
  const antes=await page.evaluate(async()=>{
   const h=syncHarness,item=h.sync.pendencias.find(i=>i.recibo);
   const input=document.createElement('input');input.id='edicao-isolada';document.body.append(input);input.focus();
   await new Promise((resolve,reject)=>{
    const request=indexedDB.open('integracao-intencoes-v2');request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result,tx=db.transaction('intencoes','readwrite'),store=tx.objectStore('intencoes'),get=store.get([item.conta,item.id]);
     get.onsuccess=()=>{const i=get.result;i.proximaTentativa=Number.MAX_SAFE_INTEGER;i.falhas=5;i.erro={fase:'releitura',categoria:'transitoria',codigo:'TRANSPORTE',status:503,rejeicaoConfirmada:false};delete i.releituraTemporariaVerificada;store.put(i);};
     tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
   });
   h.flags.failReads=false;await h.sync.refresh({force:true});
   return {id:item.id,checksum:item.checksum,original:JSON.stringify(item.original),payload:JSON.stringify(item.payload),writes:h.stats.writes,posts:h.stats.posts,requests:h.stats.requests.length};
  });
  await page.waitForFunction(id=>syncHarness.sync.pendencias.find(i=>i.id===id)?.proximaTentativa===Number.MAX_SAFE_INTEGER,antes.id);
  const impedida=await page.evaluate(async id=>({suporte:await syncHarness.sync.executarSuporte({tipo:'reler_confirmacao',pedido:id}),diagnostico:syncHarness.sync.diagnosticarPendencia(id)}),antes.id);
  assert.equal(impedida.suporte.codigo,'EM_ANDAMENTO');assert.equal(impedida.suporte.itens[0].espera,'edicao_ativa');assert.equal(impedida.diagnostico.espera.motivo,'edicao_ativa');
  assert.equal(await page.evaluate(()=>syncHarness.stats.posts),antes.posts,'edição ativa não provoca envio');
  await page.evaluate(()=>{document.querySelector('#edicao-isolada').remove();window.dispatchEvent(new Event('focusout'));});
  await page.waitForFunction(()=>!syncHarness.sync.pendencias.length,{},{timeout:15000});
  const depois=await page.evaluate(()=>({writes:syncHarness.stats.writes,posts:syncHarness.stats.posts,requests:syncHarness.stats.requests}));
  assert.equal(depois.writes,antes.writes);assert.equal(depois.posts,antes.posts,'retomada faz somente leitura');
  assert.ok(depois.requests.slice(antes.requests).some(p=>p.endsWith('/rpc/integracao_consultar_pedido')),'recibo antigo revalidado com conta e payload originais');
  const final=await page.evaluate(async id=>{const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js');const f=abrirFilaIntencoes();try{return (await f.listar('00000000-0000-4000-8000-000000000001')).find(i=>i.id===id);}finally{await f.fechar();}},antes.id);
  assert.equal(final.estado,'confirmado');assert.equal(final.releituraTemporariaVerificada,true);
  assert.equal(final.checksum,antes.checksum);assert.equal(JSON.stringify(final.original),antes.original);assert.equal(JSON.stringify(final.payload),antes.payload,'releitura não reinterpreta a intenção fixada');
  await page.reload();await page.waitForFunction(()=>syncHarness?.ready&&!syncHarness.sync.pendencias.length);assert.equal(await page.evaluate(()=>syncHarness.stats.writes),antes.writes);
  assert.deepEqual(errors,[]);
  await context.close();console.log(JSON.stringify({ok:true,retomadaAposEdicao:true,reciboAntigoRevalidado:true,zeroReenvio:true,diagnosticoSemPII:true,reload:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
