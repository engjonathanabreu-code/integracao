import {validarReciboOperacoes} from './recibo-operacoes.js';
import {igualSemantico} from './igualdade-semantica.js';
export const chaveCopiaCampo='integracao-campo-offline-v1';
// A data edit owns only attachments referenced by its changed records. Include
// both sides so removals remain atomic; audit text is not a business reference.
export function selecionarArquivosDaEdicao(edicoes,arquivos){
 const chaves=new Set();
 const visitar=v=>{if(typeof v==='string')chaves.add(v);else if(v&&typeof v==='object')Object.values(v).forEach(visitar);};
 for(const e of edicoes){
  if(e.colecao==='auditoria')continue;
  if(e.antes?.existe)visitar(e.antes.valor);
  if(e.depois?.existe)visitar(e.depois.valor);
  if(e.colecao==='nucleos'&&e.id)chaves.add('integracao-kml-v1-'+e.id);
 }
 return structuredClone(Object.fromEntries(Object.entries(arquivos||{}).filter(([,a])=>chaves.has(a.key))));
}

// A file-only request for exactly one whole-value file. Only these may be
// superseded by a newer local version or closed without a server write.
export function arquivoUnicoDaIntencao(item){
 const o=item?.original,arquivos=o?.intencao?.arquivos,ids=Object.keys(arquivos||{});
 if(o?.modulo!=='arquivos'||o.preparar!==true||o.operacoes?.length||o.referencias?.length||o.criadas?.length||
    !Array.isArray(o.intencao?.edicoes)||o.intencao.edicoes.length||ids.length!==1)return null;
 const [id]=ids,a=arquivos[id];
 if(o.unidade!=='arquivo:'+id||o.recursos?.length!==1||o.recursos[0]!==o.unidade||typeof a?.key!=='string'||!a.key||
    typeof a.version!=='string'||!a.version||(a.value!==null&&typeof a.value!=='string'))return null;
 return {id,key:a.key,version:a.version};
}
const opsDoArquivo=(item,id)=>(Array.isArray(item.payload)?item.payload:[]).map((op,indice)=>({op,indice})).filter(({op})=>op?.table==='integracao_arquivos'&&op.key?.registro_id===id);
// A refused single-file write whose exact content may already be the server's.
export function arquivoEmConflito(item){
 const a=arquivoUnicoDaIntencao(item),arquivo=a&&item.original.intencao.arquivos[a.id],op=item?.payload?.length===1?item.payload[0]:null,d=op?.changes?.dados;
 return !!a&&item.estado==='bloqueado_conflito'&&item.erro?.codigo==='PT409'&&item.erro.rejeicaoConfirmada===true&&!item.recibo&&typeof arquivo.value==='string'&&
  op?.table==='integracao_arquivos'&&op.key?.colecao==='arquivos'&&op.key.registro_id===a.id&&op.remove!==true&&
  d?.chave===a.key&&/^[a-f0-9]{64}$/.test(d.hash||'')&&d.path===item.conta+'/'+d.hash&&d.bytes===new TextEncoder().encode(arquivo.value).length;
}
export const conflitoArquivoReconciliavel=(i,agora)=>arquivoEmConflito(i)&&(!i.reconciliacaoVerificadaEm||agora-i.reconciliacaoVerificadaEm>=120000);
const PROVAS_PRESENCA=['campo_ja_presente_no_servidor','arquivo_ja_presente_no_servidor','arquivo_sem_gravacao_necessaria'];

