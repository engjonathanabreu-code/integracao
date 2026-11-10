import test from 'node:test';import assert from 'node:assert/strict';
import {abrirArquivos,fecharArquivos,agendarArquivo,capturarArquivos,prepararArmazenamento,confirmarArquivos,arquivosPendentes} from '../src/arquivos-compartilhados.js';
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
