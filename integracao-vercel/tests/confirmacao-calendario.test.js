import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
import {alteracoesConfirmadas,divergenciasConfirmacao} from '../src/confirmacao-mutacoes.js';
function caso(){
 const b=fixture();b.erp_agendas=[{id:id(40),nome:'Sala',cor:'#0F5F5B'}];
 const state=projetar(b,blank()),d=structuredClone(state.db),actor=state.db.usuarios[0];
 // Same fields produced by the real calendar form, including its empty end date.
 const e={id:'ev_local',titulo:'Evento fictício',descricao:'Conferir',inicio:'2026-11-12T09:00:00',fim:'2026-11-12T10:00:00',agendaId:id(40),participantes:[actor.id],publico:true,cor:'#0F5F5B',entidade:null,recorrencia:'nenhuma',recorrenciaAte:'',status:'ativo',criadoPor:actor.id,respostas:{}};d.eventos.push(e);
 const ops=prepararEdicao(state.db,d,state,actor),op=ops.find(o=>o.action==='evento'),base=structuredClone(b);
 base.erp_eventos=[{id:id(41),...op.payload,inicio:op.payload.inicio.replace('Z','+00:00'),fim:op.payload.fim.replace('Z','+00:00'),cor:'#0F5F5B',status:'ativo',created_by:id(1),serie_id:null,entidade_id:null}];
 return {antes:state.db,depois:d,remoto:projetar(base,blank()).db,ops,aliases:{ev_local:id(41)}};
}
test('evento sem recorrência confirma datas canônicas e campo vazio do formulário com seu pedido',()=>{
 const c=caso();assert.equal(alteracoesConfirmadas(c.antes,c.depois,c.remoto,c.aliases,c.ops),true);assert.deepEqual(divergenciasConfirmacao(c.antes,c.depois,c.remoto,c.aliases,c.ops),[]);
});
for(const campo of ['titulo','descricao','cor','publico','agendaId','participantes','criadoPor','status'])test(`evento mantém comparação de negócio: ${campo}`,()=>{
 const c=caso();c.remoto.eventos[0][campo]=campo==='publico'?false:campo==='participantes'?[]:'valor divergente';assert.equal(alteracoesConfirmadas(c.antes,c.depois,c.remoto,c.aliases,c.ops),false);
});
test('não confirma outro horário, pedido, recorrência ou dados sem operação enviada',()=>{
 for(const mudar of [c=>{c.remoto.eventos[0].inicio=new Date(Date.parse(c.remoto.eventos[0].inicio)+3600000).toISOString();},c=>{c.ops[0].tempId='outro';},c=>{c.ops=[];},c=>{c.depois.eventos[0].recorrenciaAte='2026-12-01';},c=>{c.ops[0].payload.recorrencia='diaria';},c=>{c.ops[0].payload.inicio='inválida';}]){const c=caso();mudar(c);assert.equal(alteracoesConfirmadas(c.antes,c.depois,c.remoto,c.aliases,c.ops),false);}
});

test('identificador de série gerado pelo ERP não transforma evento único em recorrência solicitada',()=>{const c=caso();c.remoto.eventos[0].serieERP=id(99);assert.equal(alteracoesConfirmadas(c.antes,c.depois,c.remoto,c.aliases,c.ops),true);});

test('cor padrão do formulário sem cor enviada usa a cor atribuída pelo ERP',()=>{
 const c=caso();c.remoto.eventos[0].cor='#4f6eb9';assert.equal(alteracoesConfirmadas(c.antes,c.depois,c.remoto,c.aliases,c.ops),true);
 for(const mudar of [x=>x.depois.eventos[0].cor='#123456',x=>x.ops[0].payload.cor='#0F5F5B',x=>x.ops.push({action:'evento_cor',payload:{id:'ev_local',cor:'#0F5F5B'}})]){const x=caso();x.remoto.eventos[0].cor='#4f6eb9';mudar(x);assert.equal(alteracoesConfirmadas(x.antes,x.depois,x.remoto,x.aliases,x.ops),false);}
});
