import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
import {alteracoesConfirmadas,divergenciasConfirmacao} from '../src/confirmacao-mutacoes.js';

function caso(){
 const base=fixture();
 base.meta_checklist=[{id:id(20),meta_id:id(7),titulo:'Item fictício',concluido:false,concluido_por:null,concluido_em:null,created_by:id(1),created_at:'2026-11-12T12:00:00+00:00',updated_at:'2026-11-12T12:00:00+00:00'}];
 const state=projetar(base,blank()),antes=state.db,depois=structuredClone(antes),item=depois.metas[0].checklist[0];
 Object.assign(item,{concluido:true,concluido_por:antes.usuarios[0].nome,concluido_em:'2026-11-12T16:15:36.123Z'});
 const ops=prepararEdicao(antes,depois,state,antes.usuarios[0]),remotoBase=structuredClone(base);
 Object.assign(remotoBase.meta_checklist[0],{concluido:true,concluido_por:id(1),concluido_em:'2026-11-12T16:15:36.123+00:00'});
 return {antes,depois,ops,remoto:projetar(remotoBase,blank()).db};
}
const conferir=c=>alteracoesConfirmadas(c.antes,c.depois,c.remoto,c.aliases||{},c.ops);
const item=c=>c.remoto.metas[0].checklist[0];

test('checklist: preparação e projeção reais confirmam o instante enviado em outra representação ISO',()=>{
 for(const horario of ['2026-11-12T16:15:36.123+00:00','2026-11-12T13:15:36.123-03:00','2026-11-12T16:15:36.123000Z']){
  const c=caso(),snapshot=structuredClone(c);item(c).concluido_em=horario;
  const original=structuredClone(c);
  assert.equal(conferir(c),true,horario);assert.deepEqual(divergenciasConfirmacao(c.antes,c.depois,c.remoto,{},c.ops),[]);
  assert.deepEqual(c,original,'a conferência não modifica pedido ou snapshots');assert.equal(snapshot.ops[0].changes.concluido_em,'2026-11-12T16:15:36.123Z');
 }
});
test('checklist: outro instante, ausência, nulo, data civil e formatos inválidos continuam divergentes',()=>{
 for(const horario of ['2026-11-12T16:15:36.124+00:00','2026-11-12T16:15:36.123001+00:00','2026-11-12T17:15:36.123Z','2026-11-12','2026-11-12T16:15:36.123',null,undefined,'inválido',1794500136123]){
  const c=caso();if(horario===undefined)delete item(c).concluido_em;else item(c).concluido_em=horario;
  assert.equal(conferir(c),false,String(horario));
 }
 const c=caso();c.antes.metas[0].checklist[0].concluido_em='2026-11-11T16:15:36.123Z';c.depois.metas[0].checklist[0].concluido_em=null;c.ops[0].changes.concluido_em=null;assert.equal(conferir(c),false);
 const d=caso();d.depois.metas[0].checklist[0].concluido_em='2026-02-30T16:15:36.123Z';d.ops[0].changes.concluido_em=d.depois.metas[0].checklist[0].concluido_em;item(d).concluido_em='2026-03-02T16:15:36.123+00:00';assert.equal(conferir(d),false);
});
test('checklist: normalização exige a operação de atualização da mesma identidade e o valor enviado',()=>{
 for(const alterar of [c=>c.ops=[],c=>c.ops[0].key.id=id(21),c=>delete c.ops[0].changes.concluido_em,c=>c.ops[0].changes.concluido_em='2026-11-12T16:15:36.124Z',c=>c.ops[0].table='metas',c=>c.ops[0].action='evento',c=>c.ops[0].remove=true,c=>c.ops[0].insert=true]){
  const c=caso();alterar(c);assert.equal(conferir(c),false);
 }
 const c=caso();c.aliases={[id(20)]:id(21)};item(c).id=id(21);assert.equal(conferir(c),true,'alias tipado da própria identidade');
});
test('checklist: autoria, título, conclusão, identidade do item e meta permanecem exatos',()=>{
 for(const alterar of [c=>item(c).concluido_por='Outra pessoa',c=>{c.depois.metas[0].checklist[0].titulo='Título editado';c.ops[0].changes.titulo='Título editado';item(c).titulo='Outro item';},c=>item(c).concluido=false,c=>item(c).id=id(21),c=>c.remoto.metas[0].id=id(22),c=>c.remoto.metas[0].checklist=[]]){
  const c=caso();alterar(c);assert.equal(conferir(c),false);
 }
});
test('checklist: adaptação não muda timestamps de outras coleções, campos ou checklist novo',()=>{
 for(const [colecao,campo] of [['metas','prazo'],['usuarios','criadoEm'],['planos','concluido_em']]){
  const antes={[colecao]:[{id:id(7),[campo]:null}]},depois=structuredClone(antes),remoto=structuredClone(antes);
  depois[colecao][0][campo]='2026-11-12T16:15:36.123Z';remoto[colecao][0][campo]='2026-11-12T16:15:36.123+00:00';
  assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},[{table:'meta_checklist',key:{id:id(7)},changes:{concluido_em:depois[colecao][0][campo]}}]),false);
 }
 const c=caso();c.antes.metas[0].checklist=[];assert.equal(conferir(c),false,'inserção exige contrato próprio, não regra de atualização');
});
