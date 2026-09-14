import test from 'node:test';
import assert from 'node:assert/strict';
import {projetar,alteracoesCompartilhadas,complementos,mesclarEdicoes,copy,prepararEdicao} from '../src/dados-compartilhados.js';

import {fixture,blank,id} from './fixture.js';
const setup=()=>{const b=fixture(),s=projetar(b,blank());return {s,actor:s.db.usuarios[0]};};
test('login presence flags do not create writes',()=>{
  const {s,actor}=setup(),n=copy(s.db);n.usuarios[0].online=true;n.usuarios[0].ultimaAtividade=new Date().toISOString();n.auditoria.push({id:id(90),acao:'Entrou no sistema'});
  assert.deepEqual(prepararEdicao(s.db,n,s,actor),[]);
});
test('creating a record writes shared columns once and links only its extra fields',()=>{
  const {s,actor}=setup(),n=copy(s.db);n.metas.push({...copy(n.metas[0]),id:id(40),titulo:'Nova',erpId:null,campoExclusivo:'Detalhe',checklist:[],responsaveis:[],historico:[]});
  const ops=prepararEdicao(s.db,n,s,actor),meta=ops.find(o=>o.table==='metas'&&o.insert),extra=ops.find(o=>o.table==='integracao_complementos');
  assert.equal(meta.changes.titulo,'Nova');assert.equal(extra.changes.referencia_tabela,'metas');assert.equal(extra.changes.referencia_id,id(40));assert.equal(extra.changes.dados.titulo,undefined);assert.equal(extra.changes.dados.campoExclusivo,'Detalhe');
});
test('financial conditions read in place and update just the edited amount',()=>{
  const b=fixture();b.fin_receb_clientes[0].valor_global=2400;b.fin_receb_clientes[0].valor_entrada=400;
  const s=projetar(b,blank()),n=copy(s.db);assert.equal(n.processos[0].comercial.valorTotal,'2400');n.processos[0].comercial.entrada='500,00';
  const ops=prepararEdicao(s.db,n,s,s.db.usuarios[0]);assert.deepEqual(ops[0].changes,{valor_entrada:500});assert.equal(ops.length,1);
});
test('removing a nucleus uses the ERP soft exclusion',()=>{
  const {s,actor}=setup(),n=copy(s.db);n.nucleos=[];const ops=prepararEdicao(s.db,n,s,actor);
  assert.equal(ops[0].remove,undefined);assert.deepEqual(ops[0].changes,{excluido_erp:true});
});
test('files and plan documents retain existing storage paths',()=>{
  const b=fixture();b.meta_arquivos=[{id:id(60),meta_id:id(7),nome:'Arquivo teste.pdf',caminho_storage:'original/teste.pdf',mime_type:'application/pdf',tamanho_bytes:12}];
  b.documentos=[{id:id(61),etapa_plano_id:id(9),nome:'Plano.pdf',caminho_storage:'original/plano.pdf'}];
  const s=projetar(b,blank());assert.equal(s.db.metas[0].arquivos[0].chave,'erp-storage|documentos|original/teste.pdf');assert.equal(s.db.planos[0].documentos[0].id,id(61));assert.deepEqual(prepararEdicao(s.db,copy(s.db),s,s.db.usuarios[0]),[]);
});
test('comments retain their step reference without rewriting plan history',()=>{
  const {s,actor}=setup(),n=copy(s.db);n.planos[0].etapas[0].comentarios.push({id:id(62),texto:'Comentário da etapa'});
  const ops=prepararEdicao(s.db,n,s,actor);assert.equal(ops[0].changes.integracao_etapa_id,id(9));assert.equal(ops[0].changes.texto,'Comentário da etapa');
});
test('initial incorporation has zero database mutations',()=>{
  const {s,actor}=setup();
  assert.equal(s.db.nucleos.length,1);assert.equal(s.db.processos.length,1);assert.equal(s.db.metas.length,1);assert.equal(s.db.planos[0].etapas.length,1);
  assert.deepEqual(alteracoesCompartilhadas(s.db,copy(s.db),s,actor),[]);
  assert.deepEqual(complementos(s.db,copy(s.db),s,actor),[]);
});
test('refresh reads ERP changes without making an outgoing write',()=>{
  const {s,actor}=setup(),b=copy(s.base);b.metas[0].titulo='Alterada no ERP';
  const refreshed=projetar(b,s.db);assert.equal(refreshed.db.metas[0].titulo,'Alterada no ERP');
  assert.deepEqual(alteracoesCompartilhadas(refreshed.db,refreshed.db,refreshed,actor),[]);
});
test('only explicitly edited columns are written with expected previous values',()=>{
  const {s,actor}=setup(),n=copy(s.db);n.metas[0].titulo='Alterada no Integração';
  assert.deepEqual(alteracoesCompartilhadas(s.db,n,s,actor),[{table:'metas',key:{id:id(7)},expected:{titulo:'Meta Teste'},changes:{titulo:'Alterada no Integração'}}]);
});
test('unmatched local data is preserved',()=>{
  const local=blank();local.processos=[{id:'local-1',requerente:{nome:'Local'}}];
  const result=projetar(fixture(),local);assert(result.db.processos.some(p=>p.id==='local-1'));assert.deepEqual(local.processos,[{id:'local-1',requerente:{nome:'Local'}}]);
});
test('edits to resident names target the existing financial customer only',()=>{
  const {s,actor}=setup(),n=copy(s.db);n.processos[0].requerente.nome='Novo nome';
  const ops=alteracoesCompartilhadas(s.db,n,s,actor);assert.equal(ops.length,1);assert.equal(ops[0].table,'fin_receb_clientes');assert.deepEqual(ops[0].changes,{nome:'Novo nome'});
});
test('plan completion uses the ERP status value',()=>{
  const {s,actor}=setup(),n=copy(s.db);n.planos[0].etapas[0].status='Concluída';
  assert.deepEqual(alteracoesCompartilhadas(s.db,n,s,actor)[0].changes,{status:'Concluída'});
});
test('nested deliverable updates keep the original record ID',()=>{
  const {s,actor}=setup(),n=copy(s.db);n.planos[0].etapas[0].entregaveis[0].concluido=true;
  const ops=alteracoesCompartilhadas(s.db,n,s,actor);assert.equal(ops[0].table,'entregaveis');assert.deepEqual(ops[0].key,{id:id(10)});
});
test('Kanban history is appended together with the explicit stage edit',()=>{
  const {s,actor}=setup(),n=copy(s.db);n.nucleos[0].etapaProcesso='Projetos';n.nucleos[0].historicoEtapas.push({id:id(11),de:'Topografia',para:'Projetos',observacao:'Movimentação'});
  const ops=alteracoesCompartilhadas(s.db,n,s,actor);assert.equal(ops.length,2);assert.equal(ops[1].table,'processos_kanban_historico');assert(ops[1].insert);
});
test('local-only fields do not overwrite canonical columns',()=>{
  const {s,actor}=setup(),n=copy(s.db);n.nucleos[0].ambiental='Avaliação';
  assert.deepEqual(alteracoesCompartilhadas(s.db,n,s,actor),[]);
  const ops=complementos(s.db,n,s,actor);assert.equal(ops.length,1);assert.deepEqual(ops[0].changes.dados,{ambiental:'Avaliação'});
});
test('three-way merge preserves a concurrent local edit and unrelated remote changes',()=>{
  const b={metas:[{id:'1',titulo:'Inicial',prazo:'A'}]},l=copy(b),r=copy(b);l.metas[0].titulo='Local';r.metas[0].prazo='B';
  assert.deepEqual(mesclarEdicoes(b,l,r),{metas:[{id:'1',titulo:'Local',prazo:'B'}]});
});
test('three-way merge retains both versions in their respective inputs for conflict handling',()=>{
  const b={titulo:'Inicial'},l={titulo:'Local'},r={titulo:'ERP'};
  assert.equal(mesclarEdicoes(b,l,r).titulo,'Local');assert.equal(r.titulo,'ERP');assert.equal(b.titulo,'Inicial');
});
test('initial dataset objects are not modified by projection',()=>{const b=fixture(),original=copy(b);projetar(b,blank());assert.deepEqual(b,original);});
