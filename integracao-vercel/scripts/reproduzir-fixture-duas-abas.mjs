import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer as reservarPorta} from 'node:net';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
// Local-only negative control and atomic simulated-backend control.
// Usage: node scripts/reproduzir-fixture-duas-abas.mjs [app-root] [output.json]
const root=resolve(process.argv[2]||fileURLToPath(new URL('../',import.meta.url)));
const output=resolve(process.argv[3]||join(root,'test-results/fixture-duas-abas.json'));
await mkdir(dirname(output),{recursive:true});
const require=createRequire(root+'/package.json'),{chromium}=require('playwright');
const {createServer}=await import(pathToFileURL(root+'/node_modules/vite/dist/node/index.js'));
const fixturePath=root+'/tests/sincronizacao-ciclo.jsx',original=await readFile(fixturePath,'utf8');
let transformed=original.replace('  const next=copy(base),aliases={};','  const next=copy(base),aliases={};\n  await window.__tmpFixture.pause(pedido,next,receipts);');
assert.notEqual(transformed,original);
transformed=transformed.replace("// Prevent sockets from reaching real services while exercising the production hook.",`// In-memory probe: serialize ONLY the simulated commit RPC before it reads state.
if(new URLSearchParams(location.search).has('tmpAtomic')){
 const commitFixture=window.fetch;
 window.fetch=(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  return url.pathname.endsWith('/rpc/integracao_gravar')
   ?navigator.locks.request('fixture-backend-rpc-atomic',()=>commitFixture(input,options))
   :commitFixture(input,options);
 };
}
// Prevent sockets from reaching real services while exercising the production hook.`);
const mount="createRoot(document.getElementById('root')).render(<Harness/>);";
assert.ok(transformed.includes(mount));
transformed=transformed.replace(mount,`// In-memory probe intentionally does not mount the application/hook.
window.__tmpFixture={ready:true,stats,saveServer,base:()=>base,receipts:()=>receipts,snapshots:[],releases:{},
 pause:async(pedido,next,receipts)=>{
  window.__tmpFixture.snapshots.push({pedido,meta:next.metas[0].titulo,plano:next.planos_trabalho[0].titulo,recibos:Object.keys(receipts).sort()});
  await new Promise(resolve=>{window.__tmpFixture.releases[pedido]=resolve;});
 }
};`);
const reserva=reservarPorta();await new Promise(r=>reserva.listen(0,'127.0.0.1',r));const port=reserva.address().port;await new Promise((r,j)=>reserva.close(e=>e?j(e):r()));
const origin='http://127.0.0.1:'+port;
const cacheDir=await mkdtemp(join(tmpdir(),'integracao-fixture-probe-'));
const server=await createServer({root,cacheDir,server:{host:'127.0.0.1',port,strictPort:true},logLevel:'error',plugins:[{name:'tmp-fixture-snapshot-probe',enforce:'pre',load(id){if(id.split('?')[0]===fixturePath)return {code:transformed,map:null};}}]});
const logs=[],pedidoA='00000000-0000-4000-8000-000000000101',pedidoB='00000000-0000-4000-8000-000000000102';
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true});
 for(const atomic of [false,true]){
  const context=await browser.newContext();
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await context.routeWebSocket(/.*/,ws=>new URL(ws.url()).host===new URL(origin).host?ws.connectToServer():ws.close());
  const a=await context.newPage(),b=await context.newPage(),url=origin+'/tests/sincronizacao-ciclo.html?diario&recibos'+(atomic?'&tmpAtomic':'');
  await a.goto(url);await a.waitForFunction(()=>window.__tmpFixture?.ready);await a.evaluate(()=>__tmpFixture.saveServer());
  await b.goto(url);await b.waitForFunction(()=>window.__tmpFixture?.ready);
  const begin=async(page,pedido,table,id,titulo)=>page.evaluate(({pedido,table,id,titulo})=>{
   const operacoes=[{table,key:{id},expected:{titulo:table==='metas'?'Meta Teste':'Plano Teste'},changes:{titulo}}];
   window.__tmpRequest=fetch('https://fixture.supabase.co/rest/v1/rpc/integracao_gravar',{method:'POST',body:JSON.stringify({operacoes,pedido})}).then(async response=>({status:response.status,recibo:await response.json()}));
  },{pedido,table,id,titulo});
  // Commit order B then A. Unlocked mode pauses both AFTER copying the same base.
  await begin(b,pedidoB,'planos_trabalho','00000000-0000-4000-8000-000000000008','Plano B independente');
  await b.waitForFunction(p=>!!__tmpFixture.releases[p],pedidoB);
  await begin(a,pedidoA,'metas','00000000-0000-4000-8000-000000000007','Meta A independente');
  let aBlockedBeforeRead=false;
  if(atomic){await a.waitForFunction(async()=>{const q=await navigator.locks.query();return q.pending.some(l=>l.name==='fixture-backend-rpc-atomic')&&q.held.some(l=>l.name==='fixture-backend-rpc-atomic');});aBlockedBeforeRead=await a.evaluate(()=>__tmpFixture.snapshots.length===0);assert.equal(aBlockedBeforeRead,true);}
  else await a.waitForFunction(p=>!!__tmpFixture.releases[p],pedidoA);
  const snapshotsBeforeBCommit={a:await a.evaluate(()=>__tmpFixture.snapshots),b:await b.evaluate(()=>__tmpFixture.snapshots)};
  await b.evaluate(p=>__tmpFixture.releases[p](),pedidoB);const responseB=await b.evaluate(()=>__tmpRequest);
  if(atomic)await a.waitForFunction(p=>!!__tmpFixture.releases[p],pedidoA);
  const snapshotA=await a.evaluate(()=>__tmpFixture.snapshots[0]);
  await a.evaluate(p=>__tmpFixture.releases[p](),pedidoA);const responseA=await a.evaluate(()=>__tmpRequest);
  const final=await a.evaluate(()=>{const s=JSON.parse(localStorage.getItem('harness-server')),r=JSON.parse(localStorage.getItem('harness-receipts'));return {meta:s.metas[0].titulo,plano:s.planos_trabalho[0].titulo,recibos:Object.keys(r).sort(),writes:Number(localStorage.getItem('harness-writes'))};});
  const bLocalReceipt=await b.evaluate(async()=>({pedido:(await __tmpRequest).recibo.pedido,reciboRecebido:!!(await __tmpRequest).recibo.resultados}));
  const log={mode:atomic?'atomic-lock-control':'unlocked-fixture',requestOrder:['B','A'],commitOrder:['B','A'],snapshotsBeforeBCommit,aBlockedBeforeRead,snapshotA,responseStatus:{b:responseB.status,a:responseA.status},bLocalReceipt,final};
  logs.push(log);console.log(JSON.stringify(log));
  assert.deepEqual(log.responseStatus,{b:200,a:200});assert.equal(final.meta,'Meta A independente');assert.equal(bLocalReceipt.pedido,pedidoB);
  if(atomic){assert.equal(final.plano,'Plano B independente');assert.deepEqual(final.recibos,[pedidoA,pedidoB]);assert.equal(snapshotA.plano,'Plano B independente');assert.equal(final.writes,2);}
  else{assert.equal(final.plano,'Plano Teste');assert.deepEqual(final.recibos,[pedidoA]);assert.equal(snapshotA.plano,'Plano Teste');assert.equal(final.writes,1);assert.equal(snapshotsBeforeBCommit.a[0].meta,snapshotsBeforeBCommit.b[0].meta);assert.equal(snapshotsBeforeBCommit.a[0].plano,snapshotsBeforeBCommit.b[0].plano);}
  await context.close();
 }
 assert.equal(await readFile(fixturePath,'utf8'),original);
 await writeFile(output,JSON.stringify({fixtureFileUnchanged:true,inMemoryViteLoadOnly:true,logs},null,2)+'\n');
 console.log(JSON.stringify({ok:true,fixtureFileUnchanged:true,inMemoryViteLoadOnly:true,log:output}));
}finally{if(browser)await browser.close();await server.close();await rm(cacheDir,{recursive:true,force:true});}
