// SYNC-C2: recusa de conflito no envio de uma ficha de cliente é relida (só a
// ficha, pelo escopo de SYNC-C1) e conciliada por campo uma única vez.
import test from 'node:test';
import assert from 'node:assert/strict';
import {podeConciliarRecusaAutomaticamente,requerRevisaoFila,MODULOS_CONCILIACAO_AUTOMATICA} from '../src/estado-sincronizacao.js';
import {escopoDaIntencao} from '../src/leitura-intencoes.js';
import {ambienteConciliacao} from './apoio-conciliacao-recusa.js';
import {uuid} from './apoio-sync-fila.js';

const P=uuid(301),AUD=uuid(91);
const FICHA={id:P,financeiroRef:uuid(201),etapa:1,requerente:{nome:'Pessoa Fictícia',telefone:''},endereco:{bairro:'Centro',numero:'10'},conjuge:{nome:''}};
const editar=async(a,alterar)=>{
 const antes=structuredClone(a.servidor),depois=structuredClone(a.servidor);alterar(depois.processos[0]);
 depois.auditoria=[{id:AUD,acao:'Cadastro alterado'}];
 return a.diario.adicionar(antes,depois);
};

test('SYNC-C2: fichas de cliente entram na conciliação automática',()=>{
 assert.ok(MODULOS_CONCILIACAO_AUTOMATICA.includes('processos'));
});

test('SYNC-C2: duas pessoas na mesma ficha em campos diferentes — conciliado sozinho, lendo só a ficha',async()=>{
 const a=ambienteConciliacao({colecao:'processos',registro:FICHA});
 try{
  const original=await editar(a,p=>{p.endereco.bairro='Norte';});
  a.ganchos.antesDoEnvio.push(()=>{a.atual(P).requerente.telefone='(00) 0000-0000';a.atual(P).conjuge.nome='Cônjuge Fictício';});
  await a.diario.executar();
  let itens=await a.itens();
  const recusado=itens.find(i=>i.id===original.id),novo=itens.find(i=>i.original.substitui===original.id);
  assert.equal(recusado.estado,'substituido');assert.ok(recusado.conciliacaoAutomatica);
  assert.equal(recusado.erro.codigo,'PT409');
  assert.deepEqual(a.chamadas.consultas,[original.pedido],'pedido recusado consultado antes da substituição');
  // A releitura da conciliação e o novo pedido usam o escopo da ficha (SYNC-C1), não a base inteira.
  for(const i of [recusado,novo])assert.ok(escopoDaIntencao(i.original.intencao,{}),'intenção de ficha existente tem escopo');
  // A auditoria da ação original acompanha o novo pedido (a confirmação da tela usa o mesmo id).
  assert.ok(novo.original.intencao.edicoes.some(e=>e.colecao==='auditoria'&&e.id===AUD));
  await a.diario.executar();
  itens=await a.itens();
  assert.equal(itens.find(i=>i.id===novo.id).estado,'confirmado');
  assert.deepEqual(a.atual(P),{...FICHA,requerente:{nome:'Pessoa Fictícia',telefone:'(00) 0000-0000'},endereco:{bairro:'Norte',numero:'10'},conjuge:{nome:'Cônjuge Fictício'}});
  assert.equal(a.chamadas.envios,2);
 }finally{a.diario.fechar();}
});

test('SYNC-C2: mesmo campo da ficha continua em revisão; nada é sobrescrito nem repetido',async()=>{
 const a=ambienteConciliacao({colecao:'processos',registro:FICHA});
 try{
  const original=await editar(a,p=>{p.endereco.bairro='Norte';});
  a.ganchos.antesDoEnvio.push(()=>{a.atual(P).endereco.bairro='Sul';});
  for(let n=0;n<4;n++){a.relogio.agora+=10*60*1000;await a.diario.executar();}
  const itens=await a.itens();
  assert.equal(itens.length,1);assert.equal(itens[0].id,original.id);
  assert.equal(itens[0].estado,'bloqueado_conflito');assert.ok(requerRevisaoFila(itens[0]));
  assert.equal(podeConciliarRecusaAutomaticamente(itens[0],a.relogio.agora),false);
  assert.equal(a.atual(P).endereco.bairro,'Sul');assert.equal(a.chamadas.envios,1);
 }finally{a.diario.fechar();}
});

test('SYNC-C2: uma única conciliação por ficha — segunda recusa vai para revisão',async()=>{
 const a=ambienteConciliacao({colecao:'processos',registro:FICHA});
 try{
  const original=await editar(a,p=>{p.endereco.bairro='Norte';});
  a.ganchos.antesDoEnvio.push(()=>{a.atual(P).etapa=2;},()=>{a.atual(P).etapa=3;});
  for(let n=0;n<6;n++){a.relogio.agora+=10*60*1000;await a.diario.executar();}
  const itens=await a.itens();
  assert.equal(itens.length,2);
  assert.equal(itens.find(i=>i.original.substitui===original.id).estado,'bloqueado_conflito');
  assert.equal(a.chamadas.envios,2);assert.equal(a.atual(P).endereco.bairro,'Centro');
 }finally{a.diario.fechar();}
});
