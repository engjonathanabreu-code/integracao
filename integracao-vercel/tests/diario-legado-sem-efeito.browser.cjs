const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true});try{const p=await b.newPage();await p.route('**/tests/legado-vazio.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Legado isolado</title>'}));await p.goto('http://127.0.0.1:5178/tests/legado-vazio.html');
 for(const caso of ['presenca','edicao_posterior','edicao_sem_operacao','arquivo_sem_operacao','recibo_vazio','id_reutilizado']){
  const r=await p.evaluate(async caso=>{
   const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js'),{criarDiarioCompartilhado}=await import('/src/diario-compartilhado.js');const fila=abrirFilaIntencoes({nome:'legado-vazio-'+crypto.randomUUID()});
   const before={usuarios:[{id:'u',nome:'Pessoa fictícia',ultimaAtividade:'antes'}],metas:[{id:'m',titulo:'base'}]},after=structuredClone(before);after.usuarios[0].ultimaAtividade='depois';
   if(caso==='edicao_sem_operacao')after.metas[0].titulo='valor local';const db=structuredClone(after);if(caso==='edicao_posterior')db.metas[0].titulo='edição posterior';
   const attempt={id:'vazio',before,after,operations:[],sent:caso==='arquivo_sem_operacao'?{f:{value:'arquivo'}}:{}};if(caso==='recibo_vazio')attempt.confirmacao={aliases:{}};
   const texto=JSON.stringify({pending:true,baseline:before,db,attempt});let writes=0;
   const d=criarDiarioCompartilhado({conta:'a',fila,ativo:()=>true,atualizou:()=>{},carregar:async()=>({db:structuredClone(before)}),preparar:async()=>({operacoes:[{table:'metas',changes:{titulo:'edição posterior'}}]}),enviar:async()=>{writes++;return {aliases:{}};},confirmar:async()=>{},consultarRecibo:async()=>null});
   try{if(caso==='id_reutilizado')await fila.enfileirar({conta:'a',id:'vazio',unidade:'meta',modulo:'metas',operacoes:[{}],base:{},intencao:{edicoes:[]}});
    await d.migrar(texto);await d.migrar(texto);const backup=await d.exportar();return {avisos:d.itens().filter(i=>i.estado==='legado_revisao').length,volateis:backup.naoPersistidas.length,itens:backup.intencoes.map(i=>({id:i.id,estado:i.estado,deps:i.dependencias})),originais:backup.originais.length,estado:backup.originais[0].estado,original:backup.originais[0].texto===texto,writes};
   }finally{d.fechar();}
  },caso);
  assert.equal(r.original,true);assert.equal(r.originais,1);assert.equal(r.writes,0);assert.equal(r.volateis,0);
  if(caso==='presenca'){assert.equal(r.avisos,0);assert.equal(r.estado,'sem_operacoes_de_negocio');assert.equal(r.itens.length,0);}
  else if(caso==='edicao_posterior'){assert.equal(r.avisos,0);assert.equal(r.itens.length,1);assert.equal(r.itens[0].estado,'pendente_local');assert.deepEqual(r.itens[0].deps,[]);}
  else{assert.ok(r.avisos>0);assert.equal(r.estado,'aguardando_classificacao');}
 }
 console.log('Legado vazio: seis cenários com IndexedDB real, originais mantidos, sem descarte de dados ou reenvio.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
