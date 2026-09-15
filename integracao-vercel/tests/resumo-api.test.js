import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/resumo-moradores.js';
const response=()=>({headers:{},code:0,body:null,setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
test('summary API rejects unauthenticated and unsupported requests before fetching',async()=>{for(const req of [{method:'POST',headers:{}},{method:'GET',headers:{authorization:'Bearer fake'}}]){const res=response();await handler(req,res);assert([401,405].includes(res.code));assert.equal(res.headers['Cache-Control'],'private, no-store');}});
test('summary API forwards only caller credentials and fetches every page',async()=>{
 const old=global.fetch,seen=[];global.fetch=async(url,o)=>{seen.push({auth:o.headers.Authorization,...JSON.parse(o.body)});return Response.json({clientes:[],complementos:[],total:1001});};
 try{const res=response();await handler({method:'POST',headers:{authorization:'Bearer caller-fixture'},body:{contexto:{nucleos:[]}}},res);assert.equal(res.code,200);assert.deepEqual(res.body,{resumo:[]});assert.deepEqual(seen.map(p=>p.inicio).sort((a,b)=>a-b),[0,500,1000]);assert(seen.every(p=>p.auth==='Bearer caller-fixture'&&p.resumo===true));}finally{global.fetch=old;}
});
test('summary API reports upstream failure without returning an empty successful dashboard',async()=>{const old=global.fetch;global.fetch=async()=>Response.json({message:'private detail'}, {status:500});try{const res=response();await handler({method:'POST',headers:{authorization:'Bearer caller-fixture'},body:{contexto:{nucleos:[]}}},res);assert.equal(res.code,503);assert(!JSON.stringify(res.body).includes('private detail'));}finally{global.fetch=old;}});
