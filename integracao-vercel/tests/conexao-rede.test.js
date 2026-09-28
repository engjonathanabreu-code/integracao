import test from 'node:test';
import assert from 'node:assert/strict';
import {criarMonitorConexao} from '../src/conexao-rede.js';
import handler from '../api/conexao.js';
test('false offline hint recovers on server response; bounded probe deduplicates',async()=>{
 let finish,calls=0;const changes=[],nav={onLine:false},target=new EventTarget();
 const m=criarMonitorConexao({navegador:nav,alvo:target,buscar:async(url,options)=>{calls++;assert.equal(url,'/api/conexao');assert.equal(options.cache,'no-store');await new Promise(r=>finish=r);return {status:204};},agendar:()=>1,cancelar:()=>{}});
 const stop=m.observar(x=>changes.push(x));const p=m.verificar();target.dispatchEvent(new Event('focus'));
 assert.equal(calls,1);finish();await p;assert.equal(m.disponivel(),true);assert.deepEqual(changes,[false,true]);stop();
});
test('real network failure stays offline, then recovers; HTTP failure is not no internet',async()=>{
 let failure=true;const nav={onLine:false};
 const m=criarMonitorConexao({navegador:nav,buscar:async()=>{if(failure)throw new TypeError('network');return {status:503};}});
 assert.equal(await m.verificar(),false);failure=false;assert.equal(await m.verificar(),true);
 failure=true;nav.onLine=true;assert.equal(await m.verificar(),true);
});
test('reachability endpoint is uncached and reads no business data',()=>{
 const headers={};let status;
 const res={setHeader:(k,v)=>headers[k]=v,status:n=>{status=n;return res;},end:()=>{}};
 handler({method:'GET'},res);assert.equal(status,204);assert.match(headers['Cache-Control'],/no-store/);
 handler({method:'POST'},res);assert.equal(status,405);
});
