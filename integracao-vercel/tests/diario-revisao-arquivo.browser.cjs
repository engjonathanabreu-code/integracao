const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  await context.route('**/tests/revisao-arquivo-fixture.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><div id="root"></div>'}));
  const page=await context.newPage();await page.goto('http://127.0.0.1:5178/tests/revisao-arquivo-fixture.html');
  await page.evaluate(async()=>{
   const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js'),{criarDiarioCompartilhado}=await import('/src/diario-compartilhado.js'),{resumoBytes}=await import('/src/revisao-arquivo-recusado.js');
   const {default:React}=await import('/node_modules/.vite/deps/react.js'),{createRoot}=await import('/node_modules/.vite/deps/react-dom_client.js'),{default:Painel}=await import('/src/PendenciasSincronizacao.jsx');
   const conta='fixture',key='integracao-campo-offline-v1',id=conta+'|'+key,a={key,value:'original local fixture',version:'v1',expected:null};
   const remote=await resumoBytes('original remoto fixture'),local=await resumoBytes(a.value);
   const row={colecao:'arquivos',registro_id:id,criado_por:conta,referencia_tabela:null,referencia_id:null,updated_at:'2026-11-20T00:00:00Z',dados:{chave:key,path:conta+'/'+remote.hash,...remote}};
   const fila=abrirFilaIntencoes({nome:'revisao-arquivo-fixture'});
   await fila.enfileirar({conta,id:'root',unidade:'arquivo:'+id,modulo:'arquivos',operacoes:[],base:{},intencao:{edicoes:[],arquivos:{[id]:a}},preparar:true});
   let item=await fila.reservar(conta,{dono:'fixture'});item=await fila.fixarPayload(item,[{table:'integracao_arquivos',key:{colecao:'arquivos',registro_id:id},insert:true,changes:{dados:{chave:key,path:conta+'/'+local.hash,...local}}}],{sent:{[id]:a},antes:{},depois:{}});
   item=await fila.registrarEnvio(item);await fila.registrarFalha(item,{status:409,code:'PT409'},{fase:'envio'});
   const d=criarDiarioCompartilhado({conta,fila,ativo:()=>true,atualizou:()=>{},carregar:async()=>({db:{},base:{integracao_arquivos:[row]}}),consultarRecibo:async()=>null,lerConteudoArquivo:async()=> 'original remoto fixture'});
   const p=await d.previa('root');window.ready=!!p.arquivo;window.done=false;
   createRoot(document.getElementById('root')).render(React.createElement(Painel,{sync:{pendencias:[],previaPendencia:p,fecharPrevia:()=>{},substituirArquivoPendencia:async()=>{await d.substituirArquivo('root');window.done=true;},descartarPendencia:()=>{}}}));
   window.backup=()=>fila.exportar(conta);
  });
  await page.waitForFunction(()=>window.ready);
  await page.locator('summary').first().click();
  assert.equal(await page.getByRole('button',{name:'Confirmar retomada deste item',exact:true}).count(),0);
  assert.equal(await page.getByText('original remoto fixture',{exact:true}).count(),0);
  const btn=page.getByRole('button',{name:'Preservar as duas cópias e substituir este arquivo',exact:true});
  page.once('dialog',d=>d.dismiss());await btn.click();assert.equal(await page.evaluate(()=>window.done),false);
  page.once('dialog',d=>d.accept());await btn.click();await page.waitForFunction(()=>window.done);
  const result=await page.evaluate(()=>backup());
  assert.equal(result.intencoes.length,2);assert.equal(result.originais.length,1);
  const replacement=result.intencoes.find(i=>i.original.substitui==='root');
  assert.equal(replacement.original.intencao.recuperacaoArquivo.anterior.value,'original remoto fixture');
  assert.equal(result.intencoes.find(i=>i.id==='root').estado,'substituido');
  await page.reload();
  const persisted=await page.evaluate(async()=>{const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js');const f=abrirFilaIntencoes({nome:'revisao-arquivo-fixture'});try{return await f.exportar('fixture');}finally{f.fechar();}});
  assert.deepEqual(persisted,result);
  console.log(JSON.stringify({ok:true,indexedDBReal:true,reloadPreservaBackup:true,cancelarSemEfeito:true,semDadosReais:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
