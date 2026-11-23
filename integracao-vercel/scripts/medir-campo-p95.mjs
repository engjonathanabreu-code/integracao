import {createRequire} from 'node:module';
import {writeFile,mkdir,readFile,readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createServer as reservarPorta} from 'node:net';
import {createHash} from 'node:crypto';
import {observarConfirmacaoCampo} from './observador-campo.js';
import {pluginMedicaoCampo} from './plugin-medicao-campo.mjs';
import {compararCampo,resumoCampo} from './estatistica-campo.js';

// Deliberately fixed before collection: no stopping after a favorable percentile.
// Usage: node scripts/medir-campo-p95.mjs BASE_APP PR_APP OUTPUT.json [ORIGINAL_PR_APP] [--no-poll]
const args=process.argv.slice(2),[baseArg,prArg,outArg,oldArg]=args.filter(a=>!a.startsWith('--'));
if(!baseArg||!prArg||!outArg)throw Error('Informe base isolada, aplicação do PR e arquivo de saída.');
const roots={base:resolve(baseArg),pr:resolve(prArg),...(oldArg?{original:resolve(oldArg)}:{})},output=resolve(outArg);
const require=createRequire(join(roots.pr,'package.json'));
const {createServer}=await import(pathToFileURL(join(roots.pr,'node_modules/vite/dist/node/index.js')));
const {chromium}=require('playwright');
const ordem=oldArg?Array.from({length:6},(_,i)=>{
 const v=['base','original','pr'],rot=[...v.slice(i%3),...v.slice(0,i%3)];return [...rot,...[...rot].reverse()];
}).flat():['base','pr','pr','base','pr','base','base','pr','base','pr','pr','base','pr','base','base','pr'];
const result={schema:2,synthetic:true,complete:false,nodeVersion:process.version,uiEndpoint:'react_layout_commit',durableEndpoint:'idb_complete_dispatch',
 config:{ordem,warmupsPorRodada:3,amostrasPorRodada:oldArg?20:30,amostrasPorVersao:240,delayMs:15,unrelatedReadDelayMs:80,pollMs:args.includes('--no-poll')?null:10},rounds:[]};
