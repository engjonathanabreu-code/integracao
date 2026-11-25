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

const memoriaLocal=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),m};};
test('SYNC-M2: marcador de anexo enviado vale por caminho, expira em 24 h e nunca falha por armazenamento',()=>{
 anexos.esquecerAnexosEnviados();
 const armazenamento=memoriaLocal(),t=1_000_000;
 assert.equal(anexos.anexoJaEnviado('c/m/a-1',{agora:t,armazenamento}),false);
 anexos.registrarAnexoEnviado('c/m/a-1',{agora:t,armazenamento});
 assert.equal(anexos.anexoJaEnviado('c/m/a-1',{agora:t+1,armazenamento}),true);
 assert.equal(anexos.anexoJaEnviado('c/m/a-2',{agora:t+1,armazenamento}),false,'outro conteúdo/anexo sobe normalmente');
 assert.equal(anexos.anexoJaEnviado('c/m/a-1',{agora:t+24*3600*1000,armazenamento}),false,'expirado');
 assert.equal(anexos.anexoJaEnviado('c/m/a-1',{agora:t-1,armazenamento}),false,'relógio retrocedido');
 // Persistido para outra sessão do mesmo aparelho; só caminho e horário.
 const guardado=JSON.parse(armazenamento.m.get('integracao-anexos-enviados-v1'));
 assert.deepEqual(guardado,{'c/m/a-1':t});
 anexos.esquecerAnexosEnviados({armazenamento:null});
 assert.equal(anexos.anexoJaEnviado('c/m/a-1',{agora:t+1,armazenamento}),true,'lido do armazenamento do aparelho');
 const quebrado={getItem(){throw new Error('bloqueado');},setItem(){throw new Error('cheio');},removeItem(){}};
 anexos.esquecerAnexosEnviados({armazenamento});
 assert.doesNotThrow(()=>anexos.registrarAnexoEnviado('c/m/a-3',{agora:t,armazenamento:quebrado}));
 assert.equal(anexos.anexoJaEnviado('c/m/a-3',{agora:t+1,armazenamento:quebrado}),true,'memória da sessão ainda evita o reenvio');
 assert.equal(anexos.anexoJaEnviado('',{agora:t}),false);assert.equal(anexos.anexoJaEnviado(null,{agora:t}),false);
 anexos.esquecerAnexosEnviados();
});

test('SYNC-M2: falha no segundo anexo não reenvia o primeiro na nova tentativa',async()=>{
 anexos.esquecerAnexosEnviados();
 const envios=[];let falhar=true;
 const servidor=async url=>{
  const nome=url.split('/').pop();envios.push(nome.split('-')[0]);
  if(nome.startsWith('b-')&&falhar)return Response.json({message:'indisponível'},{status:503});
  return Response.json({Key:'ok'});
 };
 const depois=meta('a','b','c');
 await comFetch(servidor,()=>assert.rejects(prepararArquivos({metas:[]},depois,storage,{erpRef:'fixture'}),{status:503}));
 assert.deepEqual(envios,['a','b'],'primeira tentativa para no anexo que falhou');
 falhar=false;envios.length=0;
 const ops=await comFetch(servidor,()=>prepararArquivos({metas:[]},depois,storage,{erpRef:'fixture'}));
 assert.deepEqual(envios,['b','c'],'o anexo que já subiu é pulado; os demais sobem');
 // A gravação continua completa: uma linha por anexo, com o mesmo caminho imutável.
 assert.deepEqual(ops.map(o=>[o.table,o.key.id,o.insert]),[['meta_arquivos','a',true],['meta_arquivos','b',true],['meta_arquivos','c',true]]);
 assert.ok(ops.every(o=>/^fixture\/metas\/m\/[abc]-[0-9a-f]{64}$/.test(o.changes.caminho_storage)));
 console.log('SYNC-M2 medição: envios de bytes na nova tentativa de 3 anexos = 3 antes, 2 depois (só os que faltavam)');
 // "Duplicate" (objeto já existente) também registra o envio.
 envios.length=0;anexos.esquecerAnexosEnviados();
 await comFetch(async url=>{envios.push(url.split('/').pop().split('-')[0]);return Response.json({error:'Duplicate'},{status:409});},()=>prepararArquivos({metas:[]},meta('a'),storage,{erpRef:'fixture'}));
 await comFetch(async url=>{envios.push('x');return Response.json({},{status:500});},()=>prepararArquivos({metas:[]},meta('a'),storage,{erpRef:'fixture'}));
 assert.deepEqual(envios,['a']);
 // Recusa definitiva não registra nada.
 anexos.esquecerAnexosEnviados();
 await comFetch(async()=>Response.json({error:'AccessDenied'},{status:403}),()=>assert.rejects(prepararArquivos({metas:[]},meta('a'),storage,{erpRef:'fixture'}),{status:403}));
 envios.length=0;
 await comFetch(async url=>{envios.push('a');return Response.json({Key:'ok'});},()=>prepararArquivos({metas:[]},meta('a'),storage,{erpRef:'fixture'}));
 assert.deepEqual(envios,['a']);
 anexos.esquecerAnexosEnviados();
});
