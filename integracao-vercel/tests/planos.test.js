import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,blank,id} from './fixture.js';
import {copy,projetar,prepararEdicao} from '../src/dados-compartilhados.js';

test('standalone plan creates no client or process and survives a fresh load',()=>{
 const s=projetar(fixture(),blank()),n=copy(s.db);
 n.planos.push({id:id(91),titulo:'Plano avulso',descricao:'Atividade interna',status:'Planejamento',projetoId:null,tipoVinculo:'avulso',municipioId:null,municipioNome:'',uf:'',remessaId:null,etapas:[]});
 const ops=prepararEdicao(s.db,n,s,n.usuarios[0]);
 assert(ops.every(o=>['planos_trabalho','integracao_planos'].includes(o.table)));
 const b=copy(s.base);for(const op of ops)b[op.table].push({...op.key,...op.changes});
 const p=projetar(b,blank()).db.planos.find(p=>p.id===id(91));assert.equal(p.tipoVinculo,'avulso');assert.equal(p.municipioId,null);assert.equal(p.municipioNome,'');assert.equal(p.titulo,'Plano avulso');
});
test('editing plan information and making it standalone preserves all its stages',()=>{
 const b=fixture();b.planos_trabalho[0].projeto_id=id(80);b.projetos=[{id:id(80),nome:'Município teste'}];
 const s=projetar(b,blank()),n=copy(s.db),stages=copy(n.planos[0].etapas);
 Object.assign(n.planos[0],{titulo:'Plano revisado',descricao:'Nova descrição',status:'Planejamento',projetoId:null,tipoVinculo:'avulso',municipioId:null,municipioNome:'',uf:'',remessaId:null});
 const ops=prepararEdicao(s.db,n,s,n.usuarios[0]),op=ops.find(o=>o.table==='planos_trabalho');
 assert.deepEqual(op.changes,{titulo:'Plano revisado',descricao:'Nova descrição',status:'Planejamento',projeto_id:null});
 assert.equal(op.expected.projeto_id,id(80));assert.deepEqual(n.planos[0].etapas,stages);assert(ops.every(o=>['planos_trabalho','integracao_planos'].includes(o.table)));assert(!ops.some(o=>o.remove));
});
