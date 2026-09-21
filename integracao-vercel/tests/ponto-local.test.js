import test from 'node:test';import assert from 'node:assert/strict';
import {lerPontoLocal,gravarPontoLocal,enfileirarPonto,enviarFilaPonto,visaoPontoLocal} from '../src/ponto-local.js';
const inicial=()=>({estado:{jornada:{vinculo:'CLT'},hoje:{dia:'2026-09-21',batidas:[]}},fila:[]});
test('fila durável, isolada por conta, alternância, mudança de dia e bloqueio de clique duplicado',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
 let r=enfileirarPonto(inicial(),{agora:'2026-09-21T11:00:00Z',pedido:'a',offline:true});gravarPontoLocal('u',r,storage);r=lerPontoLocal('u',storage);assert.equal(r.fila.length,1);assert.equal(lerPontoLocal('outro',storage).fila.length,0);
 assert.throws(()=>enfileirarPonto(r,{agora:'2026-09-21T11:00:15Z'}),/30 segundos/);
 r=enfileirarPonto(r,{agora:'2026-09-21T15:00:00Z',pedido:'b'});assert.equal(r.fila[1].tipo,'saida');assert.equal(visaoPontoLocal(r,'2026-09-22T11:00:00Z').proximo,'entrada');
 assert.throws(()=>gravarPontoLocal('u',r,{setItem(){throw Error('QuotaExceeded');}}),/Quota/);
});
test('falha após recebimento mantém mesmo pedido; confirmação parcial não perde restante',async()=>{
 let r=enfileirarPonto(inicial(),{agora:'2026-09-21T11:00:00Z',pedido:'a'});r=enfileirarPonto(r,{agora:'2026-09-21T15:00:00Z',pedido:'b'});let salvo=r;const recebidos=new Map();
 const enviar=async b=>{recebidos.set(b.pedido,b);if(b.pedido==='b')throw Error('Sem rede');return {id:b.pedido,ocorrido_em:b.ocorrido_em};};
 await assert.rejects(()=>enviarFilaPonto(r,enviar,x=>{salvo=x;}),/Sem rede/);assert.deepEqual(salvo.fila.map(b=>b.pedido),['b']);
 salvo=await enviarFilaPonto(salvo,async b=>{recebidos.set(b.pedido,b);return{id:b.pedido,ocorrido_em:b.ocorrido_em};},()=>{});assert.equal(salvo.fila.length,0);assert.equal(recebidos.size,2);assert.equal(salvo.estado.hoje.batidas.length,2);
});
