const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});let casos=0;
 try{
  const abrir=async()=>{const c=await browser.newContext(),p=await c.newPage();await p.goto('http://127.0.0.1:5178/tests/metas-leitura.html');await p.waitForFunction(()=>window.metasLeitura?.ready);return {c,p};};
  {
   const {c,p}=await abrir();
   await p.evaluate(async()=>{
    const h=metasLeitura;h.flags.chat503=true;h.stats.requests.length=0;
    await h.storage.set('integracao-meta-arq-v1-fixture','data:text/plain;base64,b3JpZ2luYWw=');
    h.sync.mutate(d=>{const m=d.metas[0];m.titulo='Meta atualizada';m.arquivos.push({id:h.id(31),chave:'integracao-meta-arq-v1-fixture',nome:'arquivo.txt',tipo:'text/plain',tamanho:8,por:h.actor.nome,data:'2026-11-12T18:00:00.000Z'});m.historico.unshift({id:h.id(32),acao:'Editada',descricao:'Alteração fictícia',autor:h.actor.nome,autorId:h.actor.id,data:'2026-11-12T18:00:00.000Z'});return d;},{id:h.id(33),acao:'Meta alterada',usuarioId:h.actor.id,usuario:h.actor.nome,data:'2026-11-12T18:00:00.000Z'});
    await h.sync.flush();
   });
   await p.waitForFunction(()=>!metasLeitura.sync.pendencias.length&&metasLeitura.stats.posts===1);
   const r=await p.evaluate(()=>({titulo:metasLeitura.base.metas[0].titulo,requests:metasLeitura.stats.requests,operations:metasLeitura.stats.operations,uploads:metasLeitura.stats.uploads,arquivo:metasLeitura.db.metas[0].arquivos[0]}));
   assert.equal(r.titulo,'Meta atualizada');assert.equal(r.requests.some(x=>x.t==='erp_mensagens'),false);
   for(const t of ['profiles','integracao_atribuicoes_contrato_ler','meta_checklist','meta_arquivos','integracao_metas','integracao_auditoria','integracao_arquivos'])assert.ok(r.requests.some(x=>x.t===t),t);
   assert.ok(r.requests.filter(x=>x.t==='integracao_atribuicoes_contrato_ler').length>=2,'permissão fresca na preparação e na releitura');
   assert.equal(r.uploads,1);assert.ok(r.operations[0].some(x=>x.table==='meta_arquivos'));assert.ok(r.operations[0].some(x=>x.table==='meta_historico'));assert.ok(r.operations[0].some(x=>x.table==='integracao_auditoria'));
   assert.match(r.arquivo.chave,/^erp-storage\|documentos\|/);casos++;await c.close();
  }
  for(const flag of ['checklist503','perfis403','contrato403','trocarSessao']){
   const {c,p}=await abrir();
   await p.evaluate(async flag=>{const h=metasLeitura;h.flags[flag]=true;h.sync.mutate(d=>{d.metas[0].titulo='Original preservado';return d;});await h.sync.flush();},flag);
   await p.waitForFunction(()=>metasLeitura.sync.error.length>0);
   const r=await p.evaluate(async()=>{const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js');const f=abrirFilaIntencoes();try{return {posts:metasLeitura.stats.posts,titulo:metasLeitura.base.metas[0].titulo,itens:await f.listar(metasLeitura.id(1)),outra:await f.listar(metasLeitura.id(2))};}finally{await f.fechar();}});
   assert.equal(r.posts,0,flag);assert.equal(r.titulo,'Meta Teste');assert.ok(r.itens.some(i=>i.original.intencao.edicoes.some(e=>e.colecao==='metas'&&e.depois.valor.titulo==='Original preservado')));assert.ok(r.itens.every(i=>i.estado!=='confirmado'));assert.equal(r.outra.length,0);casos++;await c.close();
  }
  {
   const {c,p}=await abrir();
   await p.evaluate(async()=>{const h=metasLeitura;h.flags.falharLeituraAposRecibo=true;h.sync.mutate(d=>{d.metas[0].titulo='Gravada com leitura pendente';return d;});await h.sync.flush();});
   await p.waitForFunction(()=>metasLeitura.sync.pendencias.some(i=>i.recibo&&i.estado==='confirmado_aguardando_leitura'));
   assert.equal(await p.evaluate(()=>metasLeitura.stats.posts),1);
   await p.evaluate(async()=>{const h=metasLeitura;h.flags.falharLeituraAposRecibo=false;h.flags.checklist503=false;await h.sync.flush();});
   await p.waitForFunction(()=>!metasLeitura.sync.pendencias.length);
   assert.equal(await p.evaluate(()=>metasLeitura.stats.posts),1,'recibo existente exige só nova leitura');casos++;await c.close();
  }
  {
   const {c,p}=await abrir();
   await p.evaluate(async()=>{const h=metasLeitura;h.flags.chat503=true;h.stats.requests.length=0;h.sync.mutate(d=>{d.metas[0].titulo='Mista preservada';d.nucleos[0].prioridade='Alta';return d;});await h.sync.flush();});
   await p.waitForFunction(()=>metasLeitura.sync.error.length>0);
   assert.equal(await p.evaluate(()=>metasLeitura.stats.posts),0);
   assert.ok(await p.evaluate(()=>metasLeitura.stats.requests.some(x=>x.t==='erp_mensagens')),'intenção mista mantém leitura completa');casos++;await c.close();
  }
  console.log(JSON.stringify({ok:true,casos,hookReal:true,indexedDBReal:true,chatIsoladoSomenteMetas:true,autorizacaoAtual:true,arquivosPreservados:true,reciboSemReenvio:true,mistasCompletas:true,semDadosReais:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
