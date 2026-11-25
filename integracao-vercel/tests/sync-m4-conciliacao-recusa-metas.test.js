// SYNC-M4: depois de uma recusa de conflito no envio, a fila relê e junta por
// campo UMA vez; campos diferentes seguem sozinhos, o mesmo campo fica em revisão.
import test from 'node:test';
import assert from 'node:assert/strict';
import {podeConciliarRecusaAutomaticamente,requerRevisaoFila,MODULOS_CONCILIACAO_AUTOMATICA} from '../src/estado-sincronizacao.js';
import {ambienteConciliacao} from './apoio-conciliacao-recusa.js';
import {novaFila,enfileirarMeta,CONTA,uuid} from './apoio-sync-fila.js';

const M=uuid(1),META={id:M,titulo:'Título',observacoes:'Obs'};
const editar=async(a,mudanca)=>{const antes=structuredClone(a.servidor),depois=structuredClone(a.servidor);Object.assign(depois.metas[0],mudanca);return a.diario.adicionar(antes,depois);};
const vivos=xs=>xs.filter(i=>!['confirmado','substituido','dispensado'].includes(i.estado));

test('SYNC-M4: duas pessoas em campos diferentes — a recusa é conciliada sozinha e a alteração é confirmada',async()=>{
 const a=ambienteConciliacao({colecao:'metas',registro:META});
 try{
  const original=await editar(a,{titulo:'Meu título'});
  // Outra pessoa muda outro campo depois da preparação e antes do envio.
  a.ganchos.antesDoEnvio.push(()=>{a.atual(M).observacoes='Obs de outra pessoa';});
  await a.diario.executar();
  let itens=await a.itens();
  const recusado=itens.find(i=>i.id===original.id),novo=itens.find(i=>i.original.substitui===original.id);
  assert.equal(a.chamadas.recusas,1);
  assert.equal(recusado.estado,'substituido');assert.equal(recusado.substituidaPor,novo.id);
  assert.ok(recusado.conciliacaoAutomatica?.em>0,'marcador durável da única tentativa');
  // O original recusado fica preservado inteiro (payload, erro e intenção).
  assert.equal(recusado.erro.codigo,'PT409');assert.equal(recusado.payload[0].changes.titulo,'Meu título');
  assert.deepEqual(recusado.original.intencao.edicoes[0].depois.valor,{...META,titulo:'Meu título'});
  // Invariante: o pedido recusado foi consultado (null explícito) antes de qualquer novo envio.
  assert.deepEqual(a.chamadas.consultas,[original.pedido]);
  assert.equal(novo.estado,'pendente_local');assert.notEqual(novo.pedido,original.pedido);
  assert.equal(a.chamadas.envios,1,'nenhum reenvio na mesma passagem');
  await a.diario.executar();
  itens=await a.itens();
  assert.equal(itens.find(i=>i.id===novo.id).estado,'confirmado','recibo + releitura do novo pedido');
  assert.deepEqual(a.atual(M),{id:M,titulo:'Meu título',observacoes:'Obs de outra pessoa'},'os dois campos preservados');
  assert.equal(a.chamadas.envios,2);assert.equal(vivos(itens).length,0);
 }finally{a.diario.fechar();}
});

test('SYNC-M4: mesmo campo alterado pelas duas pessoas continua em revisão manual, sem nova tentativa',async()=>{
 const a=ambienteConciliacao({colecao:'metas',registro:META});
 try{
  const original=await editar(a,{titulo:'Meu título'});
  a.ganchos.antesDoEnvio.push(()=>{a.atual(M).titulo='Título de outra pessoa';});
  await a.diario.executar();
  const leituras=a.chamadas.leituras;
  for(let n=0;n<3;n++){a.relogio.agora+=10*60*1000;await a.diario.executar();}
  const itens=await a.itens();
  assert.equal(itens.length,1,'nenhum pedido novo foi criado');
  const item=itens[0];
  assert.equal(item.id,original.id);assert.equal(item.estado,'bloqueado_conflito');assert.ok(requerRevisaoFila(item));
  assert.ok(item.conciliacaoAutomatica);
  assert.equal(a.chamadas.envios,1);assert.equal(a.chamadas.leituras,leituras,'sem releituras repetidas');
  assert.deepEqual(a.chamadas.consultas,[original.pedido]);
  assert.equal(a.atual(M).titulo,'Título de outra pessoa','nada foi sobrescrito');
 }finally{a.diario.fechar();}
});

