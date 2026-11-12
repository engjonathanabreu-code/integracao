import {spawn} from 'node:child_process';
import {readdir,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {createServer} from 'vite';
import {createServer as criarReservaPorta} from 'node:net';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.env.BROWSER_TEST_OUTPUT||join(root,'test-results/browser'));
const sync=/^(diario-|fila-|sincronizacao-|concorrencia-global|atualizacao-pendente|tempo-real|modulo-sessao|carteira-incremental|ponto-offline)/;
const names=(await readdir(join(root,'tests'))).filter(n=>n.endsWith('.browser.cjs')&&(!process.argv.includes('--sync')||sync.test(n))).sort();
if(!names.length)throw Error('Nenhum teste de navegador selecionado.');
await mkdir(output,{recursive:true});
// Vite treats port:0 as its default 5173. Ask the OS for a free port so parallel
// isolated checkouts do not collide with another developer's running server.
const reserva=criarReservaPorta();
await new Promise((resolve,reject)=>{reserva.once('error',reject);reserva.listen(0,'127.0.0.1',resolve);});
const porta=reserva.address().port;
await new Promise((resolve,reject)=>reserva.close(e=>e?reject(e):resolve()));
const server=await createServer({root,server:{host:'127.0.0.1',port:porta,strictPort:true},logLevel:'error'});
const results=[];
try{
 await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 const env={...process.env,PLAYWRIGHT_MODULE:join(root,'scripts/browser-isolado.cjs'),BROWSER_TEST_ORIGIN:origin,BROWSER_TEST_OUTPUT:output,TEST_ORIGIN:origin,TEST_URL:origin,BASE_URL:origin};
 let index=0;
 async function worker(){while(index<names.length){const name=names[index++],start=Date.now();let log='';
  const status=await new Promise(resolve=>{
   const child=spawn(process.execPath,[join(root,'tests',name)],{cwd:root,env,stdio:['ignore','pipe','pipe']});let timedOut=false;
   const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},180000);
   child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
   child.on('error',e=>{log+=e.stack;});child.on('close',code=>{clearTimeout(timer);resolve(timedOut?'timeout':code);});
  });
  await writeFile(join(output,name+'.log'),log);results.push({test:name,status,ms:Date.now()-start});console.log(`${status===0?'PASS':'FAIL'} ${name}`);if(status!==0)console.error(log.slice(-5000));
 }}
 await Promise.all([worker(),worker()]);
}finally{await server.close();await writeFile(join(output,'results.json'),JSON.stringify(results,null,2));}
const failures=results.filter(r=>r.status!==0);console.log(`${results.length-failures.length}/${names.length} jornadas passaram. Evidências: ${output}`);if(failures.length||results.length!==names.length)process.exitCode=1;