// Freeze a narrower execution scope only before any payload or write exists.
// Original/checksum and historical dependencies remain intact for export/review.
export function escopoArquivosDaIntencao(item,items){
 if(item.escopoArquivos?.versao===1)return structuredClone(item.escopoArquivos);
 const o=item.original;
 if(item.payload||item.preparado||item.recibo||item.enviadoEm!=null||item.tentativas>0||o.preparar!==true||o.substitui||o.legado||o.operacoes?.length||!['pendente_local','falha_transitoria'].includes(item.estado))return null;
 const edicoes=o.intencao?.edicoes||[];
 const dados=edicoes.some(e=>e.colecao!=='auditoria');
 const arquivos=o.intencao.arquivos||{},ids=Object.keys(dados?selecionarArquivosDaEdicao(edicoes,arquivos):arquivos);
 const removidos=new Set(Object.keys(arquivos).filter(id=>!ids.includes(id)).map(id=>'arquivo:'+id));
 const dependencias=(item.dependencias||o.dependencias||[]).filter(id=>{
  if(o.dependencias?.includes(id))return true;
  const predecessor=items.find(i=>i.id===id),anterior=predecessor?.original;
  if(!anterior||predecessor.substituidaPor||anterior.unidade===o.unidade||anterior.criadas?.some(r=>o.referencias?.includes(r)))return true;
  const comuns=(o.recursos||[]).filter(r=>anterior.recursos?.includes(r));
  // Missing/unknown dependency provenance must stay conservative.
  const efetivos=new Set(recursosEfetivosDaIntencao(predecessor));
  return !comuns.length||comuns.some(r=>!removidos.has(r)&&(!r.startsWith('arquivo:')||efetivos.has(r)));
 });
 // File-only batches retain every original file. Freeze only a proven removal
 // of an automatic dependency, so a later safe predecessor scope can unblock it.
 if(!dados&&dependencias.length===(item.dependencias||o.dependencias||[]).length)return null;
 return {versao:1,ids,dependencias};
}

// Replacements inherit the execution ordering already proven safe, not the
// historical attachment dependencies kept only for audit/export.
export function dependenciasEfetivasDaIntencao(item){
 return [...(item.escopoArquivos?.versao===1?item.escopoArquivos.dependencias:item.dependencias||item.original.dependencias||[])];
}

// Only persisted scope can remove a predecessor resource. Callers computing a
// new scope must persist it in the same transaction before inferring successors.
export function recursosEfetivosDaIntencao(item){
 const originais=item.original.recursos||[],escopo=item.escopoArquivos;
 if(escopo?.versao!==1)return [...originais];
 const arquivos=item.original.intencao?.arquivos||{};
 return originais.filter(r=>!r.startsWith('arquivo:')||!Object.hasOwn(arquivos,r.slice(8))||escopo.ids.includes(r.slice(8)));
}

// One proven write of this file by a confirmed request, or null when anything
// about its payload, receipt or review decision is not exact.
function escritaComprovada(dep,id,arquivo){
 const anterior=dep.original?.intencao?.arquivos?.[id],ops=opsDoArquivo(dep,id);
 if(ops.length!==1)return null;
 const {op,indice}=ops[0];
 const dados=op.remove===true?null:op.changes?.dados;
 const anteriorEfetivo=op.insert===true&&!op.remove&&op.expected==null?null:op.insert!==true&&Object.hasOwn(op.expected||{},'dados')?op.expected.dados:undefined;
 const sent=dep.preparado?.sent?.[id];
 if(!anterior||anterior.key!==arquivo.key||
    !igualSemantico(op.key,{colecao:'arquivos',registro_id:id})||dep.estado!=='confirmado'||!dep.recibo||
    (op.remove!==undefined&&typeof op.remove!=='boolean')||(op.insert!==undefined&&typeof op.insert!=='boolean')||
    (op.remove===true&&(op.changes!=null||anterior.value!==null))||(!op.remove&&typeof anterior.value!=='string')||
    anteriorEfetivo===undefined||(!op.insert&&(!anteriorEfetivo||typeof anteriorEfetivo!=='object'||Array.isArray(anteriorEfetivo)))||
    (dados!==null&&(!dados||typeof dados!=='object'||Array.isArray(dados)||dados.chave!==arquivo.key))||
    (anteriorEfetivo!==null&&anteriorEfetivo.chave!==arquivo.key)||
    (sent&&(!igualSemantico(sent.expected??null,anteriorEfetivo)||sent.key!==arquivo.key||sent.value!==anterior.value||sent.version!==anterior.version))||
    (Object.hasOwn(dep.decisao?.arquivosAtual||{},id)&&!igualSemantico(dep.decisao.arquivosAtual[id],dados)))return null;
 try{
  if(validarReciboOperacoes(dep.recibo,dep.payload,dep.pedido)){
   const resultado=dep.recibo.resultados[indice];
   if(resultado.disponivel!==true||!igualSemantico(resultado.chave,op.key)||(!op.remove&&!igualSemantico(resultado.canonico?.dados,dados)))return null;
  }else if(!dep.recibo.aliases||Object.getPrototypeOf(dep.recibo.aliases)!==Object.prototype)return null;
 }catch{return null;}
 return {anteriorEfetivo,dados};
}
// Without a dependency link, the captured base is provably stale only when this
// account's newest earlier request for the same file wrote (or proved) the
// pointer after this request was created. Then the local version is the later
// one. The server compare-and-set still refuses any pointer written elsewhere.
// `undefined` keeps the captured base.
function baseDeEscritaPropria(item,id,arquivo,porId){
 if(!Number.isFinite(item.criadoEm))return undefined;
 let ultima=null;
 for(const d of porId.values()){
  if(!d||d.id===item.id||d.estado==='substituido'||!Number.isSafeInteger(d.ordem)||d.ordem<=0||d.ordem>=item.ordem)continue;
  if(!Object.hasOwn(d.original?.intencao?.arquivos||{},id)&&!opsDoArquivo(d,id).length)continue;
  if(!ultima||d.ordem>ultima.ordem)ultima=d;
 }
 if(!ultima)return undefined;
 if(ultima.estado==='dispensado'){
  const decisao=ultima.decisao,p=decisao?.prova;
  if(ultima.recibo||!PROVAS_PRESENCA.includes(decisao?.tipo)||p?.id!==id||!(decisao.em>item.criadoEm)||ultima.original?.intencao?.arquivos?.[id]?.key!==arquivo.key)return undefined;
  if(p.motivo==='remocao_sem_registro')return null;
  return p.dados?.chave===arquivo.key?p.dados:undefined;
 }
 if(ultima.estado!=='confirmado'||ultima.decisao||!(ultima.enviadoEm>item.criadoEm))return undefined;
 const escrita=escritaComprovada(ultima,id,arquivo);
 return escrita?escrita.dados:undefined;
}

