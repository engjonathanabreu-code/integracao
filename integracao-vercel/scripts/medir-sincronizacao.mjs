import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
// Local fixtures only. No production credentials or external network are used.
// Usage: node scripts/medir-sincronizacao.mjs [app-root] [output.json]
const root=resolve(process.argv[2]||fileURLToPath(new URL('../',import.meta.url)));
const output=resolve(process.argv[3]||'test-results/desempenho-sincronizacao.json');
await mkdir(dirname(output),{recursive:true});
const {createServer}=await import(root+'/node_modules/vite/dist/node/index.js');
const server=await createServer({root,server:{host:'127.0.0.1',port:0},logLevel:'error'});
await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
process.env.BROWSER_TEST_ORIGIN=origin;
const require=createRequire(root+'/package.json');
const {chromium}=require(root+'/scripts/browser-isolado.cjs');
let browser;const result={synthetic:true,samples:20,delayMs:15,unrelatedReadDelayMs:80,flows:{}};
try{
 browser=await chromium.launch({headless:true});result.nodeVersion=process.version;result.browserVersion=await browser.version();
 for(const flow of ['metas','calendario','campo']){
  const context=await browser.newContext(),page=await context.newPage();
  await page.goto(origin+'/tests/sincronizacao-ciclo.html?cenario=fantasma&diario&recibos');
  await page.waitForFunction(()=>window.syncHarness?.ready&&!syncHarness.sync.pendencias.length);
  await page.evaluate(async()=>{
   const h=syncHarness;
   h.base().erp_agendas=[{id:'00000000-0000-4000-8000-000000000040',nome:'Agenda sintética',cor:'#123456'}];
   h.base().erp_eventos=[{id:'00000000-0000-4000-8000-000000000041',titulo:'Evento sintético',descricao:'',agenda_id:'00000000-0000-4000-8000-000000000040',inicio:'2026-11-23T13:00:00Z',fim:'2026-11-23T14:00:00Z',participantes:['00000000-0000-4000-8000-000000000001'],created_by:'00000000-0000-4000-8000-000000000001',status:'ativo',publico:false,cor:'#123456'}];h.salvarServidor();
   await h.sync.refresh({force:true,manual:true});
   const fetchFixture=window.fetch,objects=new Map();window.measure=[];
   window.fetch=async(input,opts={})=>{
    const path=new URL(typeof input==='string'?input:input.url,location.href).pathname,start=performance.now();
    await new Promise(r=>setTimeout(r,path.endsWith('/erp_mensagens')?80:15));
    let response;
    if(path.includes('/storage/v1/object/')){
     const key=path.split('/integracao/')[1];
     if(opts.method==='POST'){objects.set(key,new TextDecoder().decode(opts.body));response=new Response('{}');}
     else response=new Response(objects.get(key)||'',{status:objects.has(key)?200:404});
    }else response=await fetchFixture(input,opts);
    measure.push({path,start,end:performance.now(),status:response.status});return response;
   };
  });
  const samples=[];
  for(let n=0;n<20;n++){
   const one=await page.evaluate(async({flow,n})=>{
    measure.length=0;const start=performance.now(),before=syncHarness.stats.writes;
    if(flow==='campo'){
     const {agendarArquivo}=await import('/src/arquivos-compartilhados.js');
     await agendarArquivo('integracao-campo-offline-v1',JSON.stringify({fixture:true,version:n}));
     await new Promise((resolve,reject)=>{const limit=setTimeout(()=>reject(Error('Campo pendente')),15000);const wait=setInterval(()=>{if(syncHarness.stats.writes>before&&!syncHarness.sync.pendencias.length){clearTimeout(limit);clearInterval(wait);resolve();}},10);});
    }else await syncHarness.sync.mutateConfirmed(d=>{if(flow==='metas')d.metas[0].titulo='Meta sintética '+n;else d.eventos[0].titulo='Evento sintético '+n;return d;},{id:crypto.randomUUID(),acao:'Benchmark sintético'});
    const end=performance.now();await new Promise(r=>setTimeout(r,25));const requests=[...measure],write=requests.find(r=>r.path.endsWith('/rpc/integracao_gravar'));
    const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js'),f=abrirFilaIntencoes();let items;try{items=await f.listar('00000000-0000-4000-8000-000000000001');}finally{await f.fechar();}
    const last=items.at(-1),first=requests.length?Math.min(...requests.map(r=>r.start)):null;
    const uploadMs=requests.filter(r=>r.path.includes('/storage/v1/object/')&&!r.path.includes('/authenticated/')).reduce((sum,r)=>sum+r.end-r.start,0);
    return {ms:end-start,waitMs:first===null?null:first-start,preparationMs:write&&first!==null?write.start-first-uploadMs:null,uploadMs,waitAndPreparationMs:write?write.start-start:null,writeMs:write?write.end-write.start:null,readbackMs:write?end-write.end:null,queueAgeMs:last?.lidoEm-last?.criadoEm,requests:requests.length,receiptLookups:requests.filter(r=>r.path.endsWith('/rpc/integracao_consultar_pedido')).length,writes:syncHarness.stats.writes-before,pending:syncHarness.sync.pendencias.length,falseWarnings:syncHarness.sync.pendencias.filter(i=>i.recibo).length};
   },{flow,n});
   if(one.writes!==1||one.receiptLookups!==0||one.pending||one.falseWarnings)throw Error('A fixture normal não concluiu com uma única escrita e nenhuma pendência: '+JSON.stringify(one));
   samples.push(one);
  }
  const pct=(key,p)=>{const a=samples.map(s=>s[key]).sort((a,b)=>a-b);return Math.round(a[Math.ceil(a.length*p)-1]*10)/10;};
  result.flows[flow]={p50Ms:pct('ms',.5),p95Ms:pct('ms',.95),queueAgeP95Ms:pct('queueAgeMs',.95),waitP95Ms:pct('waitMs',.95),preparationP95Ms:pct('preparationMs',.95),uploadP95Ms:pct('uploadMs',.95),preparationAndWaitP95Ms:pct('waitAndPreparationMs',.95),writeP95Ms:pct('writeMs',.95),readbackP95Ms:pct('readbackMs',.95),requests:samples.map(s=>s.requests),pending:Math.max(...samples.map(s=>s.pending)),falseWarnings:Math.max(...samples.map(s=>s.falseWarnings)),samples};
  console.log(flow,JSON.stringify({...result.flows[flow],samples:undefined}));await context.close();
 }
 await writeFile(output,JSON.stringify(result,null,2));
}finally{await browser?.close();await server.close();}
