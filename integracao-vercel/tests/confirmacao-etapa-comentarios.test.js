import test from 'node:test';
import assert from 'node:assert/strict';
import {alteracoesConfirmadas,divergenciasConfirmacao} from '../src/confirmacao-mutacoes.js';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
function caso(){
 const b=fixture(),s=projetar(b,blank()),depois=structuredClone(s.db),a=s.db.usuarios[0];
 depois.planos[0].etapas[0].comentarios.push({id:id(91),autor:a.nome,texto:'Comentário teste',data:'2026-11-18T13:00:00Z'});
 const ops=prepararEdicao(s.db,depois,s,a);
 for(const o of ops)(b[o.table]||=[]).push({...o.key,...o.changes,created_at:'2026-11-18T13:00:01.123+00:00'});
 return {antes:s.db,depois,ops,remoto:projetar(b,blank()).db};
}
const comentario=db=>db.planos[0].etapas[0].comentarios[0];
test('comentário de etapa confirma relógio do banco pelo contrato real de preparação/projeção',()=>{
 const {antes,depois,ops,remoto}=caso();assert.equal(ops.length,1);assert.equal(ops[0].table,'comentarios_plano');assert.equal(Object.hasOwn(ops[0].changes,'created_at'),false);
 assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),true);assert.deepEqual(divergenciasConfirmacao(antes,depois,remoto,{},ops),[]);
 assert.equal(comentario(depois).data,'2026-11-18T13:00:00Z');
});
test('autor, texto, identidade, ausência e data inválida continuam divergentes',()=>{
 for(const patch of [{autor:'Outra pessoa'},{texto:'Outro texto'},{id:id(92)},{data:null},{data:''},{data:'inválida'}]){
  const {antes,depois,ops,remoto}=caso();Object.assign(comentario(remoto),patch);assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),false,JSON.stringify(patch));
 }
 const {antes,depois,ops,remoto}=caso();remoto.planos[0].etapas[0].comentarios=[];assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),false);
});
test('normalização exige insert exato do mesmo plano, etapa, comentário e texto sem timestamp explícito',()=>{
 for(const change of [o=>({...o,action:'evento'}),o=>({...o,insert:false}),o=>({...o,remove:true}),o=>({...o,table:'meta_comentarios'}),o=>({...o,key:{id:id(92)}}),o=>({...o,changes:{...o.changes,plano_id:id(92)}}),o=>({...o,changes:{...o.changes,integracao_etapa_id:id(92)}}),o=>({...o,changes:{...o.changes,texto:'Outro'}}),o=>({...o,changes:{...o.changes,created_at:'2026-11-18T13:00:00Z'}})]){
  const {antes,depois,ops,remoto}=caso();assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops.map(change)),false);
 }
 const {antes,depois,remoto}=caso();assert.equal(alteracoesConfirmadas(antes,depois,remoto),false);
});
test('editar timestamp de comentário existente não é normalizado',()=>{
 const {depois,ops,remoto}=caso(),antes=structuredClone(depois);comentario(antes).data='2026-11-17T13:00:00Z';assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),false);
});
test('aliases só normalizam a mesma identidade comprovada',()=>{
 const {antes,depois,ops,remoto}=caso(),aliases={[id(91)]:id(93)};comentario(remoto).id=id(93);
 assert.equal(alteracoesConfirmadas(antes,depois,remoto,aliases,ops),true);comentario(remoto).texto='Outro';assert.equal(alteracoesConfirmadas(antes,depois,remoto,aliases,ops),false);
});
