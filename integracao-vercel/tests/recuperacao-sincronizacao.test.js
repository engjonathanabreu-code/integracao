import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import React from 'react';
import {separarCriacoesPendentes,recuperarCorDeAgenda} from '../src/recuperacao-sincronizacao.js';
import {fixture,blank,id} from './fixture.js';
import {projetar,copy,prepararEdicao} from '../src/dados-compartilhados.js';
import {permissoes} from '../src/permissoes.js';

test('remote baseline distinguishes pending creations from confirmed and legacy rows across modules',()=>{
 for(const collection of ['eventos','processos','planos','agendas','nucleos','conversas']){
  const baseline={[collection]:[{id:'legacy'},{id:'old'}]};
  const state={db:{[collection]:[{id:'legacy'},{id:'old',_compartilhado:true},{id:'new'},{id:'bound'},{id:'own',_compartilhado:true}]},bindings:[{collection,id:'bound'}]};
  assert.deepEqual(separarCriacoesPendentes(state,baseline).db[collection].map(r=>r.id),['legacy','old','bound','own']);
  assert.equal(state.db[collection].length,5,'projection is not mutated');
 }
});
test('old failed temporary creation is never promoted to a confirmed baseline',()=>{
 const row={id:'ev_local'},state={db:{eventos:[row]},bindings:[]};
 assert.deepEqual(separarCriacoesPendentes(state,state.db,{operations:[{tempId:row.id}]}).db.eventos,[]);
});
test('legacy draft recovery requires the owner and never recreates a previously shared event',()=>{
 const actor={id:'u'},rows=[{id:'local',criadoPor:'u'},{id:'other',criadoPor:'v'},{id:'shared',criadoPor:'u',_compartilhado:true}];
 const state={db:{eventos:rows},bindings:[]},attempt={rejeitada:true,after:state.db,operations:[]};
 assert.deepEqual(separarCriacoesPendentes(state,state.db,attempt,actor).db.eventos.map(r=>r.id),['other','shared']);
 assert.deepEqual(separarCriacoesPendentes(state,state.db,{...attempt,rejeitada:false},actor).db.eventos,rows);
});
test('color recovery is limited to the rejected implicit agenda color and preserves edits made afterward',()=>{
 const local={eventos:[{id:'e',cor:'#777777',agendaId:'a',titulo:'Novo título'}],agendas:[{id:'a',cor:'#777777'}]};
 const remote={eventos:[{id:'e',cor:'#123456'}]};
 const rejected={rejeitada:true,erro:'Somente a administração pode alterar cores',operations:[{action:'evento_cor',payload:{id:'e',cor:'#777777'}}]};
 assert.deepEqual(recuperarCorDeAgenda(local,remote,rejected).eventos,[{...local.eventos[0],cor:'#123456'}]);
 assert.equal(local.eventos[0].cor,'#777777');
 for(const attempt of [{...rejected,rejeitada:false},{...rejected,erro:'Outra recusa'},{...rejected,operations:[]}])assert.deepEqual(recuperarCorDeAgenda(local,remote,attempt),local);
 const newer=copy(local);newer.eventos[0].cor='#abcdef';assert.deepEqual(recuperarCorDeAgenda(newer,remote,rejected),newer);
});
test('calendar form changes the resource without requesting an administrative color change',()=>{
 const base=fixture();base.profiles[0].tipo='Comercial';
 base.erp_agendas=[{id:id(40),nome:'Sala',cor:'#888888'},{id:id(43),nome:'Carro',cor:'#777777'}];
 base.erp_eventos=[{id:id(41),titulo:'Reserva',descricao:'',cor:'#123456',agenda_id:id(40),inicio:'2026-10-29T09:00:00Z',fim:'2026-10-29T10:00:00Z',status:'ativo',publico:true,participantes:[id(1)],created_by:id(1)}];
 const state=projetar(base,blank()),db=copy(state.db);
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const code=transformSync(app.slice(app.indexOf('function ModalEvento('),app.indexOf('function ModalEditarAgenda(')),{loader:'jsx'}).code;
 let form;
 const deps={React,permissoes,rotuloNucleo:(_db,n)=>n.nome,useState:init=>{form??=init();return [form,update=>{form=update(form);}];},useRef:()=>({current:false}),useEffect:()=>{},soData:v=>v.slice(0,10),hhmm:v=>v.slice(11,16),dataBR:v=>v,Modal:'section',Aviso:'aside',Tag:'span',AlertTriangle:'span'};
 const Modal=new Function(...Object.keys(deps),code+';return ModalEvento;')(...Object.values(deps));
 const props={db,usuario:db.usuarios[0],inicial:db.eventos[0],mutar:fn=>fn(db),setToast:()=>{},onFechar:()=>{}};
 const find=(node,predicate)=>{if(!node)return; if(Array.isArray(node))return node.map(n=>find(n,predicate)).find(Boolean);if(predicate(node))return node;return find(node.props?.children,predicate);};
 find(Modal(props),n=>n.props?.id==='eva').props.onChange({target:{value:id(43)}});
 find(Modal(props).props.rodape,n=>n.type==='button'&&n.props.children==='Salvar').props.onClick();
 assert.equal(db.eventos[0].agendaId,id(43));assert.equal(db.eventos[0].cor,'#123456');
 const ops=prepararEdicao(state.db,db,state,db.usuarios[0]);
 assert.ok(ops.some(o=>o.changes?.agenda_id===id(43)));assert.ok(!ops.some(o=>o.action==='evento_cor'));
});


