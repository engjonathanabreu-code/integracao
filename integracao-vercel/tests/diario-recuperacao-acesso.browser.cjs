const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext();await context.route('**/tests/recuperacao-acesso.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Recuperação de acesso</title>'}));const page=await context.newPage();await page.goto('http://127.0.0.1:5178/tests/recuperacao-acesso.html');
 for(const status of [401,403,404,409]){
  const r=await page.evaluate(async status=>{
   const {abrirFilaIntencoes,processarIntencao}=await import('/src/fila-intencoes.js');
   let agora=1000000,envios=0,consultas=0,recusar=true;
   const fila=abrirFilaIntencoes({nome:'acesso-'+crypto.randomUUID(),agora:()=>agora});
   await fila.enfileirar({conta:'a',id:'pedido',unidade:'meta',modulo:'metas',operacoes:[{table:'metas',changes:{titulo:'local'}}],base:{},intencao:{}});
   const cb={conta:'a',dono:'teste',sessaoAtual:()=>true,consultarRecibo:async()=>{consultas++;if(recusar)throw Object.assign(Error('consulta recusada'),{status,code:status===403?'42501':status===401?'PGRST301':'PT409'});return {aliases:{}};},enviar:async()=>{envios++;throw new TypeError('servidor gravou, resposta perdida');},reler:async()=>{}};
   try{await processarIntencao(fila,cb);}catch{}agora+=120000;try{await processarIntencao(fila,cb);}catch{}
   const item=(await fila.listar('a'))[0];let dispensa=false,substituicao=false;
   try{await fila.aceitarRemoto('a','pedido');dispensa=true;}catch{}
   try{await fila.enfileirar({conta:'a',id:'novo',unidade:'meta',modulo:'metas',operacoes:[{}],base:{},intencao:{},substituirId:'pedido'});substituicao=true;}catch{}
   recusar=false;await fila.retomar('a','pedido');const concluida=await processarIntencao(fila,cb);const backup=await fila.exportar('a');await fila.fechar();return {rejeicao:item.erro.rejeicaoConfirmada,dispensa,substituicao,envios,consultas,estado:concluida.estado,quantidade:backup.intencoes.length};
  },status);
  assert.deepEqual(r,{rejeicao:false,dispensa:false,substituicao:false,envios:1,consultas:2,estado:'confirmado',quantidade:1});
 }
 const r=await page.evaluate(async()=>{
  const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js'),{criarDiarioCompartilhado}=await import('/src/diario-compartilhado.js');
  const fila=abrirFilaIntencoes({nome:'dispensa-'+crypto.randomUUID()}),antes={metas:[{id:'m',titulo:'base'}]},depois={metas:[{id:'m',titulo:'local'}]};let envios=0;
  const d=criarDiarioCompartilhado({conta:'a',ativo:()=>true,fila,carregar:async()=>({db:antes}),preparar:async()=>({operacoes:[{}]}),enviar:async()=>{envios++;throw Object.assign(Error('recusa'),{status:422,code:'23503'});},consultarRecibo:async()=>null,confirmar:async()=>{},atualizou:()=>{}});
  const item=await d.adicionar(antes,depois);await d.executar();await d.retomarAutomaticas();await d.executar();const bloqueada=(await fila.listar('a'))[0];await d.previa(item.id);await d.descartar(item.id);const arquivo=await d.exportar();const resultado={envios,estado:arquivo.intencoes[0].estado,original:JSON.stringify(item.original)===JSON.stringify(arquivo.intencoes[0].original),checksum:item.checksum===arquivo.intencoes[0].checksum,antes:bloqueada.estado};d.fechar();return resultado;
 });assert.deepEqual(r,{envios:1,estado:'dispensado',original:true,checksum:true,antes:'bloqueado_validacao'});

 await page.goto('http://127.0.0.1:5178/tests/recuperacao-interface.html');
 await page.getByText('Pendências de sincronização (2)',{exact:true}).click();
 await page.getByText('Sessão expirada — autenticar novamente',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Revisar esta alteração'}).nth(1).click();assert.equal(await page.getByRole('button',{name:'Descartar esta alteração sem aplicar'}).count(),0);
 await page.getByRole('button',{name:'Fechar prévia'}).click();await page.getByRole('button',{name:'Revisar esta alteração'}).first().click();
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Descartar esta alteração sem aplicar'}).click();assert.equal(await page.evaluate(()=>window.descartes||0),0);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Descartar esta alteração sem aplicar'}).click();await page.waitForFunction(()=>window.descartes===1);
 await page.screenshot({path:'recuperacao-interface.png',fullPage:true});
 console.log(JSON.stringify({ok:true,cenarios:6,indexedDBReal:true,interfaceReal:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
