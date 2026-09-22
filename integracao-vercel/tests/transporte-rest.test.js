import test from 'node:test';
import assert from 'node:assert/strict';
import {buscarREST} from '../src/transporte-rest.js';
test('repete uma leitura interrompida, inclusive durante o recebimento do corpo',async()=>{
 const original=globalThis.fetch;let n=0;
 try{globalThis.fetch=async()=>++n===1?{status:200,ok:true,text:async()=>{throw new DOMException('Fetch aborted','AbortError')}}:new Response('[{"id":1}]');assert.deepEqual(await buscarREST('/dados'),[{id:1}]);assert.equal(n,2);}finally{globalThis.fetch=original;}
});
test('limita tentativas e mostra orientação de conexão',async()=>{
 const original=globalThis.fetch;let n=0;try{globalThis.fetch=async()=>{n++;throw new DOMException('Fetch aborted','TimeoutError')};await assert.rejects(()=>buscarREST('/dados'),/dados já exibidos foram preservados/);assert.equal(n,2);}finally{globalThis.fetch=original;}
});
test('não repete gravação nem transforma erro de permissão em erro de rede',async()=>{
 const original=globalThis.fetch;let n=0;try{globalThis.fetch=async()=>{n++;throw new DOMException('Fetch aborted','AbortError')};await assert.rejects(()=>buscarREST('/dados',{method:'POST'}),/Verifique o registro/);assert.equal(n,1);globalThis.fetch=async()=>new Response('{"message":"Sem permissão"}',{status:403});await assert.rejects(()=>buscarREST('/dados'),e=>e.status===403&&e.message==='Sem permissão');}finally{globalThis.fetch=original;}
});
