// Reprodução C1 (linha `sessao`) e C2 (dono da correção: A2; fila: A1).
import test from 'node:test';
import assert from 'node:assert/strict';
import {processarIntencao} from '../src/fila-intencoes.js';
import {requerRevisaoFila} from '../src/estado-sincronizacao.js';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
import * as dados from '../src/dados-compartilhados.js';
import {CONTA,uuid,novaFila,enfileirarMeta,erroCom} from './apoio-sync-fila.js';

if(typeof globalThis.window==='undefined')globalThis.window=new EventTarget();
const MAX=Number.MAX_SAFE_INTEGER;
const USUARIO=uuid(900);
const semRede=()=>{throw new Error('callback de rede não esperado neste teste');};
const entrar=(extra={})=>dados.definirSessao({user:{id:USUARIO},access_token:'token-1',refresh_token:'refresh-1',expires_in:3600,...extra});
const comFetch=async(fn,corpo)=>{const original=globalThis.fetch;globalThis.fetch=fn;try{return await corpo();}finally{globalThis.fetch=original;dados.definirSessao(null);}};
const autorizacao=o=>new Headers(o?.headers||{}).get('Authorization')||o?.headers?.Authorization;

test('C1/C2: 401 SESSAO_EXPIRADA na preparação não bloqueia o item (estado e falhas inalterados)',async()=>{
 const {fila,ler}=novaFila();
 const item=await enfileirarMeta(fila);const antes=ler(item.id);
 try{await processarIntencao(fila,{conta:CONTA,dono:'consumidor-teste',sessaoAtual:()=>true,consultarRecibo:semRede,enviar:semRede,reler:semRede,
  preparar:async()=>{throw erroCom('JWT expired',{status:401,code:'SESSAO_EXPIRADA'});}});}catch{}
 const depois=ler(item.id);
 assert.equal(depois.estado,antes.estado,`sessão expirada mudou o estado para ${depois.estado}`);
 assert.equal(depois.falhas||0,antes.falhas||0,'sessão expirada contou como falha');
 assert.notEqual(depois.proximaTentativa,MAX,'sessão expirada agendou MAX_SAFE_INTEGER');
 assert.equal(requerRevisaoFila(depois),false,'sessão expirada passou a exigir revisão');
 await fila.fechar();
});

test('C1/C2: erro de sessão aborta a passagem de executar sem preparar outros itens',async()=>{
 const {fila}=novaFila();
 await enfileirarMeta(fila,{metaId:uuid(1)});await enfileirarMeta(fila,{metaId:uuid(2)});
 let leituras=0;
 const diario=criarDiarioCompartilhado({conta:CONTA,ativo:()=>true,
  carregar:async()=>{leituras++;throw erroCom('JWT expired',{status:401,code:'SESSAO_EXPIRADA'});},
  preparar:semRede,enviar:semRede,consultarRecibo:semRede,confirmar:semRede,atualizou:()=>{},fila});
 try{
  try{await diario.executar();}catch{}
  assert.equal(leituras,1,`a passagem continuou e reservou outro item após erro de sessão (${leituras} preparações)`);
 }finally{diario.fechar();}
});

test('C2: requisicao renova UMA vez após 401 "JWT expired" do servidor e repete com sucesso',async()=>{
 const chamadas={token:0,rest:0};
 await comFetch(async(url,o)=>{
  if(String(url).includes('/auth/v1/token')){chamadas.token++;return Response.json({user:{id:USUARIO},access_token:'token-2',refresh_token:'refresh-2',expires_in:3600});}
  chamadas.rest++;
  if(autorizacao(o)==='Bearer token-2')return Response.json([{id:'ok'}]);
  return Response.json({code:'PGRST301',message:'JWT expired'},{status:401});
 },async()=>{
  entrar();
  let resultado,erro;
  try{resultado=await dados.requisicao('metas?select=*');}catch(e){erro=e;}
  assert.equal(erro,undefined,`requisicao lançou ${erro?.status} ${erro?.code} ${erro?.message} em vez de renovar e repetir`);
  assert.deepEqual(resultado,[{id:'ok'}]);
  assert.equal(chamadas.token,1,'deveria renovar exatamente uma vez');
  assert.equal(chamadas.rest,2,'deveria repetir a requisição uma vez');
 });
});

test('C2: renovação recusada com 400 invalida a sessão, temSessao()=false e emite integracao:sessao',async()=>{
 const eventos=[];const ouvir=e=>eventos.push(e.detail);
 globalThis.window.addEventListener('integracao:sessao',ouvir);
 try{
  await comFetch(async url=>{
   if(String(url).includes('/auth/v1/token'))return Response.json({error:'invalid_grant'},{status:400});
   return Response.json([]);
  },async()=>{
   entrar({expires_in:30});
   await assert.rejects(dados.requisicao('metas?select=*'),{code:'SESSAO_EXPIRADA'});
   assert.equal(typeof dados.estadoSessao,'function','C2 ausente: estadoSessao não é exportada');
   assert.equal(dados.estadoSessao(),'invalida');
   assert.equal(dados.temSessao(),false,'temSessao continua true com a sessão invalidada');
   assert.ok(eventos.some(d=>d?.estado==='invalida'),`evento integracao:sessao {estado:'invalida'} não emitido: ${JSON.stringify(eventos)}`);
  });
 }finally{globalThis.window.removeEventListener('integracao:sessao',ouvir);}
});

test('C2: expiração usa margem de 120 s (renova token que expira em 100 s)',async()=>{
 let renovou=0;
 await comFetch(async url=>{
  if(String(url).includes('/auth/v1/token')){renovou++;return Response.json({user:{id:USUARIO},access_token:'token-2',refresh_token:'refresh-2',expires_in:3600});}
  return Response.json([]);
 },async()=>{
  entrar({expires_in:100});
  await dados.requisicao('metas?select=*');
  assert.equal(renovou,1,'token com 100 s restantes não foi renovado antes do uso');
 });
});

test('C2: com sessão inválida a fila não reserva itens',async()=>{
 const {fila,ler}=novaFila();
 const item=await enfileirarMeta(fila);
 dados.definirSessao(null);
 let preparou=0,resultado;
 try{resultado=await processarIntencao(fila,{conta:CONTA,dono:'consumidor-teste',sessaoAtual:()=>true,estadoSessao:()=>'invalida',
  consultarRecibo:semRede,enviar:semRede,reler:semRede,preparar:async()=>{preparou++;throw erroCom('JWT expired',{status:401,code:'SESSAO_EXPIRADA'});}});}catch{}
 assert.equal(preparou,0,'a fila reservou e preparou um item com a sessão inválida');
 assert.ok(!resultado,'nenhum item deveria ser processado');
 const atual=ler(item.id);
 assert.equal(atual.estado,'pendente_local');assert.equal(atual.leaseAte,undefined,'item ficou reservado');
 await fila.fechar();
});
