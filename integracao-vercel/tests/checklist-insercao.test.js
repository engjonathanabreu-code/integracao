import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
import {alteracoesConfirmadas} from '../src/confirmacao-mutacoes.js';
function caso(horario='2026-11-12T12:30:00.123456Z'){
 const base=fixture(),state=projetar(base,blank()),antes=state.db,depois=structuredClone(antes);
 depois.metas[0].checklist.push({id:id(50),titulo:'Item novo concluído',concluido:true,concluido_por:antes.usuarios[0].nome,concluido_em:horario});
 return {base,state,antes,depois,actor:antes.usuarios[0]};
}
function enviarFixture(c){
 const ops=prepararEdicao(c.antes,c.depois,c.state,c.actor);
 for(const op of ops){const rows=c.base[op.table]||=[];rows.push({concluido_em:null,...op.key,...op.changes});}
 const row=c.base.meta_checklist[0];if(typeof row.concluido_em==='string')row.concluido_em=row.concluido_em.replace('Z','+00:00');
 return {...c,ops,remoto:projetar(c.base,blank()).db};
}
test('checklist novo concluído envia o horário explícito com precisão e confirma a própria inserção',()=>{
 const c=enviarFixture(caso()),op=c.ops.find(o=>o.table==='meta_checklist');
 assert.equal(op.insert,true);assert.equal(op.changes.concluido_em,'2026-11-12T12:30:00.123456Z');assert.equal(Object.hasOwn(op.changes,'concluido_por'),false,'não altera contrato de autoria');
 assert.equal(alteracoesConfirmadas(c.antes,c.depois,c.remoto,{},c.ops),true);
 for(const alterar of [x=>x.ops=[],x=>x.ops[0].key.id=id(51),x=>x.ops[0].changes.meta_id=id(8),x=>x.ops[0].insert=false,x=>x.ops[0].action='evento',x=>x.ops[0].remove=true,x=>x.remoto.metas[0].checklist[0].concluido_em='2026-11-12T12:30:00.123457Z',x=>x.remoto.metas[0].checklist[0].concluido_por='Outro autor',x=>x.remoto.metas[0].checklist[0].titulo='Outro item']){
  const x=structuredClone({antes:c.antes,depois:c.depois,remoto:c.remoto,ops:c.ops});alterar(x);assert.equal(alteracoesConfirmadas(x.antes,x.depois,x.remoto,{},x.ops),false);
 }
});
test('meta nova confirma checklist inicial por identidade e campos enviados, sem exigir defaults somente de leitura',()=>{
 for(const concluido of [false,true]){
  const base=fixture(),state=projetar(base,blank()),antes=state.db,depois=structuredClone(antes),novo={...structuredClone(antes.metas[0]),id:id(43),erpId:null,titulo:'Nova meta',checklist:[{id:id(44),titulo:'Primeiro item',concluido}]};delete novo._compartilhado;
  if(concluido)Object.assign(novo.checklist[0],{concluido_por:antes.usuarios[0].nome,concluido_em:'2026-11-12T12:30:00.123Z'});
  depois.metas.push(novo);const ops=prepararEdicao(antes,depois,state,antes.usuarios[0]);
  for(const op of ops){const rows=base[op.table]||=[];rows.push({created_at:'2026-11-12T12:30:01.123+00:00',concluido_em:null,...op.key,...op.changes});}
  const row=base.meta_checklist[0];if(row.concluido_em)row.concluido_em=row.concluido_em.replace('Z','+00:00');
  const remoto=projetar(base,blank()).db;assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),true);
  const nova=remoto.metas.find(m=>m.id===id(43));nova.checklist[0].titulo='Outro conteúdo';assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),false);
 }
});
test('checklist novo não inventa horário ausente e recusa instantes inválidos preservando o original',()=>{
 const c=caso();delete c.depois.metas[0].checklist[0].concluido_em;const ops=prepararEdicao(c.antes,c.depois,c.state,c.actor);assert.equal(ops.find(o=>o.table==='meta_checklist').changes.concluido_em,null);
 for(const v of ['2026-02-30T12:00:00Z','2026-11-12','2026-11-12T12:00:00','inválido',123,{},'2026-11-12T12:00:00.1234567Z']){
  const x=caso(v),original=structuredClone(x.depois);assert.throws(()=>prepararEdicao(x.antes,x.depois,x.state,x.actor),{code:'22007',status:422});assert.deepEqual(x.depois,original);
 }
});
