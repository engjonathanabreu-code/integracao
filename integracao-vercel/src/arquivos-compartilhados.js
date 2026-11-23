import {chaveCopiaCampo,divergenciasArquivos} from './arquivos-intencoes.js';
import {copy,eq,temSessao,conteudoStorage,requisicao} from './dados-compartilhados.js';

let context=null,geracao=0;
const recognized=/^integracao-(prf-modelo-(v4$|mun-v1-)|foto-v4-|timbrado-v1-|kml-v1-|campo-offline-v1$|comercial-offline-v1$|doc-offline-v1-|devolutiva-v1-)/;
const privateKey=k=>/^integracao-(campo-offline|comercial-offline|doc-offline)/.test(k);
const queueKey=owner=>`integracao-fila-arquivos-${owner}`;
const cacheKey=(owner,key)=>`integracao-cache-arquivo-${owner}-${key}`;
const recordId=(owner,key)=>privateKey(key)?`${owner}|${key}`:key;
const conferirContexto=c=>{if(context!==c)throw Object.assign(new Error('Sessão de arquivos alterada.'),{code:'SESSAO_ALTERADA'});};
const notify=(id,item)=>{const evento=new Event('integracao:arquivo-pendente');evento.detail={arquivos:{[id]:copy(item)}};globalThis.window?.dispatchEvent(evento);};
const serializar=(c,fn)=>{const job=(c.corrente||Promise.resolve()).catch(()=>{}).then(fn);c.corrente=job;return job;};
export async function abrirArquivos(actor,base,storage) {
  const owner=actor.erpRef,gen=++geracao;
  if(context?.owner===owner){context.rows=base.integracao_arquivos||[];return;}
  const queue=JSON.parse(await storage.get(queueKey(owner))||'{}');
  if(gen!==geracao)throw Object.assign(new Error('Sessão de arquivos alterada.'),{code:'SESSAO_ALTERADA'});
  context={owner,rows:base.integracao_arquivos||[],queue,storage,copiasConferidas:new Map()};
}
export function fecharArquivos(){geracao++;context=null;}
const copiaConferida=(c,id,arquivo)=>!!arquivo&&c.copiasConferidas.get(id)?.version===arquivo.version&&c.copiasConferidas.get(id)?.value===arquivo.value;
export const arquivosPendentes=()=>!!context&&Object.entries(context.queue).some(([id,a])=>!copiaConferida(context,id,a));
export async function agendarArquivo(key,value) {
  const c=context;if(!c||!recognized.test(key))return;
  return serializar(c,async()=>{
  const id=recordId(c.owner,key),row=c.rows.find(r=>r.registro_id===id);
  const prior=c.queue[id];
  if(prior && prior.value===value)return;
  const esperado=copiaConferida(c,id,prior)?c.copiasConferidas.get(id).dados:prior?prior.expected:row?.dados||null;
  c.queue[id]={key,value,version:crypto.randomUUID(),expected:copy(esperado)};
  await c.storage.set(cacheKey(c.owner,key),JSON.stringify({value}));
  await c.storage.set(queueKey(c.owner),JSON.stringify(c.queue));if(context===c)notify(id,c.queue[id]);
  });
}
export async function obterArquivo(key) {
  const c=context;if(!c||!recognized.test(key))return undefined;
  const id=recordId(c.owner,key),queued=c.queue[id];if(queued)return queued.value;
  const row=c.rows.find(r=>r.registro_id===id);
  const cached=JSON.parse(await c.storage.get(cacheKey(c.owner,key))||'null');conferirContexto(c);
  if(row) {
    if(cached?.path===row.dados.path)return cached.value;
    if(!temSessao()||globalThis.navigator?.onLine===false){if(cached)return cached.value;throw new Error('Conecte-se para baixar este arquivo neste aparelho.');}
    const value=await conteudoStorage(row.dados.path);conferirContexto(c);
    await c.storage.set(cacheKey(c.owner,key),JSON.stringify({path:row.dados.path,value}));conferirContexto(c);return value;
  }
  if(cached)return cached.path?null:cached.value;
  // A previous account's private field package must never become this user's draft.
  if(privateKey(key)) {
    const legacyOwner=await c.storage.get('integracao-dono-base-local');conferirContexto(c);
    if(legacyOwner && legacyOwner!==c.owner)return null;
  }
  return undefined;
}
function referencia(key,state,after) {
  if(/^integracao-(prf-modelo|timbrado)/.test(key))return {referencia_tabela:'integracao_config',referencia_id:null};
  if(privateKey(key))return {referencia_tabela:null,referencia_id:null};
  const nucleus=key.startsWith('integracao-kml-v1-')?key.slice('integracao-kml-v1-'.length):null;
  const contains=v=>v && typeof v==='object' && Object.values(v).some(x=>x===key||contains(x));
  for(const collection of ['nucleos','processos','metas','planos','ordensServico']) {
    const entity=(after[collection]||[]).find(x=>collection==='nucleos'&&x.id===nucleus||contains(x));
    if(!entity)continue;
    const b=state.bindings.find(x=>!x.parent&&x.collection===collection&&x.id===entity.id);
    if(b)return {referencia_tabela:b.table,referencia_id:b.row.id};
  }
  return {referencia_tabela:null,referencia_id:null};
}
export const capturarArquivos=(ids=null)=>context?copy(ids===null?context.queue:Object.fromEntries(ids.filter(id=>Object.hasOwn(context.queue,id)).map(id=>[id,context.queue[id]]))):{};
// Only the private Campo replica may skip an upload here. Metadata alone is
// not proof: read the immutable object with the current authenticated session.
function linhaCampoIdentica(rows,owner,id,item,dados){
 if(item.key!==chaveCopiaCampo||id!==recordId(owner,chaveCopiaCampo))return false;
 const candidatas=(Array.isArray(rows)?rows:[]).filter(r=>r.registro_id===id);
 if(candidatas.length!==1)return false;
 const [linha]=candidatas;
 return linha.colecao==='arquivos'&&linha.criado_por===owner&&linha.referencia_tabela===null&&linha.referencia_id===null&&eq(linha.dados,dados);
}
export async function arquivoCampoIdentico(rows,owner,id,item,dados,bytes,ler=conteudoStorage,verificar=()=>{}){
 if(!linhaCampoIdentica(rows,owner,id,item,dados))return false;
 try{
  verificar();
  const atual=new Uint8Array(await ler(dados.path,undefined,{bruto:true}));
  verificar();
  return atual.length===bytes.length&&atual.every((byte,i)=>byte===bytes[i]);
 }catch(e){
  verificar();
  if(e.code==='SESSAO_ALTERADA'||e.code==='SESSAO_EXPIRADA'||e.status===401||e.status===403)throw e;
  return false;
 }
}
export async function prepararArmazenamento(state,after,selecionados=null) {
  const c=context;if(!c)return {operations:[],sent:{}};
  const sent=copy(selecionados||c.queue),operations=[],identicos={};
  for(const [id,item] of Object.entries(sent)) {
    conferirContexto(c);
    const key={colecao:'arquivos',registro_id:id};
    if(item.value===null) {if(item.expected)operations.push({table:'integracao_arquivos',key,expected:{dados:item.expected},remove:true});continue;}
    const bytes=new TextEncoder().encode(item.value);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const path=`${c.owner}/${hash}`;
    const dados={chave:item.key,path,hash,bytes:bytes.length};
    if(linhaCampoIdentica(state.base?.integracao_arquivos,c.owner,id,item,dados)){
      const igual=await arquivoCampoIdentico(state.base.integracao_arquivos,c.owner,id,item,dados,bytes,conteudoStorage,()=>conferirContexto(c));
      conferirContexto(c);
      const hoje=igual?await requisicao('integracao_arquivos?select=colecao,registro_id,criado_por,referencia_tabela,referencia_id,dados,updated_at&colecao=eq.arquivos&registro_id=eq.'+encodeURIComponent(id)+'&limit=2'):null;
      conferirContexto(c);
      const daLeitura=state.base.integracao_arquivos.find(r=>r.registro_id===id);
      if(!linhaCampoIdentica(hoje,c.owner,id,item,dados)||typeof daLeitura.updated_at!=='string'||!Number.isFinite(Date.parse(daLeitura.updated_at))||hoje[0].updated_at!==daLeitura.updated_at)
        throw Object.assign(Error('Não foi possível comprovar a versão atual da cópia de Campo. O rascunho foi preservado.'),{code:'CAMPO_COPIA_LEITURA_INCONCLUSIVA'});
      identicos[id]={version:item.version,dados};continue;
    }
    conferirContexto(c);await conteudoStorage(path,bytes);conferirContexto(c);
    if(eq(dados,item.expected))continue;
    operations.push(item.expected?{table:'integracao_arquivos',key,expected:{dados:item.expected},changes:{dados,updated_at:new Date().toISOString()}}:{table:'integracao_arquivos',key,insert:true,changes:{dados,criado_por:c.owner,...referencia(item.key,state,after)}});
  }
  return {operations,sent,identicos};
}
export async function confirmarArquivos(sent,base) {
  const c=context;if(!c){if(Object.keys(sent||{}).length)throw Object.assign(Error('Sessão de arquivos alterada.'),{code:'SESSAO_ALTERADA'});return;}
  return serializar(c,async()=>{
  conferirContexto(c);const rows=base.integracao_arquivos||[];
  // A receipt is not proof that this read contains the uploaded bytes. Validate
  // every selected file before consuming any queue entry or updating its base.
  const divergencias=await divergenciasArquivos(sent,base,c.owner);conferirContexto(c);
  if(divergencias.length)throw Object.assign(Error('A leitura não confirmou o arquivo enviado. A cópia local foi preservada.'),{code:'LEITURA_DIVERGENTE',status:409});
  const next=copy(c.queue);c.rows=rows;
  for(const [id,item] of Object.entries(sent||{})) {
    const row=c.rows.find(r=>r.registro_id===id);
    if(next[id]?.version===item.version) {
      delete next[id];
      await c.storage.set(cacheKey(c.owner,item.key),JSON.stringify({path:row?.dados.path,value:item.value}));
    } else if(next[id]) next[id].expected=copy(row?.dados||null);
    conferirContexto(c);
  }
  await c.storage.set(queueKey(c.owner),JSON.stringify(next));conferirContexto(c);c.queue=next;
  });
}

