const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5178/tests/recuperacao-interface.html');
 const result=await page.evaluate(async()=>{
  const {fixture,blank}=await import('/tests/fixture.js');
  const {projetar,prepararEdicao}=await import('/src/dados-compartilhados.js');
  const {alteracoesConfirmadas}=await import('/src/confirmacao-mutacoes.js');
  const {criarDiarioCompartilhado}=await import('/src/diario-compartilhado.js');
  const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js');
  const base=fixture();base.fin_receb_clientes[0].valor_entrada=400;
  const initial=projetar(base,blank()),a=structuredClone(initial.db),b=structuredClone(initial.db);a.processos[0].comercial.entrada='500,00';b.processos[0].comercial.entrada='600,00';
  const fila=abrirFilaIntencoes({nome:'financeiro-'+crypto.randomUUID()}),envios=[];
  const d=criarDiarioCompartilhado({conta:'fixture',ativo:()=>true,fila,atualizou:()=>{},carregar:async()=>projetar(base,initial.db),
   preparar:async(state,depois)=>({operacoes:prepararEdicao(state.db,depois,state,state.db.usuarios[0])}),
   enviar:async ops=>{envios.push(structuredClone(ops));for(const op of ops){if(op.table!=='fin_receb_clientes')throw Error('unexpected table');Object.assign(base.fin_receb_clientes.find(r=>r.id===op.key.id),op.changes);}return {aliases:{}};},
   consultarRecibo:async()=>null,
   confirmar:async(item,state)=>{if(!alteracoesConfirmadas(item.preparado.antes,item.preparado.depois,state.db,{},item.payload))throw Object.assign(Error('divergente'),{code:'LEITURA_DIVERGENTE'});}
  });
  await d.adicionar(initial.db,a,{}, {id:'ffffffff-ffff-4fff-8fff-ffffffffffff'});await d.adicionar(a,b,{}, {id:'00000000-0000-4000-8000-000000000000'});const original=new Map((await fila.exportar('fixture')).intencoes.map(i=>[i.id,JSON.stringify(i.original)]));
  await d.executar();const items=await fila.listar('fixture');const view=d.materializar(projetar(base,initial.db).db);
  const r={estados:items.map(i=>i.estado),valor:base.fin_receb_clientes[0].valor_entrada,tela:view.processos[0].comercial.entrada,envios:envios.length,expected:envios.map(x=>x[0].expected.valor_entrada),originaisPreservados:items.every(i=>JSON.stringify(i.original)===original.get(i.id))};d.fechar();return r;
 });
 assert.deepEqual(result,{estados:['confirmado','confirmado'],valor:600,tela:'600',envios:2,expected:[400,500],originaisPreservados:true});console.log(JSON.stringify(result));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
