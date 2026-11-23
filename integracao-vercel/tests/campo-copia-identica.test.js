import test from 'node:test';
import assert from 'node:assert/strict';
import {abrirArquivos,fecharArquivos,agendarArquivo,obterArquivo,arquivosPendentes,capturarArquivos,prepararArmazenamento,arquivoCampoIdentico,visualizarCopiaCampoConferida} from '../src/arquivos-compartilhados.js';
import {chaveCopiaCampo as key,provaCampoSemEscrita} from '../src/arquivos-intencoes.js';
import {processarIntencao} from '../src/fila-intencoes.js';
import {definirSessao} from '../src/dados-compartilhados.js';
import {createHash} from 'node:crypto';
const conta='fixture',id=conta+'|'+key,valor='{"ficha":"já confirmada"}';
const bytes=new TextEncoder().encode(valor),hash=createHash('sha256').update(bytes).digest('hex');
const dados={chave:key,path:conta+'/'+hash,hash,bytes:bytes.length};
const linha={colecao:'arquivos',registro_id:id,criado_por:conta,referencia_tabela:null,referencia_id:null,dados,updated_at:'2026-11-23T10:00:00Z'};
const state={base:{integracao_arquivos:[linha]},bindings:[]};
test('cópia idêntica na retomada usa leitura dos bytes, não faz upload, não escreve e preserva versão nova',async()=>{
 const fetchOriginal=globalThis.fetch,persist=new Map(),calls=[];
 const storage={get:async k=>persist.get(k),set:async(k,v)=>persist.set(k,v)};
 globalThis.fetch=async(url,o)=>{
  if(String(url).includes('/storage/')){calls.push(o.method);return new Response(bytes);}
  return Response.json(String(url).includes('rest/v1/integracao_arquivos?')?[linha]:{});
 };
 definirSessao({user:{id:conta},access_token:'fixture-only',expires_in:3600});
 try{
  await abrirArquivos({erpRef:conta},{integracao_arquivos:[]},storage);
  await agendarArquivo(key,valor);
  const capturado=capturarArquivos(),item={id:'pedido',conta,tentativasTotais:0,fase:'preparacao',original:{modulo:'arquivos',preparar:true,operacoes:[],intencao:{edicoes:[],arquivos:capturado}}};
  const a=await prepararArmazenamento(state,{},capturado),pronto={operacoes:a.operations,sent:a.sent,identicos:a.identicos};
  assert.deepEqual(calls,['GET']);
  assert.deepEqual(pronto.operacoes,[]);
  const prova=provaCampoSemEscrita(item,pronto);
  assert.deepEqual(prova,{id,version:capturado[id].version,dados});
  let dispensas=0;
  const fechar=await processarIntencao({
   reservar:async()=>item,dispensarCampoIdentico:async(i,p)=>{assert.deepEqual(provaCampoSemEscrita(i,p),prova);dispensas++;return {estado:'dispensado'};},
   fixarPayload:async()=>assert.fail('nenhum payload deve ser fixado'),
   registrarEnvio:async()=>assert.fail('nenhuma escrita deve ser registrada'),
   registrarRecibo:async()=>assert.fail('não fabrique recibo'),
  },{conta,dono:'fixture',sessaoAtual:()=>true,preparar:async()=>pronto,enviar:async()=>assert.fail('não reenviar'),reler:async()=>assert.fail('não é leitura de recibo')});
  assert.equal(dispensas,1);assert.equal(fechar.estado,'dispensado');
  visualizarCopiaCampoConferida(prova,capturado[id]);
  assert.equal(arquivosPendentes(),false);
  assert.equal(await obterArquivo(key),valor);
  await agendarArquivo(key,'versão local seguinte');
  assert.deepEqual(capturarArquivos()[id].expected,dados);
  const novo=capturarArquivos();
  await visualizarCopiaCampoConferida(prova,capturado[id]);
  assert.deepEqual(capturarArquivos(),novo);
 }finally{fecharArquivos();definirSessao(null);globalThis.fetch=fetchOriginal;}
});
test('somente linha, proprietário, referência e bytes exatos autorizam equivalência',async()=>{
 const f={key,value:valor,version:'v1',expected:null},ler=async()=>bytes.buffer;
 assert.equal(await arquivoCampoIdentico([linha],conta,id,f,dados,bytes,ler),true);
 for(const rows of [[],[linha,linha],[{...linha,criado_por:'outra'}],[{...linha,referencia_tabela:'outro'}],[{...linha,dados:{...dados,bytes:42}}]])assert.equal(await arquivoCampoIdentico(rows,conta,id,f,dados,bytes,ler),false);
 assert.equal(await arquivoCampoIdentico([linha],conta,id,f,dados,bytes,async()=>new TextEncoder().encode('diferente').buffer),false);
 assert.equal(await arquivoCampoIdentico([linha],conta,id,f,dados,bytes,async()=>{throw Error('offline')}),false);
 await assert.rejects(arquivoCampoIdentico([linha],conta,id,f,dados,bytes,async()=>{throw Object.assign(Error('sessão'),{status:401})}),{status:401});
 const item={id:'pedido',conta,tentativasTotais:0,fase:'preparacao',original:{modulo:'arquivos',preparar:true,operacoes:[],intencao:{edicoes:[],arquivos:{[id]:f}}}};
 const pronto={operacoes:[],sent:{[id]:f},identicos:{[id]:{version:f.version,dados}}};
 for(const altera of [x=>x.payload=[],x=>x.recibo={},x=>x.tentativasTotais=1,x=>x.original.substitui='antigo',x=>x.original.intencao.edicoes=[{}]]){const x=structuredClone(item);altera(x);assert.equal(provaCampoSemEscrita(x,pronto),null);}
});

test('mudança do ponteiro após conferir os bytes não conclui nem escreve',async()=>{
 const original=globalThis.fetch,calls=[];
 const storage={get:async()=>null,set:async()=>{}};
 globalThis.fetch=async(url,o)=>{
  if(String(url).includes('/storage/')){calls.push(o.method);return new Response(bytes);}
  if(!String(url).includes('rest/v1/integracao_arquivos?'))return Response.json({});
  calls.push(o.method||'GET');
  return Response.json([{...linha,updated_at:'2026-11-23T10:10:00Z'}]);
 };
 definirSessao({user:{id:conta},access_token:'fixture-only',expires_in:3600});
 try{
  await abrirArquivos({erpRef:conta},{integracao_arquivos:[]},storage);
  await agendarArquivo(key,valor);
  await assert.rejects(prepararArmazenamento(state,{},capturarArquivos()),{code:'CAMPO_COPIA_LEITURA_INCONCLUSIVA'});
  assert.deepEqual(calls,['GET','GET']);
  assert.equal(capturarArquivos()[id].value,valor);
 }finally{fecharArquivos();definirSessao(null);globalThis.fetch=original;}
});
