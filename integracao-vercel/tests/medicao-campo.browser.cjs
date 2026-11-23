const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext();
 await context.route('**/tests/medicao-campo.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><p id="status">Pendente</p>'}));
 const page=await context.newPage();await page.goto('http://127.0.0.1:5178/tests/medicao-campo.html');
 const result=await page.evaluate(async()=>{
  const {observarConfirmacaoCampo}=await import('/scripts/observador-campo.js');
  const original=IDBObjectStore.prototype.put;
  window.syncHarness={stats:{writes:0},sync:{pendencias:[{id:'target'}],status:'Pendente'}};
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('medicao-campo',1);r.onupgradeneeded=()=>r.result.createObjectStore('intencoes',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const row=(id,valor)=>({id,conta:'fixture',pedido:id,checksum:'sintetico',estado:'confirmado',recibo:{pedido:id},payload:[{table:'integracao_arquivos'}],original:{intencao:{arquivos:{f:{value:valor}}}}});
  const gravar=(item,abortar=false)=>new Promise(resolve=>{const tx=db.transaction('intencoes','readwrite');tx.oncomplete=()=>resolve('complete');tx.onabort=()=>resolve('abort');tx.objectStore('intencoes').put(item);if(abortar)tx.abort();});
  const observer=observarConfirmacaoCampo({conta:'fixture',valor:'target-value'});let terminou=false;
  observer.conclusao.then(()=>terminou=true);observer.iniciar();observer.iniciarPolling();window.dispatchEvent(new CustomEvent('medicao:campo-commit',{detail:{pendencias:['target'],gravacoes:0}}));
  await gravar(row('unrelated','other-value'));
  const abortado=await gravar(row('aborted','target-value'),true);
  await new Promise(r=>setTimeout(r,25));const encerrouSemCommit=terminou;
  await gravar(row('target','target-value'));
  syncHarness.stats.writes=1;syncHarness.sync.pendencias=[];syncHarness.sync.status='Confirmado';document.getElementById('status').textContent='Confirmado';window.dispatchEvent(new CustomEvent('medicao:campo-commit',{detail:{pendencias:[],gravacoes:1}}));
  const sample=await observer.conclusao,restaurado=IDBObjectStore.prototype.put===original;
  const timeout=observarConfirmacaoCampo({conta:'fixture',valor:'missing',timeoutMs:25});timeout.iniciar();timeout.iniciarPolling();let code;
  try{await timeout.conclusao;}catch(e){code=e.code;}
  const timeoutRestaurado=IDBObjectStore.prototype.put===original;
  syncHarness.sync.pendencias=[{id:'no-poll'}];
  const semPolling=observarConfirmacaoCampo({conta:'fixture',valor:'no-poll-value',pollMs:null});let terminouSemPolling=false;
  semPolling.conclusao.then(()=>terminouSemPolling=true);semPolling.iniciar();
  const intervaloOriginal=window.setInterval;window.setInterval=()=>{throw Error('Polling desativado não pode criar timer');};
  try{semPolling.iniciarPolling();}finally{window.setInterval=intervaloOriginal;}
  window.dispatchEvent(new CustomEvent('medicao:campo-commit',{detail:{pendencias:['no-poll'],gravacoes:1}}));
  await gravar(row('no-poll','no-poll-value'));syncHarness.stats.writes=2;syncHarness.sync.pendencias=[];
  window.dispatchEvent(new CustomEvent('medicao:campo-commit',{detail:{pendencias:[],gravacoes:1}}));
  await Promise.resolve();const encerrouComCommitAntigo=terminouSemPolling;
  window.dispatchEvent(new CustomEvent('medicao:campo-commit',{detail:{pendencias:[],gravacoes:2}}));
  const semPollingSample=await semPolling.conclusao;db.close();
  return {abortado,encerrouSemCommit,sample,restaurado,code,timeoutRestaurado,encerrouComCommitAntigo,semPollingSample};
 });
 assert.equal(result.abortado,'abort');assert.equal(result.encerrouSemCommit,false);
 assert.equal(result.sample.confirmacao.id,'target');assert.ok(result.sample.durableMs>=0);assert.ok(result.sample.uiMs>=result.sample.durableMs);
 assert.ok(result.sample.legacyPollingMs>=result.sample.durableMs);assert.equal(result.restaurado,true);
 assert.equal(result.code,'CONFIRMACAO_TIMEOUT');assert.equal(result.timeoutRestaurado,true);
 assert.equal(result.encerrouComCommitAntigo,false);assert.equal(result.semPollingSample.legacyPollingMs,null);assert.equal(result.semPollingSample.confirmacao.id,'no-poll');
 console.log(JSON.stringify({ok:true,ignoraOutroPedido:true,abortNaoConfirma:true,commitDuravelCorrelacionado:true,domSeparado:true,pollingPareado:true,cleanupNoTimeout:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
