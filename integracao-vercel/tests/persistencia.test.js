import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,blank,id} from './fixture.js';
import {copy,eq,projetar,prepararEdicao,definirSessao} from '../src/dados-compartilhados.js';
import {tabelasProprias} from '../src/persistencia-modulos.js';
import {abrirArquivos,fecharArquivos,agendarArquivo,obterArquivo,prepararArmazenamento,confirmarArquivos,arquivosPendentes} from '../src/arquivos-compartilhados.js';

function apply(base,ops) {
  const b=copy(base);for(const op of ops) {
    assert(!op.action,'test fixture requires concrete records');
    const rows=b[op.table]||= [],index=rows.findIndex(r=>Object.entries(op.key).every(([k,v])=>eq(r[k],v)));
    if(op.insert){assert.equal(index,-1);rows.push({...op.key,...op.changes});}
    else {assert(index>=0);for(const [k,v] of Object.entries(op.expected||{}))assert.deepEqual(rows[index][k],v);if(op.remove)rows.splice(index,1);else Object.assign(rows[index],op.changes);}
  }return b;
}
test('all module fields survive a completely empty device, and ERP changes remain authoritative',()=>{
  const state=projetar(fixture(),blank()),next=copy(state.db),actor=next.usuarios[0];
  for(const c of ['municipios','remessas','nucleos','processos','metas','planos','usuarios'])next[c][0].campoExclusivo={texto:'Valor '+c,lista:[{id:'x',valor:42}]};
  Object.assign(next.processos[0].requerente,{telefone:'123',rg:'456'});
  next.processos[0].comercial.observacoes='Contrato';
  next.planos[0].etapas[0].cor='#123456';next.planos[0].etapas[0].entregaveis[0].detalhes='Anexo';
  next.prf={nome:'Modelo'};next.timbrado={cabecalho:{chave:'integracao-timbrado-v1-cabecalho'}};next.modelosDoc={documento:'<p>Texto</p>'};
  next.regrasIA=[{id:'regra-1',nome:'Regra',texto:'Condição'}];next.notificacoes=[{id:id(50),usuarios:[actor.id],lidaPor:[],titulo:'Aviso'}];next.auditoria=[{id:id(51),usuarioId:actor.id,acao:'Dados editados'}];
  const ops=prepararEdicao(state.db,next,state,actor);assert(ops.every(o=>tabelasProprias.includes(o.table)));
  const base=apply(state.base,ops),cold=projetar(base,blank()).db;
  for(const c of ['municipios','remessas','nucleos','processos','metas','planos','usuarios'])assert.deepEqual(cold[c][0].campoExclusivo,next[c][0].campoExclusivo,c);
  assert.equal(cold.processos[0].requerente.telefone,'123');assert.equal(cold.processos[0].comercial.observacoes,'Contrato');
  assert.equal(cold.planos[0].etapas[0].cor,'#123456');assert.equal(cold.planos[0].etapas[0].entregaveis[0].detalhes,'Anexo');
  for(const key of ['prf','timbrado','modelosDoc'])assert.deepEqual(cold[key],next[key]);
  assert.equal(cold.auditoria[0].acao,'Dados editados');assert.equal(cold.notificacoes[0].titulo,'Aviso');
  base.fin_receb_clientes[0].nome='Novo nome no ERP';assert.equal(projetar(base,cold).db.processos[0].requerente.nome,'Novo nome no ERP');
});
test('local legacy record saves its complete own data on explicit edit without creating ERP rows',()=>{
 const legacy=blank();legacy.processos=[{id:'legacy',requerente:{nome:'Antigo',rg:'123'},extras:{a:1},etapa:1}];
 const s=projetar(fixture(),legacy),n=copy(s.db);n.processos.find(x=>x.id==='legacy').etapa=2;
 const ops=prepararEdicao(s.db,n,s,s.db.usuarios[0]);assert.equal(ops.length,1);assert.equal(ops[0].table,'integracao_moradores');
 const cold=projetar(apply(s.base,ops),blank());assert.equal(cold.db.processos.find(x=>x.id==='legacy').requerente.rg,'123');
});
test('removed custom values stay removed on refresh and on another device',()=>{
 const b=fixture();b.integracao_nucleos=[{colecao:'nucleos',registro_id:id(5),dados:{custom:'Antigo'},referencia_tabela:'processos_kanban',referencia_id:id(5)}];
 const s=projetar(b,blank()),n=copy(s.db);delete n.nucleos[0].custom;
 const updated=apply(s.base,prepararEdicao(s.db,n,s,s.db.usuarios[0]));assert.equal(projetar(updated,s.db).db.nucleos[0].custom,null);assert.equal(projetar(updated,blank()).db.nucleos[0].custom,null);
});
test('new financial customer writes agreed payment conditions',()=>{
 const s=projetar(fixture(),blank()),n=copy(s.db);n.processos.push({...copy(n.processos[0]),id:id(80),comercial:{valorTotal:'2.400,50',entrada:'400,00',parcelas:'4',valorParcela:'500,00',diaVencimento:'10',primeiroVencimento:'2026-10-10'}});
 const op=prepararEdicao(s.db,n,s,n.usuarios[0]).find(o=>o.table==='fin_receb_clientes');assert.equal(op.changes.valor_global,2400.5);assert.equal(op.changes.numero_parcelas,4);
});
test('chat styles persist separately from the shared message text',()=>{
 const b=fixture();b.erp_conversas=[{id:id(20),tipo:'grupo',titulo:'Equipe',participantes:[id(1)],created_by:id(1)}];b.erp_mensagens=[{id:id(21),conversa_id:id(20),autor_id:id(1),texto:'Mensagem',created_at:'2026-09-14T12:00:00Z'}];
 const s=projetar(b,blank()),n=copy(s.db);n.conversas[0].mensagens[0].estilo={cor:'blue',fonte:'Arial'};
 const ops=prepararEdicao(s.db,n,s,n.usuarios[0]);assert.equal(ops[0].table,'integracao_chat');assert.equal(ops[0].changes.referencia_id,id(20));
 assert.deepEqual(projetar(apply(s.base,ops),blank()).db.conversas[0].mensagens[0].estilo,{cor:'blue',fonte:'Arial'});
});
test('trimming audit and notifications never deletes shared history',()=>{
 const b=fixture();b.integracao_auditoria=[{colecao:'auditoria',registro_id:'a',dados:{acao:'Salvou'}}];b.integracao_notificacoes=[{colecao:'notificacoes',registro_id:'n',dados:{titulo:'Aviso'}}];
 const s=projetar(b,blank()),n=copy(s.db);n.auditoria=[];n.notificacoes=[];
 assert.deepEqual(prepararEdicao(s.db,n,s,n.usuarios[0]),[]);
});
test('file queue survives offline reopen, uploads immutably, and downloads on another device',async()=>{
 const originalFetch=globalThis.fetch,objects=new Map(),data=new Map(),storage={get:async k=>data.get(k)||null,set:async(k,v)=>data.set(k,v)};
 globalThis.fetch=async(url,options={})=>{if(url.includes('/rest/'))return Response.json([]);const path=url.split('/integracao/')[1];if(options.method==='POST'){assert.equal(options.headers['x-upsert'],'false');objects.set(path,new TextDecoder().decode(options.body));return Response.json({});}return new Response(objects.get(path));};
 definirSessao({access_token:'fixture-only',expires_in:3600});
 try {
  const s=projetar(fixture(),blank()),actor=s.db.usuarios[0];await abrirArquivos(actor,s.base,storage);assert.equal(arquivosPendentes(),false);
  await agendarArquivo('integracao-prf-modelo-v4','<p>PRF</p>');fecharArquivos();await abrirArquivos(actor,s.base,storage);assert(arquivosPendentes());
  const staged=await prepararArmazenamento(s,s.db);assert.equal(staged.operations[0].changes.referencia_tabela,'integracao_config');
  // A second edit during upload must survive acknowledgement of the first.
  await agendarArquivo('integracao-prf-modelo-v4','<p>Novo PRF</p>');const b=apply(s.base,staged.operations);await confirmarArquivos(staged.sent,b);assert(arquivosPendentes());
  const later=await prepararArmazenamento({...s,base:b},s.db);assert.deepEqual(later.operations[0].expected.dados,b.integracao_arquivos[0].dados);const final=apply(b,later.operations);await confirmarArquivos(later.sent,final);assert.equal(arquivosPendentes(),false);
  fecharArquivos();data.clear();await abrirArquivos(actor,final,storage);assert.equal(await obterArquivo('integracao-prf-modelo-v4'),'<p>Novo PRF</p>');
 } finally {fecharArquivos();definirSessao(null);globalThis.fetch=originalFetch;}
});
