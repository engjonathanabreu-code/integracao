import test from 'node:test';
import assert from 'node:assert/strict';
import {novaFila,CONTA} from './apoio-sync-fila.js';
import {provarPreferenciasNoServidor} from '../src/reconciliacao-preferencias.js';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
import {detalhesValidacaoLocal} from '../src/diagnostico-validacao.js';
import {classificarFalha,orientacaoPendencia} from '../src/estado-sincronizacao.js';

const uid='erp_'+CONTA, pedido='10000000-0000-4000-8000-000000000ff1';
const a={id:uid,erpRef:CONTA,tema:'claro',agendaPessoal:[]},b={...a,tema:'escuro'};
const ed={colecao:'usuarios',id:uid,antes:{existe:true,valor:a},depois:{existe:true,valor:b}};
const op={table:'integracao_usuarios',key:{colecao:'usuarios',registro_id:uid},expected:{dados:{tema:'claro',opcaoIndependente:1}},changes:{dados:{tema:'escuro',opcaoIndependente:1},updated_at:'2026-11-27T12:00:00Z'}};
const row={...op.key,referencia_tabela:'profiles',referencia_id:CONTA,dados:op.changes.dados};
const state=(...rows)=>({db:{usuarios:[b]},base:{integracao_usuarios:rows}});
const enqueue=(f,modulo='usuarios')=>f.fila.enfileirar({conta:CONTA,id:pedido,unidade:'u',modulo,base:{},preparar:true,intencao:{edicoes:[ed],arquivos:{}},operacoes:[]});
async function estacionar(f,{status=409,code='PT409',incerta=false}={}){
 const r=await f.fila.reservar(CONTA,{dono:'teste'});
 const p=await f.fila.fixarPayload(r,[op],{antes:{usuarios:[a]},depois:{usuarios:[b]},sent:{}});
 const enviado=await f.fila.registrarEnvio(p);
 await f.fila.registrarFalha(enviado,{status,code},{fase:'envio'});
 if(incerta)f.editar(pedido,x=>{x.estado='bloqueado_validacao';x.erro.rejeicaoConfirmada=false;});
 return f.ler(pedido);
}
const proibido=async()=>assert.fail('A reconciliação não pode preparar nem enviar');
const diario=(f,over={})=>criarDiarioCompartilhado({conta:CONTA,fila:f.fila,ativo:()=>true,atualizou:()=>{},carregar:async()=>state(row),
 preparar:proibido,enviar:proibido,consultarRecibo:proibido,confirmar:proibido,...over});

test('baixa só preferência igual na linha canônica da própria conta; mantém operação e original',async()=>{
 const f=novaFila();await enqueue(f);const orig=await estacionar(f);
 const prova=provarPreferenciasNoServidor(orig,[ed],state(row));
 assert.ok(prova);
 for(const r of [state(),state(row,row),state({...row,referencia_id:'outro'}),state({...row,dados:{tema:'claro'}}),state({...row,dados:{...row.dados,opcaoIndependente:2}})])
  assert.equal(provarPreferenciasNoServidor(orig,[ed],r),null);
 for(const i of [{...orig,recibo:{}},{...orig,payload:[op,op]},{...orig,payload:[{...op,insert:true}]},{...orig,payload:[{...op,remove:true}]},{...orig,payload:[{...op,action:'outra'}]},{...orig,preparado:{sent:{arquivo:{}}}}])
  assert.equal(provarPreferenciasNoServidor(i,[ed],state(row)),null);
 const d=diario(f);
 try{
  await d.executar();
  const l=f.ler(pedido);
  assert.equal(l.estado,'dispensado');assert.equal(l.decisao.tipo,'preferencias_ja_presentes_no_servidor');
  assert.equal(l.recibo,undefined);assert.equal(l.tentativasTotais,1);
  assert.deepEqual(l.original,orig.original);assert.deepEqual(l.payload,orig.payload);
  await d.executar();assert.deepEqual(f.ler(pedido),l);
 }finally{d.fechar();}
});

test('recibo encontrado retorna à leitura; ausente ou inválido não purga nem reenvia',async()=>{
 for(const [recibo,confirmar,esperado,leituras] of [
  [{aliases:{}},async()=>{},'confirmado',1],
  [{aliases:{}},async()=>{throw Object.assign(Error('leitura'),{status:409,code:'LEITURA_DIVERGENTE'});},'confirmado_aguardando_leitura',1],
  [null,proibido,'bloqueado_validacao',0],
  [{protocoloRecibo:1,pedido:'errado'},proibido,'bloqueado_validacao',0],
 ]){
  const f=novaFila();await enqueue(f);const original=await estacionar(f,{status:500,code:'P0001',incerta:true});let consultas=0,lidas=0;
  const d=diario(f,{consultarRecibo:async()=>{consultas++;return recibo;},confirmar:async()=>{lidas++;return confirmar();}});
  try{
   await d.executar();
   const r=f.ler(pedido);assert.equal(r.estado,esperado);assert.equal(r.tentativasTotais,1);
   assert.equal(lidas,leituras);assert.equal(consultas,1);
   assert.deepEqual(r.original,original.original);assert.deepEqual(r.payload,original.payload);
   if(recibo===null){await d.executar();assert.equal(consultas,1);assert.equal(f.ler(pedido).reciboReconciliacaoConsultado,true);}
  }finally{d.fechar();}
 }
});

test('23514 verdadeiro permanece parado e aponta regra comprovada, sem revelar dados da linha',async()=>{
 const f=novaFila();await enqueue(f,'processos');await estacionar(f,{status:400,code:'23514'});
 const d=diario(f);
 try { await d.executar();assert.equal(f.ler(pedido).estado,'bloqueado_validacao'); }
 finally { d.fechar(); }
 const falha=classificarFalha({code:'23514',status:400,constraint:'crm_negociacao_valida',details:'ficha cheia de dados'});
 const i={estado:'bloqueado_validacao',erro:falha,payload:[{table:'integracao_crm_cards',key:{id:pedido},changes:{cpf:'dado proibido'}}]};
 assert.deepEqual(detalhesValidacaoLocal(i),{regra:'crm_negociacao_valida',campo:'negociacao',tabela:'integracao_crm_cards',referencias:['10000000']});
 assert.doesNotMatch(JSON.stringify(falha),/dados|proibido/);
 assert.match(orientacaoPendencia(i),/forma de pagamento/);
 assert.match(orientacaoPendencia({...i,erro:{codigo:'23514'}}),/não identifica/);
 assert.equal(classificarFalha({code:'23P01',status:409}).categoria,'validacao');
 assert.equal(classificarFalha({code:'PT409',status:409}).categoria,'conflito');
});
