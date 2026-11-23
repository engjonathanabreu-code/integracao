const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext();await context.route('**/tests/qa-calendario.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Calendário sintético</title>'}));
 const page=await context.newPage();await page.goto('http://127.0.0.1:5178/tests/qa-calendario.html');
 for(const cenario of ['criacao','resposta','status','agenda','vinculo-extra','divergencia','leitura-negada']){
  const r=await page.evaluate(async cenario=>{
   const {fixture,blank,id}=await import('/tests/fixture.js');
   const {definirSessao,lerBase,projetar,prepararEdicao}=await import('/src/dados-compartilhados.js');
   const {gruposDeLeituraDaIntencao}=await import('/src/leitura-intencoes.js');
   const {tabelasDosGrupos}=await import('/src/sincronizacao-regras.js');
   const {alteracoesConfirmadas}=await import('/src/confirmacao-mutacoes.js');
   const {criarDiarioCompartilhado}=await import('/src/diario-compartilhado.js');
   const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js');
   const {remapearIdentidades}=await import('/src/aliases-tipados.js');
   const {contratoDoUsuario}=await import('/src/permissoes-contrato.js');
   let servidor=fixture();servidor.erp_agendas=[{id:id(40),nome:'Sala sintética',cor:'#123456'},{id:id(43),nome:'Outra sala',cor:'#234567'}];
   servidor.erp_eventos=[{id:id(41),titulo:'Evento sintético',descricao:'',inicio:'2026-11-24T12:00:00Z',fim:'2026-11-24T13:00:00Z',agenda_id:id(40),entidade_tipo:'processo',entidade_id:id(5),participantes:[id(1)],publico:true,cor:'#123456',status:'ativo',created_by:id(1),serie_id:id(44)}];
   servidor.erp_evento_respostas=[{evento_id:id(41),usuario_id:id(1),resposta:'pendente'}];
   servidor.integracao_calendario=[{colecao:'eventos',registro_id:id(41),referencia_tabela:'erp_eventos',referencia_id:id(41),criado_por:id(1),dados:{observacaoPrivada:'extra inicial'}}];
   let cache=structuredClone(servidor);const inicial=projetar(cache,blank()),actor=inicial.db.usuarios[0],antes=inicial.db,depois=structuredClone(antes);
   if(cenario==='criacao')depois.eventos.push({id:'novo-evento',titulo:'Novo evento sintético',descricao:'',inicio:'2026-11-24T09:00:00-03:00',fim:'2026-11-24T10:00:00-03:00',agendaId:id(40),entidade:structuredClone(antes.eventos[0].entidade),participantes:[actor.id],publico:true,cor:'#0F5F5B',status:'ativo',recorrencia:'nenhuma',recorrenciaAte:'',respostas:{}});
   if(cenario==='resposta')depois.eventos[0].respostas[actor.id]='aceito';
   if(cenario==='status')depois.eventos[0].status='cancelado';
   if(cenario==='agenda'){depois.agendas[0].nome='Sala renomeada';depois.eventos[0].agendaId=id(43);}
   if(cenario==='vinculo-extra')depois.eventos[0].observacaoPrivada='extra alterado';
   if(['divergencia','leitura-negada'].includes(cenario))depois.eventos[0].titulo='Título enviado';
   // A tabela alheia muda no servidor, mas não pode contaminar a confirmação deste módulo.
   servidor.metas[0].titulo='mudança remota fora do Calendário';
   const requests=[],envios=[],receipts={};let leituras=0,consultas=0;
   definirSessao({user:{id:id(1)},access_token:'fixture-isolada',expires_in:3600});
   const fetchAnterior=window.fetch;
   window.fetch=async(input,options={})=>{
    const u=new URL(typeof input==='string'?input:input.url,location.href);requests.push(u.pathname);let result;
    if(cenario==='leitura-negada'&&envios.length&&u.pathname.endsWith('/rpc/integracao_eventos'))return new Response(JSON.stringify({code:'42501',message:'Recusa sintética'}),{status:403,headers:{'Content-Type':'application/json'}});
    if(u.pathname.endsWith('/rpc/integracao_atribuicoes_contrato_ler'))result={regras:{calendario:{editar:true}},revisao_compativel:true};
    else if(u.pathname.endsWith('/rpc/erp_collab_directory'))result=servidor.profiles;
    else if(u.pathname.endsWith('/rpc/integracao_eventos'))result=servidor.erp_eventos;
    else result=servidor[u.pathname.split('/').at(-1)]||[];
    return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
   };
   const fila=abrirFilaIntencoes({nome:'qa-calendario-'+cenario+'-'+crypto.randomUUID()});let ultimoRemoto;
   const d=criarDiarioCompartilhado({conta:id(1),ativo:()=>true,fila,atualizou:()=>{},
    carregar:async edicoes=>{cache=await lerBase({tabelas:tabelasDosGrupos(gruposDeLeituraDaIntencao(edicoes)),anterior:cache});ultimoRemoto=projetar(cache,blank());leituras++;return ultimoRemoto;},
    preparar:async(state,after)=>({operacoes:prepararEdicao(state.db,after,state,actor),sent:{}}),
    enviar:async(ops,pedido)=>{
     envios.push(structuredClone(ops));const aliases={};
     for(const original of ops){const op=remapearIdentidades(original,aliases);
      if(op.action==='evento'){aliases[op.tempId]=id(90);servidor.erp_eventos.push({...op.payload,id:id(90),created_by:id(1),status:'ativo',cor:'#345678',serie_id:id(91)});continue;}
      if(op.action==='resposta'){const row=servidor.erp_evento_respostas.find(r=>r.evento_id===op.payload.id&&r.usuario_id===id(1));row.resposta=op.payload.resposta;continue;}
      if(op.action==='evento_status'){servidor.erp_eventos.find(r=>r.id===op.payload.id).status=op.payload.status;continue;}
      const rows=servidor[op.table]||=[];const matches=r=>Object.entries(op.key).every(([k,v])=>r[k]===v),row=rows.find(matches);
      if(op.insert)rows.push({...op.key,...op.changes});else if(op.remove)servidor[op.table]=rows.filter(r=>!matches(r));else Object.assign(row,op.changes);
     }
     if(cenario==='divergencia')servidor.erp_eventos[0].titulo='Valor concorrente';
     return receipts[pedido]={aliases};
    },consultarRecibo:async i=>{consultas++;return receipts[i.pedido]||null;},
    confirmar:async(item,state)=>{if(!alteracoesConfirmadas(item.preparado.antes,item.preparado.depois,state.db,item.recibo.aliases,item.payload))throw Object.assign(Error('leitura divergente'),{code:'LEITURA_DIVERGENTE'});}
   });
   try{
    await d.adicionar(antes,depois);await d.executar();const rows=await fila.listar(id(1)),i=rows[0],evento=ultimoRemoto.db.eventos.find(e=>e.id===(cenario==='criacao'?id(90):id(41)));
    return {cenario,estado:i.estado,envios:envios.length,consultas,leituras,pedidos:rows.length,erro:i.erro?.codigo||null,alias:i.recibo?.aliases['novo-evento']||null,evento:{id:evento.id,agendaId:evento.agendaId,entidade:evento.entidade,status:evento.status,resposta:evento.respostas[actor.id],observacaoPrivada:evento.observacaoPrivada},agenda:ultimoRemoto.db.agendas[0].nome,meta:ultimoRemoto.db.metas[0].titulo,contratoAtual:contratoDoUsuario(actor)?.regras?.calendario?.editar===true,requests};
   }finally{d.fechar();window.fetch=fetchAnterior;definirSessao(null);}
  },cenario);
  assert.equal(r.estado,['divergencia','leitura-negada'].includes(cenario)?'confirmado_aguardando_leitura':'confirmado',JSON.stringify(r));assert.equal(r.envios,1);assert.equal(r.consultas,0);assert.equal(r.leituras,cenario==='leitura-negada'?1:2);assert.equal(r.pedidos,1);if(cenario==='divergencia')assert.equal(r.erro,'LEITURA_DIVERGENTE');else if(cenario!=='leitura-negada')assert.equal(r.erro,null);assert.equal(r.contratoAtual,true);assert.equal(r.meta,'Meta Teste');
  for(const table of ['erp_agendas','erp_evento_respostas','integracao_calendario','profiles','integracao_usuarios','integracao_arquivos','integracao_auditoria'])assert.ok(r.requests.some(p=>p.endsWith('/'+table)),table);
  assert.ok(r.requests.some(p=>p.endsWith('/rpc/integracao_eventos')));assert.ok(r.requests.some(p=>p.endsWith('/rpc/integracao_atribuicoes_contrato_ler')));assert.ok(!r.requests.some(p=>p.endsWith('/metas')||p.endsWith('/erp_mensagens')));
  if(cenario==='criacao'){assert.equal(r.alias,'00000000-0000-4000-8000-000000000090');assert.equal(r.evento.agendaId,'00000000-0000-4000-8000-000000000040');assert.equal(r.evento.entidade.tipo,'nucleo');}
  if(cenario==='resposta')assert.equal(r.evento.resposta,'aceito');
  if(cenario==='status')assert.equal(r.evento.status,'cancelado');
  if(cenario==='agenda'){assert.equal(r.agenda,'Sala renomeada');assert.equal(r.evento.agendaId,'00000000-0000-4000-8000-000000000043');}
  if(cenario==='vinculo-extra')assert.equal(r.evento.observacaoPrivada,'extra alterado');
 }
 console.log(JSON.stringify({ok:true,casos:7,divergenciaPreservada:true,leituraNegadaPreservada:true,criacaoAlias:true,respostas:true,status:true,agendaEVinculo:true,contratoAtual:true,leituraAutorizada:true,escopoIsolado:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
