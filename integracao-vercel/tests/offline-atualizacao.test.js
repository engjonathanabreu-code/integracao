import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function ambiente(response) {
 const handlers={},writes=[],deleted=[];
 const cache={put:(...v)=>{writes.push(v);},match:async()=>new Response('versão atual')};
 const caches={open:async()=>cache,match:async()=>undefined,keys:async()=>['outro-app','integracao-a','integracao-b','integracao-c','integracao-conexao-v2'],delete:async k=>deleted.push(k)};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self:{location:{origin:'https://teste.invalid'},clients:{claim:async()=>{}},addEventListener:(k,v)=>handlers[k]=v},caches,URL,fetch:response});
 return {handlers,writes,deleted};
}
test('atualização preserva duas versões anteriores e outros aplicativos',async()=>{
 const a=ambiente();let work;a.handlers.activate({waitUntil:p=>work=p});await work;
 assert.deepEqual(a.deleted,['integracao-a']);
});
test('resposta HTML não contamina o cache de um chunk JavaScript',async()=>{
 const a=ambiente(async()=>new Response('<html>SPA</html>',{headers:{'Content-Type':'text/html'}}));let work;
 a.handlers.fetch({request:{method:'GET',url:'https://teste.invalid/assets/old.js',mode:'cors'},respondWith:p=>work=p});await work;
 assert.equal(a.writes.length,0);
});
test('navegação offline carrega índice da versão atual',async()=>{
 const a=ambiente(async()=>{throw Error('offline');});let work;
 a.handlers.fetch({request:{method:'GET',url:'https://teste.invalid/',mode:'navigate'},respondWith:p=>work=p});
 assert.equal(await (await work).text(),'versão atual');
});
