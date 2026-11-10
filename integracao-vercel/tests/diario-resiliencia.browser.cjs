const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});const results=[];try{
 const context=await browser.newContext();await context.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());await context.route('**/tests/resiliencia.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Resiliência isolada</title>'}));
 const page=await context.newPage();await page.goto('http://127.0.0.1:5178/tests/resiliencia.html');
 for(const caso of ['migracao','previa','exportacao','substituicao','arquivo','arquivo_sequencia','arquivo_intercalado','previa_alterada','substituicao_simultanea','substituicao_abortada']){
 try{const result=await page.evaluate(async caso=>{
  const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js'),{criarDiarioCompartilhado}=await import('/src/diario-compartilhado.js'),{referenciasIdentidades}=await import('/src/aliases-tipados.js');
  const fila=abrirFilaIntencoes({nome:'resiliencia-'+caso+'-'+crypto.randomUUID()}),before={metas:[{id:'m',titulo:'base'},{id:'outra',titulo:'base'}],usuarios:[{id:'u',online:false}],auditoria:[]},after=structuredClone(before);after.metas[0].titulo='local';
  let remote=structuredClone(before);const diario=criarDiarioCompartilhado({conta:'a',ativo:()=>true,fila,carregar:async()=>({db:structuredClone(remote)}),preparar:async()=>({operacoes:[],sent:{}}),enviar:async()=>({aliases:{}}),consultarRecibo:async()=>null,confirmar:async()=>{},atualizou:()=>{}});
  try{
   if(caso==='arquivo'){
    const item=await diario.adicionar(before,before,{arquivo:{expected:null,value:'modelo'}}),claim=await fila.reservar('a',{dono:'fixture'});await fila.registrarFalha(claim,{status:403});await diario.previa(item.id);await diario.resolver(item.id,{});
    const rows=await fila.listar('a');return {quantidade:rows.length,estado:rows.find(i=>i.id===item.id).estado,arquivo:rows.find(i=>i.id!==item.id).original.intencao.arquivos.arquivo.value};
   }
   if(caso==='arquivo_sequencia'||caso==='arquivo_intercalado'){
    let metadata=null;const enviados=[];
    const d=criarDiarioCompartilhado({conta:'f',ativo:()=>true,fila,carregar:async()=>({db:{}}),preparar:async(r,db,files)=>({operacoes:[{table:'integracao_arquivos',key:{registro_id:'arquivo'},expected:{dados:files.arquivo.expected},changes:{dados:{hash:files.arquivo.value}}}],sent:files}),enviar:async ops=>{if(JSON.stringify(ops[0].expected.dados)!==JSON.stringify(metadata))throw Object.assign(Error('base divergente'),{status:409});metadata=ops[0].changes.dados;enviados.push(metadata.hash);return {aliases:{}};},consultarRecibo:async()=>null,confirmar:async()=>{if(caso==='arquivo_intercalado'&&enviados.length===1)await d.adicionar({},{},{arquivo:{expected:{hash:'primeiro'},value:'terceiro'}});},atualizou:()=>{}});
    try{for(const value of (caso==='arquivo_intercalado'?['primeiro','segundo']:['primeiro','segundo','terceiro']))await d.adicionar({},{},{arquivo:{expected:null,value}});await d.executar();await d.executar();return {enviados,estados:(await fila.listar('f')).map(i=>i.estado)};}finally{d.fechar();}
   }
   if(caso==='previa_alterada'){
    const item=await diario.adicionar(before,after),claim=await fila.reservar('a',{dono:'fixture'});await fila.registrarFalha(claim,{status:409});await diario.previa(item.id);remote.metas[0].titulo='outro usuário';let erro=false;try{await diario.resolver(item.id,{});}catch{erro=true;}return {erro,quantidade:(await fila.listar('a')).length};
   }
   if(caso==='substituicao_simultanea'||caso==='substituicao_abortada'){
    const item=await diario.adicionar(before,after),claim=await fila.reservar('a',{dono:'fixture'});await fila.registrarFalha(claim,{status:409});
    const payload={conta:'a',unidade:'m',modulo:'metas',operacoes:[],preparar:true,intencao:item.original.intencao,base:{},substituirId:item.id};
    if(caso==='substituicao_simultanea'){
     const results=await Promise.allSettled([fila.enfileirar({...payload,id:'r1'}),fila.enfileirar({...payload,id:'r2'})]);return {sucessos:results.filter(r=>r.status==='fulfilled').length,quantidade:(await fila.listar('a')).length};
    }
    const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(value){if(this.name==='intencoes'&&value.id==='falha'){this.transaction.abort();throw new DOMException('fixture','QuotaExceededError');}return add.call(this,value);};
    let erro=false;try{await fila.enfileirar({...payload,id:'falha'});}catch{erro=true;}finally{IDBObjectStore.prototype.add=add;}
    const rows=await fila.listar('a');return {erro,quantidade:rows.length,estado:rows[0].estado};
   }
   if(caso==='migracao'){
    after.usuarios[0].online=true;const legado={id:'antigo',before,after,operations:[{table:'metas',key:{id:'m'},changes:{titulo:'local'}}],sent:{},rejeitada:true};
    const edicoes=['metas','usuarios'].map(colecao=>({colecao,id:colecao==='metas'?'m':'u',antes:{existe:true,valor:before[colecao][0]},depois:{existe:true,valor:after[colecao][0]}}));
    const recursos=edicoes.map(e=>JSON.stringify([e.colecao,e.id]));
    const original=await fila.enfileirar({conta:'a',id:'antigo',unidade:recursos[0],recursos,modulo:'metas',dependencias:[],referencias:referenciasIdentidades(edicoes),criadas:[],operacoes:legado.operations,preparar:false,base:{},intencao:{edicoes,arquivos:{}},legado});
    await diario.migrar(JSON.stringify({pending:true,baseline:before,db:after,attempt:legado}));
    return {avisos:diario.itens().filter(i=>i.estado==='legado_revisao').length,checksum:(await fila.listar('a'))[0].checksum===original.checksum,quantidade:(await fila.listar('a')).length};
   }
   if(caso==='previa'){
    const item=await diario.adicionar(before,after);const claim=await fila.reservar('a',{dono:'fixture'});await fila.registrarFalha(claim,{status:409,code:'PT409'});await diario.previa(item.id);
    remote.metas[1].titulo='alteração independente';await diario.resolver(item.id,{});
    return {substituido:(await fila.listar('a')).find(i=>i.id===item.id).estado==='substituido',outro:remote.metas[1].titulo};
   }
   if(caso==='exportacao'){
    const baseExport=fila.exportar.bind(fila);let concluir;const barreira=new Promise(r=>concluir=r);fila.exportar=async conta=>{const snapshot=await baseExport(conta);concluir();await trabalho;return snapshot;};
    let liberar;const enfileirar=fila.enfileirar.bind(fila);fila.enfileirar=async payload=>{await new Promise(r=>liberar=r);return enfileirar(payload);};
    const trabalho=diario.adicionar(before,after);await new Promise(r=>setTimeout(r));const backup=diario.exportar();await barreira;liberar();const result=await backup;
    return {preservadas:result.intencoes.length+result.naoPersistidas.length};
   }
   if(caso==='substituicao'){
    const item=await diario.adicionar(before,after),claim=await fila.reservar('a',{dono:'fixture'});await fila.registrarFalha(claim,{status:409,code:'PT409'});await diario.previa(item.id);
    // Another tab resolves the original after the preview. A stale decision must
    // not append an orphan replacement or create a second live interpretation.
    await fila.aceitarRemoto('a',item.id);let erro=false;try{await diario.resolver(item.id,{});}catch{erro=true;}
    return {erro,quantidade:(await fila.listar('a')).length};
   }
  }finally{diario.fechar();}
 },caso);
 const expected={arquivo_intercalado:{enviados:['primeiro','segundo','terceiro'],estados:['confirmado','confirmado','confirmado']},arquivo:{quantidade:2,estado:'substituido',arquivo:'modelo'},arquivo_sequencia:{enviados:['primeiro','segundo','terceiro'],estados:['confirmado','confirmado','confirmado']},previa_alterada:{erro:true,quantidade:1},substituicao_simultanea:{sucessos:1,quantidade:2},substituicao_abortada:{erro:true,quantidade:1,estado:'bloqueado_conflito'},migracao:{avisos:0,checksum:true,quantidade:1},previa:{substituido:true,outro:'alteração independente'},exportacao:{preservadas:1},substituicao:{erro:true,quantidade:1}}[caso];assert.deepEqual(result,expected);results.push({caso,ok:true});
 }catch(e){results.push({caso,ok:false,erro:e.message});}
 }
 console.log(JSON.stringify(results,null,2));assert.ok(results.every(r=>r.ok));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
