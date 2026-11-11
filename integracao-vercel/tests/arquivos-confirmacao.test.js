import test from 'node:test';import assert from 'node:assert/strict';
import {abrirArquivos,fecharArquivos,agendarArquivo,capturarArquivos,prepararArmazenamento,confirmarArquivos,reconhecerArquivos,arquivosPendentes} from '../src/arquivos-compartilhados.js';
import {definirSessao,projetar} from '../src/dados-compartilhados.js';import {fixture,blank} from './fixture.js';
test('recibo sem releitura do arquivo correto não limpa a fila nem o valor local',async()=>{
 const original=globalThis.fetch,data=new Map(),storage={get:async k=>data.get(k),set:async(k,v)=>data.set(k,v)};
 globalThis.fetch=async()=>Response.json({});definirSessao({access_token:'fixture',expires_in:3600});
 try{const s=projetar(fixture(),blank());await abrirArquivos(s.db.usuarios[0],s.base,storage);await agendarArquivo('integracao-prf-modelo-v4','conteúdo preservado');const item=await prepararArmazenamento(s,s.db);
  await assert.rejects(()=>confirmarArquivos(item.sent,{integracao_arquivos:[]}),{code:'LEITURA_DIVERGENTE'});assert.equal(arquivosPendentes(),true);assert.equal(Object.values(capturarArquivos())[0].value,'conteúdo preservado');
 }finally{fecharArquivos();definirSessao(null);globalThis.fetch=original;}
});
test('confirmar uma versão preserva a edição seguinte feita durante a persistência',async()=>{
 const original=globalThis.fetch,data=new Map();let segurar=false,liberar,entrou;
 const chegou=new Promise(r=>entrou=r),storage={get:async k=>data.get(k),set:async(k,v)=>{if(segurar&&k.startsWith('integracao-cache-arquivo-')){segurar=false;entrou();await new Promise(r=>liberar=r);}data.set(k,v);}};
 globalThis.fetch=async()=>Response.json({});definirSessao({access_token:'fixture',expires_in:3600});
 try{const s=projetar(fixture(),blank());await abrirArquivos(s.db.usuarios[0],s.base,storage);await agendarArquivo('integracao-prf-modelo-v4','primeira versão');const item=await prepararArmazenamento(s,s.db),op=item.operations[0];segurar=true;
  const confirmacao=confirmarArquivos(item.sent,{integracao_arquivos:[{registro_id:op.key.registro_id,dados:op.changes.dados}]});await chegou;
  const segunda=agendarArquivo('integracao-prf-modelo-v4','segunda versão');liberar();await Promise.all([confirmacao,segunda]);
  assert.equal(arquivosPendentes(),true);const fila=Object.values(capturarArquivos())[0];assert.equal(fila.value,'segunda versão');assert.deepEqual(fila.expected,op.changes.dados);
  assert.equal(JSON.parse(data.get([...data.keys()].find(k=>k.startsWith('integracao-fila-arquivos-'))))[op.key.registro_id].value,'segunda versão');
 }finally{fecharArquivos();definirSessao(null);globalThis.fetch=original;}
});
test('uma releitura divergente em lote preserva todos os arquivos',async()=>{
 const original=globalThis.fetch,data=new Map(),storage={get:async k=>data.get(k),set:async(k,v)=>data.set(k,v)};
 globalThis.fetch=async()=>Response.json({});definirSessao({access_token:'fixture',expires_in:3600});
 try{const s=projetar(fixture(),blank());await abrirArquivos(s.db.usuarios[0],s.base,storage);await agendarArquivo('integracao-prf-modelo-v4','modelo');await agendarArquivo('integracao-timbrado-v1-teste','timbrado');const item=await prepararArmazenamento(s,s.db),op=item.operations[0];
  await assert.rejects(()=>confirmarArquivos(item.sent,{integracao_arquivos:[{registro_id:op.key.registro_id,dados:op.changes.dados}]}),{code:'LEITURA_DIVERGENTE'});assert.equal(Object.keys(capturarArquivos()).length,2);
 }finally{fecharArquivos();definirSessao(null);globalThis.fetch=original;}
});
test('aceite explícito remove só a versão arquivada e invalida bytes que não são remotos',async()=>{
 const data=new Map(),storage={get:async k=>data.get(k),set:async(k,v)=>data.set(k,v)},actor={erpRef:'a'},key='integracao-prf-modelo-v4';
 try{await abrirArquivos(actor,{integracao_arquivos:[]},storage);await agendarArquivo(key,'texto original');const sent=capturarArquivos();
  await reconhecerArquivos(sent,{integracao_arquivos:[{registro_id:key,dados:{chave:key,path:'outro/hash',hash:'hash',bytes:3}}]});
  assert.equal(arquivosPendentes(),false);assert.deepEqual(JSON.parse(data.get('integracao-cache-arquivo-a-'+key)),{value:null});assert.equal(sent[key].value,'texto original');
  fecharArquivos();await abrirArquivos(actor,{integracao_arquivos:[]},storage);assert.equal(arquivosPendentes(),false);
 }finally{fecharArquivos();}
});
test('aceite de versão anterior não descarta nem rebaseia edição de arquivo mais nova',async()=>{
 const data=new Map(),storage={get:async k=>data.get(k),set:async(k,v)=>data.set(k,v)},key='integracao-prf-modelo-v4';
 try{await abrirArquivos({erpRef:'a'},{integracao_arquivos:[]},storage);await agendarArquivo(key,'primeiro');const sent=capturarArquivos();await agendarArquivo(key,'segundo');const newer=capturarArquivos();
  await reconhecerArquivos(sent,{integracao_arquivos:[{registro_id:key,dados:{hash:'concorrente'}}]});assert.deepEqual(capturarArquivos(),newer);assert.equal(newer[key].expected,null);
 }finally{fecharArquivos();}
});
test('falha de persistência no aceite mantém arquivo recuperável na fila',async()=>{
 const data=new Map();let fail=false;const storage={get:async k=>data.get(k),set:async(k,v)=>{if(fail&&k.startsWith('integracao-fila-arquivos-'))throw new DOMException('quota','QuotaExceededError');data.set(k,v);}},key='integracao-prf-modelo-v4';
 try{await abrirArquivos({erpRef:'a'},{integracao_arquivos:[]},storage);await agendarArquivo(key,'original');const sent=capturarArquivos();fail=true;
  await assert.rejects(reconhecerArquivos(sent,{integracao_arquivos:[]}),{name:'QuotaExceededError'});assert.deepEqual(capturarArquivos(),sent);
  fail=false;await reconhecerArquivos(sent,{integracao_arquivos:[]});assert.equal(arquivosPendentes(),false);
 }finally{fecharArquivos();}
});

