import test from 'node:test';
import assert from 'node:assert/strict';
import {alteracoesConfirmadas,divergenciasConfirmacao} from '../src/confirmacao-mutacoes.js';
const fixture=()=>{
 const antes={ordensServico:[{id:'os',comentarios:[]}]};
 const depois={ordensServico:[{id:'os',comentarios:[{id:'cm',autor:'Ana',texto:'Vistoria concluída',data:'2026-11-18T13:00:00.000Z'}]}]};
 const remoto=structuredClone(depois);remoto.ordensServico[0].comentarios[0].data='2026-11-18T13:00:01.123+00:00';
 const ops=[{table:'ordem_servico_comentarios',key:{id:'cm'},insert:true,changes:{ordem_servico_id:'os',autor_id:'u',texto:'Vistoria concluída'}}];
 return {antes,depois,remoto,ops};
};
test('comentário de OS confirma timestamp gerado apenas para insert comprovado',()=>{
 const {antes,depois,remoto,ops}=fixture();
 assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),true);
 assert.deepEqual(divergenciasConfirmacao(antes,depois,remoto,{},ops),[]);
 assert.equal(depois.ordensServico[0].comentarios[0].data,'2026-11-18T13:00:00.000Z');
});
test('autor, texto, identidade, ausência e data inválida continuam divergentes',()=>{
 for(const patch of [{autor:'Outra pessoa'},{texto:'Outro texto'},{id:'outro'},{data:null},{data:''},{data:'inválida'}]){
  const {antes,depois,remoto,ops}=fixture();Object.assign(remoto.ordensServico[0].comentarios[0],patch);
  assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),false,JSON.stringify(patch));
 }
 const {antes,depois,remoto,ops}=fixture();remoto.ordensServico[0].comentarios=[];
 assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),false);
});
test('não amplia contrato sem insert, para outro pai ou timestamp explicitamente enviado',()=>{
 for(const change of [o=>({...o,action:'evento'}),o=>({...o,insert:false}),o=>({...o,remove:true}),o=>({...o,table:'meta_comentarios'}),o=>({...o,key:{id:'outro'}}),o=>({...o,changes:{...o.changes,ordem_servico_id:'outra'}}),o=>({...o,changes:{...o.changes,texto:'outro'}}),o=>({...o,changes:{...o.changes,created_at:'2026-11-18T13:00:00Z'}})]){
  const {antes,depois,remoto,ops}=fixture();assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops.map(change)),false);
 }
 const {antes,depois,remoto}=fixture();assert.equal(alteracoesConfirmadas(antes,depois,remoto),false);
});
test('edição de timestamp de comentário existente não é normalizada',()=>{
 const {depois,remoto,ops}=fixture();const antes=structuredClone(depois);antes.ordensServico[0].comentarios[0].data='2026-11-17T13:00:00Z';
 assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),false);
});
test('preparação e projeção reais de OS usam created_at do servidor',async()=>{
 const {fixture,blank,id}=await import('./fixture.js');
 const {projetar,prepararEdicao}=await import('../src/dados-compartilhados.js');
 const b=fixture();b.ordens_servico=[{id:id(90),nome:'OS teste',created_at:'2026-11-17T00:00:00Z'}];
 const state=projetar(b,blank()),depois=structuredClone(state.db),autor=state.db.usuarios[0];
 depois.ordensServico[0].comentarios.push({id:id(91),autor:autor.nome,texto:'Comentário de teste',data:'2026-11-18T13:00:00Z'});
 const ops=prepararEdicao(state.db,depois,state,autor),op=ops.find(o=>o.table==='ordem_servico_comentarios');
 assert.ok(op?.insert);assert.equal(Object.hasOwn(op.changes,'created_at'),false);
 for(const o of ops)(b[o.table]||=[]).push({...o.key,...o.changes,created_at:'2026-11-18T13:00:01.123Z'});
 const remoto=projetar(b,blank()).db;
 assert.equal(alteracoesConfirmadas(state.db,depois,remoto,{},ops),true);
 b.ordem_servico_comentarios[0].texto='Alteração concorrente';
 assert.equal(alteracoesConfirmadas(state.db,depois,projetar(b,blank()).db,{},ops),false);
});
