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
  const pending=lerIndiceClientes();definirSessao(null);entrar('b');release.forEach(r=>r());await assert.rejects(pending,/sessão da busca mudou/);assert.equal(obterIndiceClientes(),null);
  global.fetch=async()=>Response.json([]);await lerIndiceClientes();assert(obterIndiceClientes());definirSessao(null);assert.equal(obterIndiceClientes(),null);await assert.rejects(lerIndiceClientes(),/Entre novamente/);
 }finally{global.fetch=original;definirSessao(null);}
});
test('failed requests can retry instead of retaining a rejected promise',async()=>{
 const original=global.fetch;entrar('a');global.fetch=async()=>{throw new Error('offline');};
 try{await assert.rejects(lerIndiceClientes(),/offline/);global.fetch=async()=>Response.json([]);assert.deepEqual(await lerIndiceClientes(),{clientes:[],complementos:[]});}
 finally{global.fetch=original;definirSessao(null);}
});

test('realtime invalidation during loading automatically refreshes and coalesces concurrent searches',async()=>{
 const original=global.fetch;const releases=[];let requests=0;entrar('a');
 global.fetch=async url=>{
  const n=++requests;
  if(n<=2)await new Promise(resolve=>releases.push(resolve));
  return Response.json(url.includes('/fin_receb_clientes?')?[{id:n<=2?'old':'valdir',nome:n<=2?'Nome anterior':'Valdir Bernardes',codigo:'ILH03_0896'}]:[]);
 };
 try{
  const first=lerIndiceClientes();assert.equal(requests,2);
  invalidarIndiceClientes();invalidarIndiceClientes();invalidarIndiceClientes();
  const second=lerIndiceClientes();assert.strictEqual(first,second,'notifications retain one in-flight job');
  releases.forEach(r=>r());
  const [a,b]=await Promise.all([first,second]);
  assert.strictEqual(a,b);assert.equal(requests,4,'one fresh reload after coalesced notifications');
  assert.equal(a.clientes[0].nome,'Valdir Bernardes');assert.strictEqual(obterIndiceClientes(),a);
 }finally{global.fetch=original;definirSessao(null);}
});
test('continuous realtime changes do not starve search or cache a superseded read',async()=>{
 const original=global.fetch;let requests=0,churn=true;entrar('a');
 global.fetch=async()=>{requests++;if(churn)invalidarIndiceClientes();return Response.json([]);};
 try{
  assert.deepEqual(await lerIndiceClientes(),{clientes:[],complementos:[]});
  assert.equal(requests,6);assert.equal(obterIndiceClientes(),null);
  churn=false;await lerIndiceClientes();assert.equal(requests,8);assert(obterIndiceClientes());
 }finally{global.fetch=original;definirSessao(null);}
});
test('completion of an old session cannot clear the new account in-flight request',async()=>{
 const original=global.fetch;const a=[],b=[];entrar('a');
 global.fetch=async(url,options)=>{
  const account=options.headers.Authorization.endsWith('a')?'a':'b';
  await new Promise(resolve=>(account==='a'?a:b).push(resolve));
  return Response.json([]);
 };
 try{
  const old=lerIndiceClientes();const rejected=assert.rejects(old,/sessão da busca mudou/);
  entrar('b');const fresh=lerIndiceClientes();a.forEach(r=>r());await rejected;
  assert.strictEqual(lerIndiceClientes(),fresh);b.forEach(r=>r());await fresh;assert(obterIndiceClientes());
 }finally{global.fetch=original;definirSessao(null);}
});
