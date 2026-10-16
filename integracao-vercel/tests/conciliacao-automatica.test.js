import test from 'node:test';
import assert from 'node:assert/strict';
import {conciliarMaisRecentes,atualizarAutomaticamente,preservarRegistrosAusentes,separarReservasConflitantes} from '../src/conciliacao-automatica.js';
import {projetar,prepararEdicao,copy} from '../src/dados-compartilhados.js';
import {fixture,blank,id} from './fixture.js';
import {documentoMaisRecente,registrarVerificacaoHumana} from '../src/documentos-verificacao-humana.js';
test('latest conflicting value wins, independent fields and history survive',()=>{
 const base={itens:[{id:'a',titulo:'Inicial',nota:'Antes',updated_at:'2026-10-10T10:00:00Z'}]};
 const local={itens:[{...base.itens[0],titulo:'Local',nota:'Preservar',updated_at:'2026-10-12T10:00:00Z'}]};
 const remoto={itens:[{...base.itens[0],titulo:'Remoto',updated_at:'2026-10-13T10:00:00Z'},{id:'b',titulo:'Novo'}]};
 const r=atualizarAutomaticamente(base,local,remoto);assert.equal(r.conflitos.length,0);assert.equal(r.dados.itens[0].titulo,'Remoto');assert.equal(r.dados.itens[0].nota,'Preservar');assert.equal(r.dados.itens.length,2);assert.deepEqual(r.baseline,remoto);
 local.itens[0].updated_at='2026-10-14T10:00:00Z';assert.equal(conciliarMaisRecentes(base,local,remoto).dados.itens[0].titulo,'Local');
});
test('approved server goal replaces stale request without blocking users',()=>{
 const base={metas:[{id:'m',status:'Em andamento',solicitacaoConclusao:null,historico:[]}]};
 const local={metas:[{...base.metas[0],status:'Aguardando aprovação',solicitacaoConclusao:{data:'2026-10-05T13:00:00Z'}}]};
 const remoto={metas:[{...base.metas[0],status:'Concluído',historico:[{id:'h',data:'2026-10-06T14:00:00Z',acao:'Conclusão aprovada'}]}]};
 const r=conciliarMaisRecentes(base,local,remoto);assert.equal(r.dados.metas[0].status,'Concluído');assert.equal(r.dados.metas[0].solicitacaoConclusao,null);assert.equal(r.conflitos.length,0);
});
test('confirmed rejected partial cache recovers server clients without deleting edits',()=>{
 const base={processos:[{id:'a',nome:'A'},{id:'b',nome:'B'}]},local={processos:[{id:'a',nome:'Alterado'}]},remoto={processos:[...base.processos,{id:'c',nome:'Novo'}]};
 const recuperado=preservarRegistrosAusentes(base,local,remoto);const r=conciliarMaisRecentes(base,recuperado,remoto);assert.deepEqual(r.dados.processos,[{id:'a',nome:'Alterado'},{id:'b',nome:'B'},{id:'c',nome:'Novo'}]);assert.equal(local.processos.length,1);
});
test('deleting a calendar event requests cancellation and preserves its history',()=>{
 const b=fixture();b.erp_eventos=[{id:id(40),titulo:'Evento',inicio:'2026-10-15T10:00:00Z',fim:'2026-10-15T11:00:00Z',participantes:[],status:'ativo',created_by:id(1)}];
 const state=projetar(b,blank()),next=copy(state.db);next.eventos=[];
 const ops=prepararEdicao(state.db,next,state,state.db.usuarios[0]);assert.ok(ops.some(o=>o.action==='evento_status'&&o.payload.status==='cancelado'));assert.ok(!ops.some(o=>o.table==='erp_eventos'&&o.remove));
});
test('human verification considers the latest matching document, not another occupant',()=>{
 const docs=[{id:'a',tipo:'comp_residencia',data:'2026-10-15T10:00:00Z',regras:[]},{id:'b',tipo:'comp_residencia',pessoaId:'ocupantes:o1',data:'2026-10-15T11:00:00Z',regras:[{gravidade:'bloqueia',resultado:'nao_atende'}]}];
 assert.equal(documentoMaisRecente(docs,'comp_residencia').id,'a');assert.equal(registrarVerificacaoHumana({processo:{situacao:'Ativo',docs},tipo:'comp_residencia',justificativa:'Conferido pessoalmente',usuario:{nome:'Teste'},perm:{validarDocs:true},id:'c'}).documentoAnteriorId,'a');
});

test('refused reservation is backed up while independent edits can sync',()=>{
 const evento={id:'local',agendaId:'sala',status:'ativo',inicio:'2026-10-15T13:00:00Z',fim:'2026-10-15T14:00:00Z',titulo:'Reunião'};
 const local={eventos:[evento],metas:[{id:'m',titulo:'Preservar'}]},remoto={eventos:[{...evento,id:'servidor'}]};
 const r=separarReservasConflitantes({eventos:[]},local,remoto);assert.deepEqual(r.preservadas[0].evento,evento);assert.equal(r.dados.eventos.length,0);assert.equal(r.dados.metas[0].titulo,'Preservar');assert.equal(local.eventos.length,1);
});
