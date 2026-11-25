// SYNC-M1/M2: envio de anexos de Metas com tempo-limite e sem reenviar o que já subiu.
import test from 'node:test';
import assert from 'node:assert/strict';
import {definirSessao,prepararArquivos,invalidarSessao} from '../src/dados-compartilhados.js';
import {classificarFalha} from '../src/estado-sincronizacao.js';
import {atrasoRetentativa} from '../src/estado-sincronizacao.js';
import * as anexos from '../src/envio-anexos.js';

const entrar=()=>definirSessao({user:{id:'u'},access_token:'fixture',refresh_token:'r',expires_in:3600});
const meta=(...ids)=>({metas:[{id:'m',arquivos:ids.map(id=>({id,chave:'local-'+id,nome:id+'.txt',tipo:'text/plain'}))}]});
const storage={get:async chave=>'data:text/plain,'+chave};
async function comFetch(fn,corpo){
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>String(url).startsWith('data:')?new Response(String(url).split(',')[1]):String(url).includes('/rpc/')?Response.json({}):fn(String(url),options);
 entrar();try{return await corpo();}finally{globalThis.fetch=original;definirSessao(null);}
}

test('SYNC-M1: tempo-limite cresce com o tamanho e tem teto',()=>{
 assert.equal(anexos.tempoLimiteEnvioMs(0),60000);
 assert.equal(anexos.tempoLimiteEnvioMs(undefined),60000);
 assert.equal(anexos.tempoLimiteEnvioMs(-5),60000);
 assert.equal(anexos.tempoLimiteEnvioMs(1024*1024),60000+Math.ceil(1024*1024/50));
 const max=anexos.tempoLimiteEnvioMs(25*1024*1024);
 assert.ok(max>8*60000&&max<=10*60000,`25 MB: ${max} ms`);
 assert.equal(anexos.tempoLimiteEnvioMs(10**12),10*60000);
});

test('SYNC-M1: o envio do anexo leva sinal de tempo-limite e de sessão; estouro é falha transitória, nunca revisão',async()=>{
 let sinal;
 await comFetch(async(url,options)=>{sinal=options.signal;return Response.json({Key:'ok'});},()=>prepararArquivos({metas:[]},meta('a'),storage,{erpRef:'fixture'}));
 assert.ok(sinal instanceof AbortSignal,'o POST do Storage precisa de signal');
 // Envio que nunca responde: o sinal de sessão (mesma composição do tempo-limite) o interrompe.
 const pendente=comFetch((url,options)=>new Promise((_,rejeitar)=>{options.signal.addEventListener('abort',()=>rejeitar(options.signal.reason));setTimeout(()=>invalidarSessao('teste'),5);}),
  ()=>prepararArquivos({metas:[]},meta('b'),storage,{erpRef:'fixture'}));
 await assert.rejects(pendente);
 const estouro=new DOMException('The operation timed out.','TimeoutError');
 const falha=classificarFalha(estouro);
 assert.equal(falha.categoria,'transitoria');assert.equal(falha.status,null);
 // C1: espera crescente e limitada; nunca MAX_SAFE_INTEGER.
 assert.ok(atrasoRetentativa(20,0,()=>1)<=300000);
});
