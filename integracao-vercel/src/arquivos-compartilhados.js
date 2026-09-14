import {copy,eq,temSessao,conteudoStorage} from './dados-compartilhados.js';

let context=null;
const recognized=/^integracao-(prf-modelo-(v4$|mun-v1-)|foto-v4-|timbrado-v1-|kml-v1-|campo-offline-v1$|comercial-offline-v1$|doc-offline-v1-|devolutiva-v1-)/;
const privateKey=k=>/^integracao-(campo-offline|comercial-offline|doc-offline)/.test(k);
const queueKey=owner=>`integracao-fila-arquivos-${owner}`;
const cacheKey=(owner,key)=>`integracao-cache-arquivo-${owner}-${key}`;
const recordId=(owner,key)=>privateKey(key)?`${owner}|${key}`:key;
const notify=()=>globalThis.window?.dispatchEvent(new Event('integracao:arquivo-pendente'));
export async function abrirArquivos(actor,base,storage) {
  const owner=actor.erpRef;
  if(context?.owner===owner){context.rows=base.integracao_arquivos||[];return;}
  const queue=JSON.parse(await storage.get(queueKey(owner))||'{}');
  context={owner,rows:base.integracao_arquivos||[],queue,storage};
}
export function fecharArquivos(){context=null;}
export const arquivosPendentes=()=>!!context&&Object.keys(context.queue).length>0;
export async function agendarArquivo(key,value) {
  const c=context;if(!c||!recognized.test(key))return;
  const id=recordId(c.owner,key),row=c.rows.find(r=>r.registro_id===id);
  const prior=c.queue[id];
  if(prior && prior.value===value)return;
  c.queue[id]={key,value,version:crypto.randomUUID(),expected:prior?prior.expected:copy(row?.dados||null)};
  await c.storage.set(cacheKey(c.owner,key),JSON.stringify({value}));
  await c.storage.set(queueKey(c.owner),JSON.stringify(c.queue));notify();
}
export async function obterArquivo(key) {
  const c=context;if(!c||!recognized.test(key))return undefined;
  const id=recordId(c.owner,key),queued=c.queue[id];if(queued)return queued.value;
  const row=c.rows.find(r=>r.registro_id===id);
  const cached=JSON.parse(await c.storage.get(cacheKey(c.owner,key))||'null');
  if(row) {
    if(cached?.path===row.dados.path)return cached.value;
    if(!temSessao()||globalThis.navigator?.onLine===false){if(cached)return cached.value;throw new Error('Conecte-se para baixar este arquivo neste aparelho.');}
    const value=await conteudoStorage(row.dados.path);
    await c.storage.set(cacheKey(c.owner,key),JSON.stringify({path:row.dados.path,value}));return value;
  }
  if(cached)return cached.path?null:cached.value;
  // A previous account's private field package must never become this user's draft.
  if(privateKey(key)) {
    const legacyOwner=await c.storage.get('integracao-dono-base-local');
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
export async function prepararArmazenamento(state,after) {
  const c=context;if(!c)return {operations:[],sent:{}};
  const sent=copy(c.queue),operations=[];
  for(const [id,item] of Object.entries(sent)) {
    const key={colecao:'arquivos',registro_id:id};
    if(item.value===null) {if(item.expected)operations.push({table:'integracao_arquivos',key,expected:{dados:item.expected},remove:true});continue;}
    const bytes=new TextEncoder().encode(item.value);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const path=`${c.owner}/${hash}`;
    await conteudoStorage(path,bytes);
    const dados={chave:item.key,path,hash,bytes:bytes.length};
    if(eq(dados,item.expected))continue;
    operations.push(item.expected?{table:'integracao_arquivos',key,expected:{dados:item.expected},changes:{dados,updated_at:new Date().toISOString()}}:{table:'integracao_arquivos',key,insert:true,changes:{dados,criado_por:c.owner,...referencia(item.key,state,after)}});
  }
  return {operations,sent};
}
export async function confirmarArquivos(sent,base) {
  const c=context;if(!c)return;
  c.rows=base.integracao_arquivos||[];
  for(const [id,item] of Object.entries(sent||{})) {
    const row=c.rows.find(r=>r.registro_id===id);
    if(c.queue[id]?.version===item.version) {
      delete c.queue[id];
      await c.storage.set(cacheKey(c.owner,item.key),JSON.stringify({path:row?.dados.path,value:item.value}));
    } else if(c.queue[id]) c.queue[id].expected=copy(row?.dados||null);
  }
  await c.storage.set(queueKey(c.owner),JSON.stringify(c.queue));
}
