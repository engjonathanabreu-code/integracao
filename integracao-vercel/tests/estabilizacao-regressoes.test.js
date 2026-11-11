import test from 'node:test';
import assert from 'node:assert/strict';
import {definirSessao,requisicao,tokenTempoReal,temSessao,eq} from '../src/dados-compartilhados.js';
import {conciliarMaisRecentes} from '../src/conciliacao-automatica.js';
import {editarConciliado} from '../src/edicao-conciliada.js';
import resumo from '../api/resumo-moradores.js';
const sessao=(id,expires_in=3600)=>({user:{id},access_token:`fixture-${id}`,refresh_token:`fixture-refresh-${id}`,expires_in});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
for(const destino of ['B',null])test(`refresh de A não publica depois de ${destino?'login B':'logout'}`,async()=>{
 const original=global.fetch,barreira=deferred(),chegou=deferred();
 global.fetch=async url=>{if(String(url).includes('/auth/')){chegou.resolve();await barreira.promise;return Response.json(sessao('A'));}return Response.json([]);};
 try{definirSessao(sessao('A',-1));const antiga=requisicao('profiles').then(()=>null,e=>e);await chegou.promise;definirSessao(destino?sessao(destino):null);barreira.resolve();const erro=await antiga;assert.equal(erro?.code,'SESSAO_ALTERADA');assert.equal(temSessao(),!!destino);if(destino)assert.equal(await tokenTempoReal(),'fixture-B');}finally{definirSessao(null);global.fetch=original;}
});
test('resposta REST de conta antiga não chega ao consumidor',async()=>{
 const original=global.fetch,b=deferred(),c=deferred();global.fetch=async()=>{c.resolve();await b.promise;return Response.json([{id:'fixture-A'}]);};
 try{definirSessao(sessao('A'));const antiga=requisicao('profiles').then(()=>null,e=>e);await c.promise;definirSessao(sessao('B'));b.resolve();assert.equal((await antiga)?.code,'SESSAO_ALTERADA');}finally{definirSessao(null);global.fetch=original;}
});
test('igualdade semântica preserva null, dinheiro e ordem de arrays',()=>{
 assert.equal(eq({a:1,b:{x:2,y:3}},{b:{y:3,x:2},a:1}),true);
 assert.equal(eq(undefined,null),false);assert.equal(eq({a:null},{}),false);
 assert.equal(eq([1,2],[2,1]),false);assert.equal(eq('100.00',100),false);
});
test('escolha explícita prevalece sobre decisão automática',()=>{
 const r=conciliarMaisRecentes({valor:100},{valor:200},{valor:150},{'["valor"]':'local'});assert.equal(r.dados.valor,200);
});
test('editor não confirma intenção descartada e revalida escolha',async()=>{
 let remote={valor:150},writes=0;
 const opts={anterior:{valor:100},local:{valor:200},ler:async()=>({...remote}),gravar:async delta=>{writes++;return remote={...remote,...delta};}};
 const e=await editarConciliado(opts).then(()=>null,e=>e);assert.equal(e?.code,'PT409');assert.equal(writes,0);
 remote={valor:175};const nova=await e.resolver({'["valor"]':'local'}).then(()=>null,e=>e);assert.equal(nova?.code,'PT409');assert.equal(writes,0);
 assert.deepEqual(await nova.resolver({'["valor"]':'local'}),{valor:200});assert.equal(writes,1);
});
const res=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
for(const status of [401,403])test(`resumo preserva upstream ${status}`,async()=>{
 const original=global.fetch;global.fetch=async()=>Response.json({message:'sensitive fixture'}, {status});
 try{const r=res();await resumo({method:'POST',headers:{authorization:'Bearer fixture'},body:{contexto:{nucleos:[]}}},r);assert.equal(r.code,status);assert.ok(!JSON.stringify(r.body).includes('sensitive'));}finally{global.fetch=original;}
});
test('resumo recusa páginas vazias com total positivo',async()=>{
 const original=global.fetch;global.fetch=async()=>Response.json({clientes:[],complementos:[],total:1001});
 try{const r=res();await resumo({method:'POST',headers:{authorization:'Bearer fixture'},body:{contexto:{nucleos:[]}}},r);assert.notEqual(r.code,200);}finally{global.fetch=original;}
});
for(const status of [400,401,403,429,503])test(`refresh HTTP ${status} preserva classificação e não inicia gravação`,async()=>{
 const original=global.fetch;let chamadas=0;
 global.fetch=async url=>{chamadas++;assert.ok(String(url).includes('/auth/'));return Response.json({message:'fixture'}, {status});};
 try{definirSessao(sessao('A',-1));const falha=await requisicao('rpc/integracao_gravar',{method:'POST',body:'{}'}).then(()=>null,e=>e);assert.equal(falha.status,[400,401,403].includes(status)?401:status);assert.equal(falha.code,[400,401,403].includes(status)?'SESSAO_EXPIRADA':undefined);assert.equal(chamadas,1);assert.equal(temSessao(),true);}finally{definirSessao(null);global.fetch=original;}
});
