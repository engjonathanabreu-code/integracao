const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({headless:true});
 try{
  const c=await b.newContext();
  await c.route('**/tests/reconciliacao-core.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Reconciliação</title><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>'}));
  const p=await c.newPage();await p.goto('http://127.0.0.1:5178/tests/reconciliacao-core.html');
  const r=await p.evaluate(async()=>{
   await import('/@vite/client');
   const {React,createRoot,Pendencias}=await import('/tests/diario-reconciliacao-fixture.jsx');
   const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js');
   const {criarDiarioCompartilhado}=await import('/src/diario-compartilhado.js');
   const fila=abrirFilaIntencoes({nome:'reconciliacao-browser'});
   const conta=crypto.randomUUID(),id='erp_'+conta,doc=crypto.randomUUID();
   const a={id,erpRef:conta,tema:'claro'},b={...a,tema:'escuro'};
   const op={table:'integracao_usuarios',key:{colecao:'usuarios',registro_id:id},expected:{dados:{tema:'claro'}},changes:{dados:{tema:'escuro'}}};
   const fin={table:'fin_receb_clientes',key:{id:doc},changes:{numero_parcelas:0}};
   async function erro(modulo,edicoes,operacao,e){
    const i=await fila.enfileirar({conta,unidade:modulo,modulo,preparar:true,operacoes:[],base:{},intencao:{edicoes,arquivos:{}}});
    let r=await fila.reservar(conta,{dono:'fixture',somenteId:i.id});
    r=await fila.fixarPayload(r,[operacao],{antes:{},depois:{},sent:{}});
    r=await fila.registrarEnvio(r);await fila.registrarFalha(r,e,{fase:'envio'});
    return i.id;
   }
   const pref=await erro('usuarios',[{colecao:'usuarios',id,antes:{existe:true,valor:a},depois:{existe:true,valor:b}}],op,{code:'PT409',status:409});
   const processo=await erro('processos',[],fin,{code:'23514',status:400,constraint:'fin_receb_clientes_numero_parcelas_check',details:'CPF-PRIVADO'});
   let escritos=0,leituras=0;const raiz=createRoot(document.querySelector('#root'));
   const d=criarDiarioCompartilhado({conta,fila,ativo:()=>true,atualizou:itens=>raiz.render(React.createElement(Pendencias,{sync:{pendencias:itens.filter(i=>!['confirmado','dispensado','substituido'].includes(i.estado))}})),preparar:async()=>{escritos++;throw Error('preparação inesperada');},enviar:async()=>{escritos++;throw Error('envio inesperado');},
    carregar:async()=>{leituras++;return {db:{usuarios:[b]},base:{integracao_usuarios:[{...op.key,referencia_id:conta,referencia_tabela:'profiles',dados:op.changes.dados}]}};}});
   await d.atualizar();await d.executar();
   const itens=await fila.listar(conta);
   const estadoPref=itens.find(i=>i.id===pref).estado,estadoProcesso=itens.find(i=>i.id===processo).estado;
   d.fechar();await fila.fechar();
   return {estadoPref,estadoProcesso,escritos,leituras,doc:doc.slice(0,8)};
  });
  assert.equal(r.estadoPref,'dispensado');assert.equal(r.estadoProcesso,'bloqueado_validacao');
  assert.equal(r.escritos,0);assert.equal(r.leituras,1);
  await p.getByText('Pendências de sincronização (1)',{exact:true}).click();
  await p.getByText('O número de parcelas deve ser positivo',{exact:false}).waitFor({state:'visible'});
  await p.getByText('Referência no pedido: '+r.doc,{exact:false}).waitFor({state:'visible'});
  assert.equal(await p.getByText('CPF-PRIVADO',{exact:false}).count(),0);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