// Only called after a receipt and an explicit, durable local review decision
// (or to recover that completed decision after a cache write was interrupted).
// The journal retains the original bytes. A newer unsent version is never
// consumed or rebased onto a competing remote file by this acknowledgement.
export async function reconhecerArquivos(sent,base) {
 const c=context;if(!c){if(Object.keys(sent||{}).length)throw Object.assign(Error('Sessão de arquivos alterada.'),{code:'SESSAO_ALTERADA'});return;}
 return serializar(c,async()=>{
  conferirContexto(c);const rows=base.integracao_arquivos||[],next=copy(c.queue);
  for(const [id,item] of Object.entries(sent||{})){
   if(next[id]?.version!==item.version)continue;
   // Invalidate bytes instead of associating the submitted local value with a
   // different remote path. obterArquivo will fetch the authorized current file.
   await c.storage.set(cacheKey(c.owner,item.key),JSON.stringify({value:null}));conferirContexto(c);
   delete next[id];
  }
  await c.storage.set(queueKey(c.owner),JSON.stringify(next));conferirContexto(c);
  c.rows=rows;c.queue=next;
 });
}

// Keep the shared persistent slot unchanged. Another tab may already own a
// different version; this tab may only recognize the exact journal proof it read.
export function visualizarCopiaCampoConferida(prova,arquivo){
 const c=context;
 if(!c||!prova||prova.id!==recordId(c.owner,chaveCopiaCampo)||arquivo?.key!==chaveCopiaCampo||
    arquivo.version!==prova.version||typeof arquivo.value!=='string'||prova.dados?.chave!==arquivo.key)return;
 const atual=c.queue[prova.id];
 if(atual?.version===prova.version&&atual.value===arquivo.value)c.copiasConferidas.set(prova.id,{version:prova.version,value:arquivo.value,dados:copy(prova.dados)});
}
