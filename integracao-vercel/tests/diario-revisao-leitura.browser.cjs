const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext();
  await context.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?diario&cenario=fantasma');
  await page.waitForFunction(()=>window.syncHarness?.ready&&!syncHarness.sync.pendencias.length&&syncHarness.stats.writes===1);
  const original=await page.evaluate(()=>{
   const h=syncHarness,base=h.base().metas[0].titulo,buscar=window.fetch;let armada=true;
   window.fetch=async(input,options)=>{
    const r=await buscar(input,options);
    if(armada&&String(input).includes('/rpc/integracao_gravar')){
     armada=false;const atual=JSON.parse(localStorage.getItem('harness-server'));atual.metas[0].titulo=base;localStorage.setItem('harness-server',JSON.stringify(atual));
    }
    return r;
   };
   h.sync.mutate(d=>{d.metas[0].titulo='Alteração com recibo';return d;});return base;
  });
  await page.evaluate(()=>syncHarness.sync.flush());
  await page.waitForFunction(()=>syncHarness.sync.pendencias.some(i=>i.recibo&&i.erro?.codigo==='LEITURA_DIVERGENTE'));
  assert.equal(await page.evaluate(()=>syncHarness.db.metas[0].titulo),original,'overlay não mascara valor atual com envio antigo');
  const writes=await page.evaluate(()=>syncHarness.stats.writes);
  await page.locator('summary').filter({hasText:'Pendências de sincronização'}).click();
  await page.getByRole('button',{name:'Revisar esta alteração',exact:true}).click();
  await page.getByRole('region',{name:'Revisar leitura após recibo'}).waitFor();
  await page.evaluate(()=>{const b=JSON.parse(localStorage.getItem('harness-server'));b.metas[0].titulo='Outra alteração concorrente';localStorage.setItem('harness-server',JSON.stringify(b));});
  page.on('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Reconhecer valores atuais sem reenviar',exact:true}).click();
  await page.waitForFunction(()=>syncHarness.sync.error.includes('mudaram'));
  assert.equal(await page.evaluate(()=>syncHarness.sync.pendencias.length),1,'prévia antiga não autoriza aceitar novo estado');
  await page.getByRole('button',{name:'Fechar prévia',exact:true}).click();
  await page.getByRole('button',{name:'Revisar esta alteração',exact:true}).click();
  await page.getByRole('region',{name:'Revisar leitura após recibo'}).waitFor();
  await page.getByRole('button',{name:'Reconhecer valores atuais sem reenviar',exact:true}).click();
  await page.waitForFunction(()=>!syncHarness.sync.pendencias.length&&!syncHarness.sync.previaPendencia);
  assert.equal(await page.evaluate(()=>syncHarness.stats.writes),writes);
  assert.equal(await page.evaluate(()=>syncHarness.db.metas[0].titulo),'Outra alteração concorrente');
  const archive=await page.evaluate(async()=>{
   const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js'),f=abrirFilaIntencoes();
   try{const i=(await f.listar('00000000-0000-4000-8000-000000000001')).find(i=>i.decisao?.tipo==='aceitar_estado_atual_apos_recibo');return {estado:i.estado,titulo:i.original.intencao.edicoes.find(e=>e.colecao==='metas').depois.valor.titulo,recibo:!!i.recibo};}finally{f.fechar();}
  });
  assert.deepEqual(archive,{estado:'confirmado',titulo:'Alteração com recibo',recibo:true});
  await page.reload();await page.waitForFunction(()=>window.syncHarness?.ready&&!syncHarness.sync.pendencias.length);
  assert.equal(await page.evaluate(()=>syncHarness.stats.writes),writes,'reload não reenvia pedido arquivado');
  console.log(JSON.stringify({ok:true,hookReal:true,indexedDBReal:true,previaObsoletaBloqueada:true,semReenvio:true,semDadosReais:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