test('SYNC-M4: limite de UMA conciliação automática — a substituição recusada de novo vai para revisão',async()=>{
 const a=ambienteConciliacao({colecao:'metas',registro:META});
 try{
  const original=await editar(a,{titulo:'Meu título'});
  a.ganchos.antesDoEnvio.push(()=>{a.atual(M).observacoes='Obs 2';},()=>{a.atual(M).observacoes='Obs 3';});
  for(let n=0;n<6;n++){a.relogio.agora+=10*60*1000;await a.diario.executar();}
  const itens=await a.itens();
  assert.equal(itens.length,2,'exatamente uma substituição automática');
  const novo=itens.find(i=>i.original.substitui===original.id);
  assert.equal(novo.estado,'bloqueado_conflito');assert.ok(requerRevisaoFila(novo));
  assert.equal(podeConciliarRecusaAutomaticamente(novo,a.relogio.agora),false);
  assert.equal(a.chamadas.envios,2,'um envio original + um da única conciliação');
  assert.equal(a.atual(M).titulo,'Título');
 }finally{a.diario.fechar();}
});

test('SYNC-M4: recibo encontrado, consulta inconclusiva ou falha de leitura deixam o item em revisão e consomem a tentativa',async()=>{
 for(const consultar of [async()=>({aliases:{}}),async()=>{throw Object.assign(new TypeError('fetch failed'),{});},async()=>undefined]){
  const a=ambienteConciliacao({colecao:'metas',registro:META});
  try{
   const original=await editar(a,{titulo:'Meu título'});
   a.ganchos.antesDoEnvio.push(()=>{a.atual(M).observacoes='Obs 2';});
   let primeira=true;a.ganchos.consultar=item=>{if(primeira){primeira=false;return consultar(item);}return null;};
   for(let n=0;n<3;n++){a.relogio.agora+=10*60*1000;await a.diario.executar();}
   const itens=await a.itens();
   assert.equal(itens.length,1);assert.equal(itens[0].id,original.id);
   assert.equal(itens[0].estado,'bloqueado_conflito');assert.ok(itens[0].conciliacaoAutomatica);
   assert.equal(a.chamadas.envios,1);
  }finally{a.diario.fechar();}
 }
});

test('SYNC-M4: a regra só vale para recusa comprovada no envio, sem recibo, sem anexos e nos módulos listados',async()=>{
 const {fila,ler,editar:alterar,relogio}=novaFila();
 const item=await enfileirarMeta(fila);
 const recusa={estado:'bloqueado_conflito',payload:[{table:'metas',key:{id:uuid(1)},changes:{titulo:'Depois'}}],enviadoEm:1,erro:{status:409,codigo:'PT409',categoria:'conflito',rejeicaoConfirmada:true,fase:'envio'}};
 alterar(item.id,i=>Object.assign(i,recusa));
 const base=ler(item.id),t=relogio.agora;
 assert.deepEqual(MODULOS_CONCILIACAO_AUTOMATICA.includes('metas'),true);
 assert.equal(podeConciliarRecusaAutomaticamente(base,t),true);
 const sem=(mudanca,motivo)=>{const i=structuredClone(base);mudanca(i);assert.equal(podeConciliarRecusaAutomaticamente(i,t),false,motivo);};
 sem(i=>{i.erro.fase='preparacao';},'conflito achado na preparação já é conflito de campo');
 sem(i=>{i.erro.rejeicaoConfirmada=false;},'sem recusa comprovada');
 sem(i=>{i.erro.codigo='P0001';i.erro.categoria='validacao';i.estado='bloqueado_validacao';},'validação');
 sem(i=>{i.estado='resultado_desconhecido';},'resultado desconhecido passa pela consulta de pedido');
 sem(i=>{i.recibo={aliases:{}};},'com recibo');
 sem(i=>{i.leaseAte=t+1000;},'reservado por outra aba');
 sem(i=>{i.conciliacaoAutomatica={em:1};},'já tentada');
 sem(i=>{i.original.substitui='outro';},'já é uma substituição');
 sem(i=>{i.original.intencao.arquivos={x:{version:'1'}};},'com arquivo');
 sem(i=>{i.original.intencao.edicoes[0].depois.valor.arquivos=[{id:'novo'}];},'anexo novo na meta');
 sem(i=>{i.original.intencao.edicoes[0].colecao='eventos';},'módulo fora da lista');
 sem(i=>{i.original.intencao.edicoes.push({colecao:'nucleos',id:'n',antes:{existe:false},depois:{existe:true,valor:{id:'n'}}});},'mistura com módulo fora da lista');
 sem(i=>{i.payload=null;},'sem payload');
 // O marcador é gravado uma vez, em transação; a segunda chamada não devolve o item.
 const marcado=await fila.marcarConciliacaoAutomatica(CONTA,item.id);
 assert.ok(marcado.conciliacaoAutomatica.em>0);assert.equal(marcado.estado,'bloqueado_conflito');
 assert.equal(marcado.erro.codigo,'PT409');assert.deepEqual(marcado.payload,recusa.payload);
 assert.equal(await fila.marcarConciliacaoAutomatica(CONTA,item.id),null);
 assert.equal(await fila.marcarConciliacaoAutomatica(CONTA,'inexistente'),null);
 await fila.fechar();
});
