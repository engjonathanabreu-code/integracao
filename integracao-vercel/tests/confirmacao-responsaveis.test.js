import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
import {alteracoesConfirmadas,divergenciasConfirmacao} from '../src/confirmacao-mutacoes.js';
const pessoa=n=>'erp_'+id(n);
function caso(nova=false){
 const base=fixture();base.profiles.push({id:id(2),nome:'Pessoa B',tipo:'Projetos',ativo:true});
 const state=projetar(base,blank()),antes=state.db,depois=structuredClone(antes);
 const meta=nova?{...structuredClone(depois.metas[0]),id:id(30),erpId:null}:depois.metas[0];
 if(nova){delete meta._compartilhado;depois.metas.push(meta);}
 meta.responsaveis=[pessoa(2),pessoa(1)];
 const ops=prepararEdicao(antes,depois,state,antes.usuarios[0]);
 for(const op of ops){const rows=base[op.table]||=[],row=rows.find(r=>Object.entries(op.key).every(([k,v])=>r[k]===v));if(row)Object.assign(row,op.changes);else rows.push({...op.key,...op.changes});}
 base.meta_responsaveis.sort((a,b)=>a.usuario_id.localeCompare(b.usuario_id));
 return {antes,depois,ops,remoto:projetar(base,blank()).db,id:meta.id};
}
const meta=c=>c.remoto.metas.find(m=>m.id===c.id);
const confirmar=c=>alteracoesConfirmadas(c.antes,c.depois,c.remoto,c.aliases||{},c.ops);
for(const nova of [false,true])test(`responsáveis: conjunto exato confirma ordem canônica em meta ${nova?'nova':'existente'}`,()=>{
 const c=caso(nova),snapshot=structuredClone(c);
 assert.deepEqual(meta(c).responsaveis,[pessoa(1),pessoa(2)]);assert.equal(confirmar(c),true);
 assert.deepEqual(divergenciasConfirmacao(c.antes,c.depois,c.remoto,{},c.ops),[]);assert.deepEqual(c,snapshot);
});
for(const nova of [false,true])test(`responsáveis: identidades diferentes, faltantes, extras e inválidas divergem em meta ${nova?'nova':'existente'}`,()=>{
 for(const responsaveis of [[pessoa(1)],[pessoa(1),pessoa(2),pessoa(3)],[pessoa(1),pessoa(3)],[pessoa(1),pessoa(1)],['Pessoa B','Pessoa A'],null,undefined]){
  const c=caso(nova);if(responsaveis===undefined)delete meta(c).responsaveis;else meta(c).responsaveis=responsaveis;
  assert.equal(confirmar(c),false,JSON.stringify(responsaveis));
 }
 for(const invalidos of [[pessoa(1),pessoa(1)],['Pessoa A'],null]){
  const c=caso(nova);c.depois.metas.find(m=>m.id===c.id).responsaveis=invalidos;meta(c).responsaveis=structuredClone(invalidos);assert.equal(confirmar(c),false,'dados inválidos iguais não provam um conjunto de identidades');
 }
});
test('responsáveis: alias tipado da identidade, conjunto vazio e outras listas mantêm seus contratos',()=>{
 const c=caso();c.aliases={[pessoa(2)]:pessoa(3)};meta(c).responsaveis=[pessoa(3),pessoa(1)];assert.equal(confirmar(c),true);
 const antes={metas:[{id:id(7),responsaveis:[pessoa(1)]}]},depois={metas:[{id:id(7),responsaveis:[]}]};assert.equal(alteracoesConfirmadas(antes,depois,depois),true);
 for(const colecao of ['planos','eventos']){
  const b={[colecao]:[{id:id(7),responsaveis:[]}]},d=structuredClone(b),r=structuredClone(b);d[colecao][0].responsaveis=[pessoa(2),pessoa(1)];r[colecao][0].responsaveis=[pessoa(1),pessoa(2)];assert.equal(alteracoesConfirmadas(b,d,r),false);
 }
});
