import test from 'node:test';
import assert from 'node:assert/strict';
import {prazosDoCalendario,eventoDoFiltro,rotuloPrazo} from '../src/calendario-prazos.js';
const db={usuarios:[{id:'ana',nome:'Ana',setor:'topografia'},{id:'bia',nome:'Bia',setor:'projeto'}],metas:[
 {id:'ativa',titulo:'Levantamento',status:'Em andamento',prazo:'2026-09-14',setor:'Topografia',responsaveis:['ana']},
 {id:'aprovacao',titulo:'Revisão',status:'Aguardando aprovação',prazo:'2026-10-02',setor:'Projetos',responsaveis:['bia']},
 ...['Concluído','Concluída','Cancelado'].map((status,i)=>({id:`fim${i}`,status,prazo:'2026-09-14',responsaveis:['ana']})),
 {id:'sem-prazo',status:'Em andamento',semana_inicio:'2026-09-14',responsaveis:['ana']},
 {id:'setor-sem-agente',status:'Em andamento',prazo:'2026-09-15',setor:'Topografia',responsaveis:[]}
],planos:[{id:'pl',titulo:'Plano ativo',status:'Em andamento',etapas:[
 {id:'et',titulo:'Medição',status:'Em andamento',prazo:'2026-09-16',responsaveis:['ana','bia']},
 ...['Pendente','Concluída','Concluído','Cancelado'].map((status,i)=>({id:`etfim${i}`,status,prazo:'2026-09-14',responsaveis:['ana']})),
 {id:'sem-agente',status:'Em andamento',prazo:'2026-09-14',responsaveis:[]},
 {id:'sem-data',status:'Em andamento',inicio:'2026-09-14',responsaveis:['ana']}
]},...['Concluído','Cancelado'].map((status,i)=>({id:`plfim${i}`,status,etapas:[{id:`inconsistente${i}`,status:'Em andamento',prazo:'2026-09-14',responsaveis:['ana']}]}))]};
test('only active deadlines and assigned stages in progress are shown',()=>{
 assert.deepEqual(prazosDoCalendario(db).map(i=>i.id),['mt_ativa','mt_aprovacao','mt_setor-sem-agente','pl_et']);
});
test('user filter includes shared assignments and excludes other users and unassigned metas',()=>{
 const items=prazosDoCalendario(db,{usuarioId:'bia'});assert.deepEqual(items.map(i=>i.id),['mt_aprovacao','pl_et']);assert(rotuloPrazo(items[1]).includes('Ana, Bia'));
});
test('whole-sector filter includes meta sector and stage agents, with normalized ERP labels',()=>{
 assert.deepEqual(prazosDoCalendario(db,{setor:'topografia'}).map(i=>i.id),['mt_ativa','mt_setor-sem-agente','pl_et']);
 assert.deepEqual(prazosDoCalendario(db,{setor:'projeto'}).map(i=>i.id),['mt_aprovacao','pl_et']);
});
test('deadlines keep their original dates for period navigation and overdue items',()=>{
 const items=prazosDoCalendario(db,{hoje:'2026-09-15'});assert.equal(items[0].dia,'2026-09-14');assert.equal(items[0].atrasada,true);assert.equal(items[1].dia,'2026-10-02');assert.equal(items[1].atrasada,false);
 assert.deepEqual(items.filter(i=>i.dia>='2026-10-01'&&i.dia<='2026-10-31').map(i=>i.id),['mt_aprovacao']);
});
test('calendar filters also select event participants without changing event data',()=>{
 const event={participantes:['ana'],criadoPor:'bia'};assert(eventoDoFiltro(event,db,{setor:'Projetos'}));assert(!eventoDoFiltro(event,db,{usuarioId:'outro'}));
 const original=structuredClone(db);prazosDoCalendario(db,{usuarioId:'ana'});assert.deepEqual(db,original);
});