test('cancelled local reservation never becomes an active creation, with or without overlap',()=>{
 const base=fixture();base.erp_eventos=[{id:id(41),titulo:'Confirmed',inicio:'2026-11-10T12:00:00Z',fim:'2026-11-10T15:00:00Z',agenda_id:id(40),participantes:[id(1)],status:'ativo',created_by:id(1)}];
 const state=projetar(base,blank()),actor=state.db.usuarios[0];
 for(const agendaId of ['',id(40)]){
  const after=copy(state.db);
  after.eventos.push({id:id(42),titulo:'Cancelled before confirmation',inicio:'2026-11-10T12:00:00Z',fim:'2026-11-10T15:00:00Z',agendaId,participantes:[actor.id],status:'cancelado',respostas:{}});
  const operations=prepararEdicao(state.db,after,state,actor);
  assert.ok(!operations.some(o=>o.action==='evento'));
  const history=operations.find(o=>o.table==='integracao_calendario'&&o.key.registro_id===id(42));
  assert.equal(history.changes.dados.status,'cancelado');
  assert.equal(history.changes.criado_por,actor.erpRef);
  assert.equal(history.changes.referencia_tabela,null);
  assert.equal(history.changes.referencia_id,null);
  assert.equal(after.eventos[1].status,'cancelado','retain local history');
  after.eventos[1].status='ativo';
  assert.ok(prepararEdicao(state.db,after,state,actor).some(o=>o.action==='evento'&&o.tempId===id(42)),'reactivated draft can be created');
 }
});

test('cancelling a confirmed event still sends its guarded cancellation',()=>{
 const base=fixture();base.erp_eventos=[{id:id(41),titulo:'Confirmed',inicio:'2026-11-10T12:00:00Z',fim:'2026-11-10T15:00:00Z',agenda_id:id(40),participantes:[id(1)],status:'ativo',created_by:id(1)}];
 const state=projetar(base,blank()),after=copy(state.db);after.eventos[0].status='cancelado';
 const operations=prepararEdicao(state.db,after,state,state.db.usuarios[0]);
 assert.ok(operations.some(o=>o.action==='evento_status'&&o.payload.id===id(41)&&o.payload.status==='cancelado'&&o.expected.status==='ativo'));
 assert.ok(!operations.some(o=>o.action==='evento'));
});

test('rejected creation queue recognizes original IDs recovered on the server',()=>{
 const base=fixture(),initial=projetar(base,blank()),local=copy(initial.db);
 for(const n of [42,43,44])local.eventos.push({id:id(n),titulo:'Recovered reservation',inicio:'2026-11-10T12:00:00Z',fim:'2026-11-10T15:00:00Z',agendaId:'',participantes:[initial.db.usuarios[0].id],status:'ativo',respostas:{}});
 const attempt={rejeitada:true,operations:local.eventos.map(e=>({action:'evento',tempId:e.id})),after:local};
 base.erp_eventos=local.eventos.map(e=>({id:e.id,titulo:e.titulo,inicio:e.inicio,fim:e.fim,agenda_id:null,participantes:[id(1)],status:'ativo',created_by:id(1)}));
 const remote=separarCriacoesPendentes(projetar(base,local),initial.db,attempt,initial.db.usuarios[0]);
 assert.equal(remote.db.eventos.length,3,'canonical bindings take precedence over stale temporary IDs');
 assert.ok(!prepararEdicao(remote.db,copy(remote.db),remote,initial.db.usuarios[0]).some(o=>o.action==='evento'),'rebuilt queue must not duplicate recovered reservations');
});
