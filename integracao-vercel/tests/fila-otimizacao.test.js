import test from 'node:test';
import assert from 'node:assert/strict';
import {processarIntencao} from '../src/fila-intencoes.js';

test('consulta inconclusiva preserva pedido; só ausência explícita null permite reenvio',async()=>{
 for(const resposta of [undefined,false,0,'']){
  const item={id:'mesmo-pedido',pedido:'mesmo-pedido',fase:'recibo',payload:[{table:'metas'}]};let envios=0,falha;
  const fila={reservar:async()=>item,registrarEnvio:async()=>{envios++;return item;},registrarRecibo:async()=>item,confirmarLeitura:async()=>item,registrarFalha:async(_,e)=>{falha=e.code;}};
  await assert.rejects(processarIntencao(fila,{conta:'fixture',dono:'aba',sessaoAtual:()=>true,consultarRecibo:async()=>resposta,enviar:async()=>({aliases:{}}),reler:async()=>{}}),{code:'RECIBO_INCONCLUSIVO'});
  assert.equal(envios,0);assert.equal(falha,'RECIBO_INCONCLUSIVO');assert.equal(item.pedido,'mesmo-pedido');
 }
});

test('ausência confirmada retoma mesmo pedido e caminho normal dispensa consulta extra',async()=>{
 for(const fase of ['recibo','envio']){
  const payload=[{table:'metas',key:{id:'meta'}}],item={id:'mesmo-pedido',pedido:'mesmo-pedido',fase,payload};let envios=0,consultas=0,leituras=0;
  const fila={reservar:async()=>item,registrarEnvio:async()=>item,registrarRecibo:async(_,recibo)=>({...item,recibo}),confirmarLeitura:async i=>i,registrarFalha:async()=>{}};
  const final=await processarIntencao(fila,{conta:'fixture',dono:'aba',sessaoAtual:()=>true,consultarRecibo:async()=>{consultas++;return null;},enviar:async i=>{envios++;assert.equal(i.pedido,item.pedido);assert.equal(i.payload,payload);return {aliases:{}};},reler:async()=>{leituras++;}});
  assert.equal(envios,1);assert.equal(leituras,1);assert.equal(consultas,fase==='recibo'?1:0);assert.ok(final.recibo);
 }
});

test('recibo local só encerra após RPC da conta confirmar mesmo pedido e conteúdo',async()=>{
 for(const verificado of [null,undefined,{aliases:{outra:'identidade'}},{aliases:{},prova:'mesma'}]){
  const recibo={aliases:{},prova:'mesma'},item={id:'pedido',pedido:'pedido',fase:'releitura',payload:[{table:'metas'}],recibo};let envios=0,leituras=0,confirmacoes=0,consultas=0;
  const fila={reservar:async()=>item,registrarEnvio:async()=>{envios++;return item;},confirmarLeitura:async i=>{confirmacoes++;return i;},registrarFalha:async()=>{}};
  const trabalho=processarIntencao(fila,{conta:'fixture',dono:'aba',sessaoAtual:()=>true,consultarRecibo:async()=>{consultas++;return verificado;},enviar:async()=>{envios++;},reler:async()=>{leituras++;}});
  if(verificado?.prova==='mesma'){await trabalho;assert.equal(leituras,1);assert.equal(confirmacoes,1);}
  else{await assert.rejects(trabalho,{code:'RECIBO_INCONCLUSIVO'});assert.equal(leituras,0);assert.equal(confirmacoes,0);}
  assert.equal(envios,0);assert.equal(consultas,1);assert.equal(item.recibo,recibo);
 }
});