await mkdir(dirname(output),{recursive:true});
async function fingerprint(root){
 const paths=(await readdir(join(root,'src'),{recursive:true})).filter(p=>/\.(js|jsx)$/.test(p)).map(p=>'src/'+p);
 paths.push('tests/fixture.js','tests/sincronizacao-ciclo.jsx');const hash=createHash('sha256');
 for(const p of paths.sort()){hash.update(p+'\0');hash.update(await readFile(join(root,p)));}
 return hash.digest('hex');
}
result.sourceDigests=Object.fromEntries(await Promise.all(Object.entries(roots).map(async([k,r])=>[k,await fingerprint(r)])));
const medirHash=createHash('sha256');for(const p of [fileURLToPath(import.meta.url),...['observador-campo.js','estatistica-campo.js','plugin-medicao-campo.mjs'].map(p=>fileURLToPath(new URL(p,import.meta.url)))])medirHash.update(await readFile(p));
result.measurementDigest=medirHash.digest('hex');
const salvar=()=>writeFile(output,JSON.stringify(result,null,2)+'\n');
const servers={};let browser;
try{
 for(const [version,root] of Object.entries(roots)){
  const reserva=reservarPorta();await new Promise(r=>reserva.listen(0,'127.0.0.1',r));const port=reserva.address().port;
  await new Promise((r,j)=>reserva.close(e=>e?j(e):r()));
  const server=await createServer({root,plugins:[pluginMedicaoCampo()],cacheDir:join(dirname(output),'.vite-campo-'+version),server:{host:'127.0.0.1',port,strictPort:true},logLevel:'error'});
  await server.listen();servers[version]={server,origin:'http://127.0.0.1:'+port};
 }
 browser=await chromium.launch({headless:true});result.browserVersion=await browser.version();
 for(const [index,versao] of ordem.entries()){
  const {origin}=servers[versao],context=await browser.newContext(),page=await context.newPage();
  const round={index,bloco:Math.floor(index/(oldArg?6:4)),versao,warmups:[],samples:[]};result.rounds.push(round);
  try{
   await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
   await context.routeWebSocket(/.*/,ws=>{if(new URL(ws.url()).host===new URL(origin).host)ws.connectToServer();else ws.close();});
   await page.goto(origin+'/tests/sincronizacao-ciclo.html?cenario=fantasma&diario&recibos');
   await page.waitForFunction(()=>window.syncHarness?.ready&&!syncHarness.sync.pendencias.length);
   await page.evaluate(source=>{window.observarCampo=eval('('+source+')');},observarConfirmacaoCampo.toString());
   await page.evaluate(async()=>{
    window.agendarCampo=(await import('/src/arquivos-compartilhados.js')).agendarArquivo;
    window.abrirFilaMedicao=(await import('/src/fila-intencoes.js')).abrirFilaIntencoes;
    const h=syncHarness;
    h.base().erp_agendas=[{id:'00000000-0000-4000-8000-000000000040',nome:'Agenda sintética',cor:'#123456'}];
    h.base().erp_eventos=[{id:'00000000-0000-4000-8000-000000000041',titulo:'Evento sintético',descricao:'',agenda_id:'00000000-0000-4000-8000-000000000040',inicio:'2026-11-23T13:00:00Z',fim:'2026-11-23T14:00:00Z',participantes:['00000000-0000-4000-8000-000000000001'],created_by:'00000000-0000-4000-8000-000000000001',status:'ativo',publico:false,cor:'#123456'}];h.salvarServidor();
    await h.sync.refresh({force:true,manual:true});
    const original=window.fetch,objects=new Map();window.measure=[];
    window.fetch=async(input,options={})=>{
     const path=new URL(typeof input==='string'?input:input.url,location.href).pathname,start=performance.now();
     await new Promise(r=>setTimeout(r,path.endsWith('/erp_mensagens')?80:15));let response;
     if(path.includes('/storage/v1/object/')){
      const key=path.split('/integracao/')[1];
      if(options.method==='POST'){objects.set(key,new TextDecoder().decode(options.body));response=new Response('{}');}
      else response=new Response(objects.get(key)||'',{status:objects.has(key)?200:404});
     }else response=await original(input,options);
     measure.push({path,start,end:performance.now(),status:response.status});return response;
    };
   });
   for(let n=-result.config.warmupsPorRodada;n<result.config.amostrasPorRodada;n++){
    const one=await page.evaluate(async({n,pollMs})=>{
     const conta='00000000-0000-4000-8000-000000000001',valor=JSON.stringify({fixture:true,version:n}),before=syncHarness.stats.writes;
     measure.length=0;let transactions=0;const txOriginal=IDBDatabase.prototype.transaction;
     IDBDatabase.prototype.transaction=function(stores,...args){if([stores].flat().includes('intencoes'))transactions++;return txOriginal.call(this,stores,...args);};
     const obs=observarCampo({conta,valor,pollMs});obs.conclusao.catch(()=>{});
     try{
      const start=obs.iniciar();await agendarCampo('integracao-campo-offline-v1',valor);obs.iniciarPolling();
      const signals=await obs.conclusao,txCount=transactions;IDBDatabase.prototype.transaction=txOriginal;
      // Keep the same unmeasured settling interval for both versions.
      await new Promise(r=>setTimeout(r,25));
      const f=abrirFilaMedicao();let row;try{row=(await f.listar(conta)).find(i=>i.id===signals.confirmacao.id);}finally{await f.fechar();}
      const write=measure.find(r=>r.path.endsWith('/rpc/integracao_gravar'));
      const lastRead=Math.max(...measure.filter(r=>r.start>write.end).map(r=>r.end));
      const lookups=measure.filter(r=>r.path.endsWith('/rpc/integracao_consultar_pedido')).length;
      const valid=row?.estado==='confirmado'&&row.pedido===signals.confirmacao.pedido&&row.recibo?.pedido===row.pedido&&
       row.original.intencao.arquivos[conta+'|integracao-campo-offline-v1']?.value===valor&&
       syncHarness.stats.writes-before===1&&lookups===0&&!syncHarness.sync.pendencias.length&&measure.length===95;
      if(!valid)throw Object.assign(Error('Efeito, pedido, fila ou carga inesperados'),{code:'AMOSTRA_INVALIDA'});
      const {confirmacao,...tempos}=signals;
      return {status:'ok',n,...tempos,queueAgeMs:row.lidoEm-row.criadoEm,requests:measure.length,writes:1,receiptLookups:lookups,pending:0,
       identidadeVerificada:true,transactions:txCount,networkAfterWriteMs:lastRead-write.end,durableAfterReadMs:start+signals.durableMs-lastRead};
     }catch(e){obs.cancelar();return {status:'error',n,code:e.code||e.name};}
     finally{IDBDatabase.prototype.transaction=txOriginal;}
    },{n,pollMs:result.config.pollMs});
    (n<0?round.warmups:round.samples).push(one);
    if(one.status!=='ok')throw Error('Falha/censura registrada na rodada '+index+': '+one.code);
   }
   console.log(JSON.stringify({round:index,versao,durable:resumoCampo(round.samples,'durableMs'),ui:resumoCampo(round.samples,'uiMs'),...(result.config.pollMs===null?{}:{polling:resumoCampo(round.samples,'legacyPollingMs')})}));
  }finally{await context.close();await salvar();}
 }
 for(const [v,r] of Object.entries(roots))if(await fingerprint(r)!==result.sourceDigests[v])throw Error('Fontes alteradas durante a coleta: '+v);
 result.sourcesStable=true;
 if(oldArg){
  const comparar=(a,b)=>compararCampo(result.rounds.filter(r=>[a,b].includes(r.versao)).map(r=>({...r,versao:r.versao===a?'base':'pr'})));
  result.analysis={originalVsBase:comparar('base','original'),optimizedVsBase:comparar('base','pr'),optimizedVsOriginal:comparar('original','pr')};
 }else result.analysis=compararCampo(result.rounds);
 result.complete=true;await salvar();
}finally{
 await browser?.close();for(const {server} of Object.values(servers))await server.close();await salvar();
}
