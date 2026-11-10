import test from 'node:test';import assert from 'node:assert/strict';
import {abrirArquivos,fecharArquivos,obterArquivo} from '../src/arquivos-compartilhados.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const key='integracao-doc-offline-v1-fixture';
test('abertura de arquivos A atrasada não substitui contexto B',async()=>{
 const b=deferred();const storage={get:async k=>k==='integracao-fila-arquivos-A'?b.promise:k==='integracao-fila-arquivos-B'?JSON.stringify({['B|'+key]:{key,value:'fixture-B'}}):null};
 const a=abrirArquivos({erpRef:'A'},{},storage).then(()=>null,e=>e);
 fecharArquivos();await abrirArquivos({erpRef:'B'},{},storage);b.resolve('{}');
 assert.equal((await a)?.code,'SESSAO_ALTERADA');assert.equal(await obterArquivo(key),'fixture-B');fecharArquivos();
});
test('arquivo de A lido depois de logout não é entregue na conta B',async()=>{
 const b=deferred(),chegou=deferred();const storage={get:async k=>{if(k.includes('cache-arquivo-A')){chegou.resolve();return b.promise;}return null;}};
 await abrirArquivos({erpRef:'A'},{},storage);const a=obterArquivo(key).then(()=>null,e=>e);await chegou.promise;
 fecharArquivos();await abrirArquivos({erpRef:'B'},{},storage);b.resolve(JSON.stringify({value:'fixture-A'}));
 assert.equal((await a)?.code,'SESSAO_ALTERADA');fecharArquivos();
});
