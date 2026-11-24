// C2/C3 (A2): estado de sessão, renovação única e repetição apenas de leituras.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as dados from '../src/dados-compartilhados.js';
import {buscarREST} from '../src/transporte-rest.js';

if(typeof globalThis.window==='undefined')globalThis.window=new EventTarget();
const sessao=(extra={})=>({user:{id:'fixture-a2'},access_token:'fixture-token-1',refresh_token:'fixture-refresh-1',expires_in:3600,...extra});
const comFetch=async(fn,corpo)=>{const original=globalThis.fetch;globalThis.fetch=fn;try{return await corpo();}finally{globalThis.fetch=original;dados.definirSessao(null);}};
const ouvirSessao=()=>{const eventos=[];const f=e=>eventos.push(e.detail);globalThis.window.addEventListener('integracao:sessao',f);return {eventos,parar:()=>globalThis.window.removeEventListener('integracao:sessao',f)};};

test('login online emite integracao:sessao valida; logout emite ausente',()=>{
 const o=ouvirSessao();
 try{
  dados.definirSessao(null);
  dados.definirSessao(sessao());
  assert.equal(dados.estadoSessao(),'valida');assert.equal(dados.temSessao(),true);
  dados.definirSessao(null);
  assert.equal(dados.estadoSessao(),'ausente');assert.equal(dados.temSessao(),false);
  assert.deepEqual(o.eventos.slice(-2).map(d=>d.estado),['valida','ausente']);
 }finally{o.parar();dados.definirSessao(null);}
});

test('relogin após invalidação volta a valida e libera requisições',async()=>{
 await comFetch(async()=>Response.json([{id:1}]),async()=>{
  dados.definirSessao(sessao());dados.invalidarSessao('teste');
  assert.equal(dados.estadoSessao(),'invalida');
  await assert.rejects(dados.requisicao('metas'),{code:'SESSAO_EXPIRADA',status:401});
  dados.definirSessao(sessao({access_token:'fixture-token-2'}));
  assert.equal(dados.estadoSessao(),'valida');
  assert.deepEqual(await dados.requisicao('metas'),[{id:1}]);
 });
});

test('invalidarSessao aborta requisição em voo e não envia o token em erros',async()=>{
 let sinal;
 await comFetch((url,o)=>new Promise((_,rej)=>{sinal=o.signal;o.signal.addEventListener('abort',()=>rej(o.signal.reason));}),async()=>{
  dados.definirSessao(sessao());
  const p=dados.requisicao('rpc/integracao_gravar',{method:'POST',body:'{}'}).then(()=>null,e=>e);
  await new Promise(r=>setTimeout(r,0));
  dados.invalidarSessao('teste');
  const erro=await p;
  assert.ok(sinal.aborted,'requisição em voo não foi abortada');
  assert.ok(erro instanceof Error);
  assert.ok(!JSON.stringify({m:erro.message,c:String(erro.cause?.message||'')}).includes('fixture-token'),'token apareceu no erro');
 });
});

test('401 repetido após renovação não entra em laço: invalida e lança SESSAO_EXPIRADA',async()=>{
 const n={token:0,rest:0};
 await comFetch(async url=>{
  if(String(url).includes('/auth/v1/token')){n.token++;return Response.json(sessao({access_token:'fixture-token-2'}));}
  n.rest++;return Response.json({code:'PGRST301',message:'JWT expired'},{status:401});
 },async()=>{
  dados.definirSessao(sessao());
  await assert.rejects(dados.requisicao('metas'),{code:'SESSAO_EXPIRADA',status:401});
  assert.deepEqual(n,{token:1,rest:2});
  assert.equal(dados.estadoSessao(),'invalida');assert.equal(dados.temSessao(),false);
 });
});

test('renovação com falha transitória mantém a sessão válida',async()=>{
 await comFetch(async url=>String(url).includes('/auth/')?Response.json({},{status:503}):Response.json([]),async()=>{
  dados.definirSessao(sessao({expires_in:10}));
  await assert.rejects(dados.requisicao('metas'),e=>e.status===503);
  assert.equal(dados.estadoSessao(),'valida');assert.equal(dados.temSessao(),true);
 });
});

test('RPC STABLE de leitura via POST é repetida em 500; integracao_gravar não',async()=>{
 const contagem={};
 await comFetch(async url=>{const nome=String(url).split('/rpc/')[1];contagem[nome]=(contagem[nome]||0)+1;
  return contagem[nome]===1?Response.json({message:'falha temporária'},{status:500}):Response.json({ok:true});},async()=>{
  dados.definirSessao(sessao());
  assert.deepEqual(await dados.requisicao('rpc/integracao_consultar_pedido',{method:'POST',body:'{}'}),{ok:true});
  assert.equal(contagem.integracao_consultar_pedido,2);
  await assert.rejects(dados.requisicao('rpc/integracao_gravar',{method:'POST',body:'{}'}),e=>e.status===500);
  assert.equal(contagem.integracao_gravar,1,'gravação foi repetida');
  await assert.rejects(dados.requisicao('rpc/erp_collab_directory',{method:'POST',body:'{}'}),e=>e.status===500);
  assert.equal(contagem.erp_collab_directory,1,'RPC sem volatilidade conferida foi repetida');
 });
});

test('GET limita a 3 tentativas em 503 e não espera Retry-After acima do teto',async()=>{
 const original=globalThis.fetch;let n=0;
 try{
  globalThis.fetch=async()=>{n++;return Response.json({message:'indisponível'},{status:503,headers:{'Retry-After':'0'}});};
  await assert.rejects(buscarREST('https://exemplo.test/rest/v1/metas'),/dados já exibidos foram preservados/);assert.equal(n,3);
  n=0;globalThis.fetch=async()=>{n++;return Response.json({message:'limite'},{status:429,headers:{'Retry-After':'60'}});};
  await assert.rejects(buscarREST('https://exemplo.test/rest/v1/metas'),e=>e.status===429&&e.retryAfterMs===60000);assert.equal(n,1);
 }finally{globalThis.fetch=original;}
});

test('leitura:false explícita impede repetição de GET e não chega ao fetch',async()=>{
 const original=globalThis.fetch;let n=0,opcoes;
 try{globalThis.fetch=async(u,o)=>{n++;opcoes=o;return Response.json({},{status:500});};
  await assert.rejects(buscarREST('https://exemplo.test/x',{leitura:false}));assert.equal(n,1);assert.equal('leitura' in opcoes,false);
 }finally{globalThis.fetch=original;}
});
