import test from 'node:test';
import assert from 'node:assert/strict';
import {definirSessao,lerIndiceClientes,obterIndiceClientes,invalidarIndiceClientes,gravarOperacoes} from '../src/dados-compartilhados.js';
const entrar=id=>definirSessao({user:{id},access_token:id,expires_in:3600});
test('reuses completed and concurrent directory requests; refreshes after expiry and explicit invalidation',async()=>{
 const fetchOriginal=global.fetch,now=Date.now;let requests=0,time=1000000;
 global.fetch=async()=>{requests++;return Response.json([]);};Date.now=()=>time;entrar('a');
 try{
  const [a,b]=await Promise.all([lerIndiceClientes(),lerIndiceClientes()]);assert.strictEqual(a,b);assert.equal(requests,2);
  assert.strictEqual(await lerIndiceClientes(),a);assert.strictEqual(obterIndiceClientes(),a);assert.equal(requests,2);
  entrar('a');await lerIndiceClientes();assert.equal(requests,2,'token renewal preserves cache');
  time+=300001;assert.strictEqual(obterIndiceClientes(),a,'stale data immediately available during refresh');await lerIndiceClientes();assert.equal(requests,4);
  invalidarIndiceClientes();assert.equal(obterIndiceClientes(),null);await lerIndiceClientes();assert.equal(requests,6);
  await gravarOperacoes([{table:'integracao_moradores'}],'test');assert.equal(obterIndiceClientes(),null);
 }finally{global.fetch=fetchOriginal;Date.now=now;definirSessao(null);}
});
test('logout and account switch cannot repopulate the new session from an old request',async()=>{
 const original=global.fetch;let release;
 global.fetch=async()=>{await new Promise(resolve=>{release ||= [];release.push(resolve);});return Response.json([]);};entrar('a');
 try{
  const pending=lerIndiceClientes();definirSessao(null);entrar('b');release.forEach(r=>r());await assert.rejects(pending,/mudaram/);assert.equal(obterIndiceClientes(),null);
  global.fetch=async()=>Response.json([]);await lerIndiceClientes();assert(obterIndiceClientes());definirSessao(null);assert.equal(obterIndiceClientes(),null);await assert.rejects(lerIndiceClientes(),/Entre novamente/);
 }finally{global.fetch=original;definirSessao(null);}
});
test('failed requests can retry instead of retaining a rejected promise',async()=>{
 const original=global.fetch;entrar('a');global.fetch=async()=>{throw new Error('offline');};
 try{await assert.rejects(lerIndiceClientes(),/offline/);global.fetch=async()=>Response.json([]);assert.deepEqual(await lerIndiceClientes(),{clientes:[],complementos:[]});}
 finally{global.fetch=original;definirSessao(null);}
});
