import test from 'node:test';
import assert from 'node:assert/strict';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
import {divergenciasConfirmacao} from '../src/confirmacao-mutacoes.js';
import {complementos} from '../src/dados-compartilhados.js';
const antiga={id:'antiga',rota:{pag:'metas'},texto:'anterior'},nova={id:'nova',rota:{pag:'metas'},texto:'nova'},meta={id:'m1',titulo:'Meta'};
const antes={notificacoes:[antiga],metas:[]},depois={notificacoes:[nova],metas:[meta]},remoto={notificacoes:[antiga,nova],metas:[meta]};
test('retenção local não enfileira exclusão nem bloqueia confirmação da meta ou notificação enviada',async()=>{
 const entradas=[];
 const d=criarDiarioCompartilhado({conta:'fixture',ativo:()=>true,atualizou:()=>{},fila:{enfileirar:async p=>{entradas.push(p);return p;},listar:async()=>[],fechar:()=>{}}});
 const state={base:{integracao_complementos:[{colecao:'notificacoes',registro_id:'antiga',dados:antiga}]},bindings:[]};
 try{
  assert.equal(await d.adicionar(antes,{notificacoes:[],metas:[]}),null);
  await d.adicionar(antes,depois);
  const [entrada]=entradas;
  assert.deepEqual(entrada.intencao.edicoes.map(e=>e.id),['nova','m1']);
  assert.deepEqual(entrada.recursos,['["notificacoes","nova"]','["metas","m1"]']);
  const ops=complementos(antes,depois,state,{erpRef:'fixture'});
  assert.ok(ops.some(o=>o.key.registro_id==='nova'&&o.insert));
  assert.equal(ops.some(o=>o.key.registro_id==='antiga'),false);
  assert.deepEqual(divergenciasConfirmacao({notificacoes:[],metas:[]},depois,remoto,{},ops),[]);
  // Lote antigo que ainda guarda o corte: a remoção nunca foi enviada, então não diverge;
  // sem o payload, ou com a remoção de fato enviada, continua divergente.
  assert.deepEqual(divergenciasConfirmacao(antes,depois,remoto,{},ops),[]);
  assert.deepEqual(divergenciasConfirmacao(antes,depois,remoto,{},[]).map(x=>x.caminho),[['notificacoes','antiga']]);
  assert.deepEqual(divergenciasConfirmacao(antes,depois,remoto,{},[...ops,{table:'integracao_notificacoes',key:{colecao:'notificacoes',registro_id:'antiga'},remove:true}]).map(x=>x.caminho),[['notificacoes','antiga']]);
  const divergente={...remoto,notificacoes:[antiga,{...nova,texto:'alterada'}]};
  assert.deepEqual(divergenciasConfirmacao({notificacoes:[],metas:[]},depois,divergente,{},ops).map(x=>x.caminho),[['notificacoes','nova']]);
  await d.adicionar(antes,depois,{}, {substituirId:'historico'});
  assert.ok(entradas.at(-1).intencao.edicoes.some(e=>e.id==='antiga'));
 }finally{d.fechar();}
});