test('evento captura só a versão alterada e reload preserva todos os arquivos separados',async()=>{
 const janela=globalThis.window,eventos=[],data=new Map(),storage={get:async k=>data.get(k),set:async(k,v)=>data.set(k,v)};
 globalThis.window={dispatchEvent:e=>eventos.push(e)};
 try{
  const actor={erpRef:'conta-arquivos'},a='integracao-foto-v4-a',b='integracao-foto-v4-b';
  await abrirArquivos(actor,{integracao_arquivos:[]},storage);
  await agendarArquivo(a,'a1');await agendarArquivo(b,'b1');await agendarArquivo(a,'a2');
  assert.deepEqual(eventos.map(e=>Object.keys(e.detail.arquivos)),[[a],[b],[a]]);
  assert.equal(eventos[0].detail.arquivos[a].value,'a1');assert.equal(eventos[2].detail.arquivos[a].value,'a2');
  assert.deepEqual(Object.keys(capturarArquivos([b,'ausente'])),[b]);
  fecharArquivos();await abrirArquivos(actor,{integracao_arquivos:[]},storage);
  assert.deepEqual(Object.keys(capturarArquivos()),[a,b]);assert.equal(capturarArquivos()[a].value,'a2');
 }finally{fecharArquivos();globalThis.window=janela;}
});
