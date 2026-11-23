import test from 'node:test';
import assert from 'node:assert/strict';
import {processarIntencao,lerIntencaoExistente} from '../src/fila-intencoes.js';
import {gravarOperacoes} from '../src/dados-compartilhados.js';
import {classificarFalha,orientacaoPendencia} from '../src/estado-sincronizacao.js';
import {pendenciaSomenteLocal} from '../src/intencoes-locais.js';

const original=()=>({modulo:'metas',preparar:true,operacoes:[],intencao:{edicoes:[{colecao:'metas',id:'meta',antes:{existe:true,valor:{id:'meta',titulo:'base'}},depois:{existe:true,valor:{id:'meta',titulo:'pretendido'}}}],arquivos:{}}});
test('preparação vazia nunca fabrica recibo pelo adaptador real sem RPC',async t=>{
 let fetches=0,envios=0,recibos=0,leituras=0,fixacoes=0,falha;
 t.mock.method(globalThis,'fetch',async()=>{fetches++;throw Error('Rede externa bloqueada no teste');});
 const item={conta:'sintetica',id:'pedido',pedido:'pedido',fase:'preparacao',estado:'pendente_local',tentativas:0,tentativasTotais:0,original:original()},snapshot=structuredClone(item.original);
 const fila={reservar:async()=>item,fixarPayload:async(_,payload)=>{fixacoes++;return {...item,payload};},registrarEnvio:async i=>i,registrarRecibo:async i=>{recibos++;return i;},confirmarLeitura:async i=>i,registrarFalha:async(_,e)=>{falha=classificarFalha(e);}};
 await assert.rejects(processarIntencao(fila,{conta:item.conta,dono:'fixture',sessaoAtual:()=>true,preparar:async()=>({operacoes:[],sent:{}}),enviar:i=>{envios++;return gravarOperacoes(i.payload,i.pedido,{});},consultarRecibo:async()=>null,reler:async()=>{leituras++;}}),{code:'INTENCAO_SEM_OPERACOES'});
 assert.deepEqual({fetches,envios,recibos,leituras,fixacoes},{fetches:0,envios:0,recibos:0,leituras:0,fixacoes:0});
 assert.equal(falha.categoria,'validacao');assert.equal(falha.status,null);assert.deepEqual(item.original,snapshot);
 assert.match(orientacaoPendencia({erro:{codigo:'INTENCAO_SEM_OPERACOES'}}),/Não há confirmação do servidor/);
});
test('payload vazio antigo com ou sem recibo não pode ser enviado ou confirmado',async()=>{
 for(const recibo of [undefined,{aliases:{}}])for(const suporte of [false,true]){
  const item={conta:'a',id:'antigo',pedido:'antigo',fase:'recibo',payload:[],recibo,original:original()};let callbacks=0;
  const fila={reservar:async()=>item,registrarEnvio:async()=>{callbacks++;return item;},registrarRecibo:async()=>{callbacks++;return item;},confirmarLeitura:async()=>{callbacks++;return item;},liberarReserva:async()=>item,registrarFalha:async()=>{}};
  const opcoes={conta:'a',dono:'fixture',id:'antigo',modo:'releitura',sessaoAtual:()=>true,consultarRecibo:async()=>{callbacks++;return recibo;},enviar:async()=>{callbacks++;},reler:async()=>{callbacks++;}};
  await assert.rejects(suporte?lerIntencaoExistente(fila,opcoes):processarIntencao(fila,opcoes),{code:'INTENCAO_SEM_OPERACOES'});assert.equal(callbacks,0);assert.equal(item.recibo,recibo);
 }
});
test('projeção histórica conhecida só pode ser dispensada antes de payload ou envio',()=>{
 const item={estado:'pendente_local',tentativas:0,original:{...original(),intencao:{arquivos:{},edicoes:[{colecao:'_contagensClientes',antes:{existe:true,valor:[]},depois:{existe:true,valor:[{total:2}]}}]}}};
 assert.equal(pendenciaSomenteLocal(item),true);
 for(const mudanca of [{payload:[]},{recibo:{aliases:{}}},{tentativas:1},{tentativasTotais:1},{enviadoEm:1},{preparado:{}},{confirmadoEm:1},{lidoEm:1},{estado:'resultado_desconhecido'}])assert.equal(pendenciaSomenteLocal({...item,...mudanca}),false);
 const negocio=structuredClone(item);negocio.original.intencao.edicoes.push(original().intencao.edicoes[0]);assert.equal(pendenciaSomenteLocal(negocio),false);
 const desconhecida=structuredClone(item);desconhecida.original.intencao.edicoes[0].colecao='_qualquerProjecao';assert.equal(pendenciaSomenteLocal(desconhecida),false);
});