// A fixed payload is never rewritten. Before fix/send, derive the effective
// base only from an unbroken chain of this account's own confirmed writes.
export function arquivosDaIntencao(item,items){
 const escopo=escopoArquivosDaIntencao(item,items),originais=item.original.intencao.arquivos||{};
 const arquivos=structuredClone(escopo?Object.fromEntries(escopo.ids.filter(id=>Object.hasOwn(originais,id)).map(id=>[id,originais[id]])):originais);
 if(item.payload||item.preparado||item.recibo||item.enviadoEm!=null||item.tentativas>0||!item.conta||!Number.isSafeInteger(item.ordem))return arquivos;
 const porId=new Map(),deps=new Map();
 for(const d of items){
  if(d.conta!==item.conta)continue;
  // A persisted queue has one row per account/request. Do not choose between
  // inconsistent copies if a caller ever supplies a malformed snapshot.
  porId.set(d.id,porId.has(d.id)?null:d);
 }
 for(const id of escopo?.dependencias||item.dependencias||item.original.dependencias||[]){
  let dep=porId.get(id);const vistos=new Set();
  while(dep?.substituidaPor){
   const novo=porId.get(dep.substituidaPor);
   if(vistos.has(dep.id)||dep.estado!=='substituido'||novo?.original?.substitui!==dep.id||novo.ordem!==dep.ordem){dep=null;break;}
   vistos.add(dep.id);dep=novo;
  }
  // Missing, cross-account or invalid links are not evidence for any advance.
  if(!dep||!Number.isSafeInteger(dep.ordem)||dep.ordem<=0||dep.ordem>=item.ordem)return arquivos;
  deps.set(dep.id,dep);
 }
 const ordenadas=[...deps.values()].sort((a,b)=>a.ordem-b.ordem);
 for(const [id,arquivo] of Object.entries(arquivos)){
  const base=arquivo.expected??null;let atual=base,ligou=false,ordem=-1,incerto=false;
  for(const dep of ordenadas){
   const anterior=dep.original?.intencao?.arquivos?.[id];
   if(dep.payload!=null&&!Array.isArray(dep.payload)){incerto=true;break;}
   if(!opsDoArquivo(dep,id).length){
    if(anterior&&dep.estado!=='dispensado'&&
       !(dep.estado==='confirmado'&&dep.escopoArquivos?.versao===1&&!dep.escopoArquivos.ids.includes(id))){incerto=true;break;}
    continue;
   }
   // A dispensed request never wrote: it neither advances nor breaks the chain.
   if(dep.estado==='dispensado'&&!dep.recibo)continue;
   const escrita=dep.ordem===ordem?null:escritaComprovada(dep,id,arquivo);
   if(!escrita){incerto=true;break;}
   ordem=dep.ordem;
   // Older unrelated bases may precede our captured base; after an anchor, any
   // gap/fork makes the whole chain inconclusive, never a partial permission.
   if(!igualSemantico(atual,escrita.anteriorEfetivo)){
    if(ligou){incerto=true;break;}
    continue;
   }
   ligou=true;atual=escrita.dados;
  }
  if(!ligou&&!incerto){
   const propria=baseDeEscritaPropria(item,id,arquivo,porId);
   if(propria!==undefined)arquivo.expected=structuredClone(propria);
  }
  if(ligou&&!incerto)arquivo.expected=structuredClone(atual);
 }
 return arquivos;
}

