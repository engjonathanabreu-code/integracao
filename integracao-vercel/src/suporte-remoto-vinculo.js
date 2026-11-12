import {capturarSessao as capturarSessaoReal} from './dados-compartilhados.js';

const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const falha=()=>Object.assign(Error('Não foi possível confirmar o vínculo local deste aparelho.'),{code:'PERSISTENCIA_INDISPONIVEL'});
// Separate from queue exports, diagnostic localStorage and cached business data.
// Never regenerate/overwrite a registered identity just because reading it fails.
export async function obterVinculoSuporte(conta,{indexedDB=globalThis.indexedDB,nome='integracao-suporte-vinculo-v1',capturarSessao=capturarSessaoReal,crypto=globalThis.crypto}={}){
 const scope=capturarSessao();
 const conferir=()=>{scope.conferir();if(scope.owner!==conta||scope.signal?.aborted)throw Object.assign(Error('A sessão de suporte mudou.'),{code:'SESSAO_ALTERADA'});};
 conferir();if(!uuid(conta)||!indexedDB||!crypto?.getRandomValues||!crypto?.randomUUID)throw falha();
 let db;
 try{
  db=await new Promise((resolve,reject)=>{
   let r,encerrado=false;try{r=indexedDB.open(nome,1);}catch{return reject(falha());}
   r.onupgradeneeded=()=>{r.result.createObjectStore('vinculos',{keyPath:'conta'});};
   r.onerror=()=>{encerrado=true;reject(falha());};r.onblocked=()=>{encerrado=true;reject(falha());};r.onsuccess=()=>{if(encerrado)r.result.close();else resolve(r.result);};
  });
  db.onversionchange=()=>db.close();conferir();
  const vinculo=await new Promise((resolve,reject)=>{
   let tx,valor,causa;
   try{tx=db.transaction('vinculos','readwrite');}catch{return reject(falha());}
   tx.oncomplete=()=>resolve(valor);tx.onerror=()=>{};tx.onabort=()=>reject(causa||falha());
   try{
    const store=tx.objectStore('vinculos'),r=store.get(conta);
    r.onsuccess=()=>{
     try{
      conferir();
      if(r.result){
       const v=r.result;
       if(v.conta!==conta||!uuid(v.instalacao_id)||typeof v.prova_instalacao!=='string'||!/^[0-9a-f]{64}$/.test(v.prova_instalacao)||Object.keys(v).some(k=>!['conta','instalacao_id','prova_instalacao'].includes(k)))throw falha();
       valor={conta,instalacao_id:v.instalacao_id,prova_instalacao:v.prova_instalacao};
      }else{
       const bytes=crypto.getRandomValues(new Uint8Array(32));
       valor={conta,instalacao_id:crypto.randomUUID(),prova_instalacao:Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')};
       conferir();store.add(valor);
      }
     }catch(e){causa=e?.code==='SESSAO_ALTERADA'?e:falha();tx.abort();}
    };
   }catch(e){causa=e?.code==='SESSAO_ALTERADA'?e:falha();tx.abort();}
  });
  conferir();return Object.freeze(vinculo);
 }finally{db?.close();}
}
