const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});let casos=0;try{
 const contexto=await browser.newContext(),a=await contexto.newPage(),b=await contexto.newPage();
 for(const p of [a,b])await p.goto('http://127.0.0.1:5178/tests/suporte-remoto-vinculo.html');
 const obter=async(p,conta=1)=>p.evaluate(async n=>{
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),{obterVinculoSuporte}=await import('/src/suporte-remoto-vinculo.js');
  const controller=new AbortController(),capturarSessao=()=>({owner:id(n),signal:controller.signal,conferir:()=>{}});
  const v=await obterVinculoSuporte(id(n),{capturarSessao});
  const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v.prova_instalacao));
  return {id:v.instalacao_id,hash:Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,'0')).join(''),localStorageNaoContemProva:!JSON.stringify(localStorage).includes(v.prova_instalacao)};
 },conta);
 const [x,y]=await Promise.all([obter(a),obter(b)]);
 assert.equal(x.id===y.id,true);assert.equal(x.hash===y.hash,true);assert.equal(x.localStorageNaoContemProva&&y.localStorageNaoContemProva,true);casos++;
 await a.reload();const recarregado=await obter(a);assert.equal(recarregado.id===x.id&&recarregado.hash===x.hash,true);casos++;
 const outraConta=await obter(a,2);assert.equal(outraConta.id!==x.id&&outraConta.hash!==x.hash,true);casos++;
 const contextoB=await browser.newContext(),c=await contextoB.newPage();await c.goto('http://127.0.0.1:5178/tests/suporte-remoto-vinculo.html');
 const outroNavegador=await obter(c);assert.equal(outroNavegador.id!==x.id&&outroNavegador.hash!==x.hash,true);casos++;
 const quota=await a.evaluate(async()=>{
  const {obterVinculoSuporte}=await import('/src/suporte-remoto-vinculo.js'),conta='00000000-0000-4000-8000-000000000003',capturarSessao=()=>({owner:conta,signal:new AbortController().signal,conferir:()=>{}});
  const add=IDBObjectStore.prototype.add;let codigo;
  IDBObjectStore.prototype.add=function(...args){if(this.name==='vinculos')throw new DOMException('fixture privada','QuotaExceededError');return add.apply(this,args);};
  try{await obterVinculoSuporte(conta,{capturarSessao});}catch(e){codigo=e.code;}finally{IDBObjectStore.prototype.add=add;}
  const n=await new Promise((resolve,reject)=>{const r=indexedDB.open('integracao-suporte-vinculo-v1',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('vinculos'),q=tx.objectStore('vinculos').get(conta);q.onsuccess=()=>resolve(q.result?1:0);tx.oncomplete=()=>db.close();};});
  const ok=await obterVinculoSuporte(conta,{capturarSessao});return {codigo,gravacoesParciais:n,recuperou:!!ok.instalacao_id};
 });assert.deepEqual(quota,{codigo:'PERSISTENCIA_INDISPONIVEL',gravacoesParciais:0,recuperou:true});casos++;
 const sessao=await a.evaluate(async()=>{
  const {obterVinculoSuporte}=await import('/src/suporte-remoto-vinculo.js'),conta='00000000-0000-4000-8000-000000000004';
  let verificacoes=0;
  try{await obterVinculoSuporte(conta,{capturarSessao:()=>({owner:conta,signal:new AbortController().signal,conferir:()=>{if(++verificacoes>1)throw Object.assign(Error('sessão privada'),{code:'SESSAO_ALTERADA'});}})});}catch(e){return e.code;}
 });assert.equal(sessao,'SESSAO_ALTERADA');casos++;
 await a.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('integracao-suporte-vinculo-v1');r.onsuccess=()=>resolve();r.onerror=()=>reject(Error('Não foi possível simular a perda no perfil de teste.'));}));
 const depoisDaPerda=await obter(a);assert.equal(depoisDaPerda.id!==x.id&&depoisDaPerda.hash!==x.hash,true,'perda do armazenamento cria identidade nova, sem reassociar a antiga');casos++;
 await contexto.close();await contextoB.close();console.log(JSON.stringify({ok:true,casos,indexedDBReal:true,duasAbas:true,duasContas:true,doisNavegadores:true,semFallbackVolatil:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