// Compare uploaded content to the canonical metadata without downloading bytes.
export async function divergenciasArquivos(sent,base,owner){
 const divergencias=[];
 for(const [id,item] of Object.entries(sent||{})){
  const atual=base.integracao_arquivos?.find(r=>r.registro_id===id)?.dados??null;
  let esperado=null;
  if(item.value!==null){
   const bytes=new TextEncoder().encode(item.value),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   esperado={chave:item.key,path:`${owner}/${hash}`,hash,bytes:bytes.length};
  }
  if(esperado?!(atual?.chave===esperado.chave&&atual.path===esperado.path&&atual.hash===esperado.hash&&Number(atual.bytes)===esperado.bytes):atual!==null)divergencias.push({id,chave:item.key,esperado,atual:structuredClone(atual)});
 }
 return divergencias;
}

// A proof is local journal evidence for a no-op, never a server receipt.
export function provaCampoSemEscrita(item,pronto){
 const o=item.original,arquivos=o?.intencao?.arquivos;
 if(o?.modulo!=='arquivos'||o.preparar!==true||o.legado||o.substitui||o.operacoes?.length||
    o.intencao?.edicoes?.length!==0||item.payload!=null||item.preparado!=null||item.recibo!=null||
    item.fase!=='preparacao'||item.enviadoEm!=null||item.confirmadoEm!=null||item.lidoEm!=null||item.tentativasTotais!==0||!Array.isArray(pronto.operacoes)||pronto.operacoes.length||
    Object.keys(arquivos||{}).length!==1||Object.keys(pronto.sent||{}).length!==1||
    Object.keys(pronto.identicos||{}).length!==1)return null;
 const id=item.conta+'|'+chaveCopiaCampo,arquivo=arquivos[id],enviado=pronto.sent[id],prova=pronto.identicos[id],d=prova?.dados;
 if(arquivo?.key!==chaveCopiaCampo||typeof arquivo.value!=='string'||!arquivo.version||!enviado||
    enviado.key!==arquivo.key||enviado.value!==arquivo.value||enviado.version!==arquivo.version||prova?.version!==arquivo.version||prova.motivo||d?.chave!==chaveCopiaCampo||
    !/^[a-f0-9]{64}$/.test(d.hash)||d.path!==item.conta+'/'+d.hash||d.bytes!==new TextEncoder().encode(arquivo.value).length)return null;
 return {id,version:prova.version,dados:d};
}

// Preparation proved there is nothing to write for a never-sent single file:
// a removal with no server row, or content already under the current pointer.
export function provaArquivoSemGravacao(item,pronto){
 const a=arquivoUnicoDaIntencao(item);
 if(!a||item.payload!=null||item.preparado!=null||item.recibo!=null||item.fase!=='preparacao'||item.enviadoEm!=null||item.confirmadoEm!=null||item.lidoEm!=null||
    item.tentativasTotais>0||item.tentativas>0||!Array.isArray(pronto?.operacoes)||pronto.operacoes.length||
    Object.keys(pronto.sent||{}).length!==1||Object.keys(pronto.identicos||{}).length!==1)return null;
 const arquivo=item.original.intencao.arquivos[a.id],enviado=pronto.sent[a.id],p=pronto.identicos[a.id],d=p?.dados;
 if(!enviado||enviado.key!==arquivo.key||enviado.value!==arquivo.value||enviado.version!==arquivo.version||p?.version!==arquivo.version)return null;
 if(p.motivo==='remocao_sem_registro')return arquivo.value===null&&(enviado.expected??null)===null?{id:a.id,version:p.version,motivo:p.motivo}:null;
 if(p.motivo!=='conteudo_identico'||typeof arquivo.value!=='string'||d?.chave!==arquivo.key||!/^[a-f0-9]{64}$/.test(d.hash||'')||
    d.path!==item.conta+'/'+d.hash||d.bytes!==new TextEncoder().encode(arquivo.value).length||!igualSemantico(enviado.expected,d))return null;
 return {id:a.id,version:p.version,motivo:p.motivo,dados:structuredClone(d)};
}
