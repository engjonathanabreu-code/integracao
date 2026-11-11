import test from 'node:test';
import assert from 'node:assert/strict';
import {definirSessao,conteudoStorage,prepararArquivos} from '../src/dados-compartilhados.js';
import {classificarFalha} from '../src/estado-sincronizacao.js';
test('recusa Storage conserva status para não repetir permissão negada como falha de rede',async()=>{
 const anterior=globalThis.fetch;definirSessao({access_token:'fixture',expires_in:3600});
 try{
  for(const status of [400,401,403,422,429,503])for(const json of [true,false]){
   globalThis.fetch=async url=>String(url).includes('/rpc/')?Response.json({}):new Response(json?JSON.stringify({error:'fixture',message:'Recusa simulada'}):'gateway',{status});
   await assert.rejects(conteudoStorage('fixture/hash',new TextEncoder().encode('fixture')),e=>{assert.equal(e.status,status);assert.equal(classificarFalha(e).categoria,status===401?'sessao':status===403?'permissao':[400,422].includes(status)?'validacao':'transitoria');return true;});
  }
  globalThis.fetch=async url=>String(url).includes('/rpc/')?Response.json({}):Response.json({error:'Duplicate'},{status:409});
  assert.equal(await conteudoStorage('fixture/hash',new TextEncoder().encode('fixture')),'fixture/hash');
  globalThis.fetch=async url=>String(url).includes('/rpc/')?Response.json({}):new Response('negado',{status:403});
  await assert.rejects(conteudoStorage('fixture/hash'),{status:403,code:'STORAGE_READ'});
 }finally{globalThis.fetch=anterior;definirSessao(null);}
});
test('anexo de meta também mantém 403 e a intenção pode ser preservada sem envio',async()=>{
 const anterior=globalThis.fetch;definirSessao({access_token:'fixture',expires_in:3600});
 globalThis.fetch=async url=>String(url).startsWith('data:')?new Response('bytes'):String(url).includes('/rpc/')?Response.json({}):Response.json({error:'AccessDenied'},{status:403});
 try{
  const before={metas:[]},after={metas:[{id:'m',arquivos:[{id:'a',chave:'local',nome:'anexo',tipo:'text/plain'}]}]};
  await assert.rejects(prepararArquivos(before,after,{get:async()=> 'data:text/plain,fixture'},{erpRef:'fixture'}),{status:403,code:'AccessDenied'});
  assert.equal(after.metas[0].arquivos[0].chave,'local');
 }finally{globalThis.fetch=anterior;definirSessao(null);}
});
