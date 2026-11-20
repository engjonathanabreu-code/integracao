import {validarReciboOperacoes} from './recibo-operacoes.js';
import {igualSemantico} from './igualdade-semantica.js';
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
   const ops=(dep.payload||[]).map((op,indice)=>({op,indice})).filter(({op})=>op?.table==='integracao_arquivos'&&op.key?.registro_id===id);
   if(!ops.length){
    if(anterior&&dep.estado!=='dispensado'&&
       !(dep.estado==='confirmado'&&dep.escopoArquivos?.versao===1&&!dep.escopoArquivos.ids.includes(id))){incerto=true;break;}
    continue;
   }
   const {op,indice}=ops[0];
   const dados=op.remove===true?null:op.changes?.dados;
   const anteriorEfetivo=op.insert===true&&!op.remove&&op.expected==null?null:op.insert!==true&&Object.hasOwn(op.expected||{},'dados')?op.expected.dados:undefined;
   const sent=dep.preparado?.sent?.[id];
   if(ops.length!==1||dep.ordem===ordem||!anterior||anterior.key!==arquivo.key||
      !igualSemantico(op.key,{colecao:'arquivos',registro_id:id})||dep.estado!=='confirmado'||!dep.recibo||
      (op.remove!==undefined&&typeof op.remove!=='boolean')||(op.insert!==undefined&&typeof op.insert!=='boolean')||
      (op.remove===true&&(op.changes!=null||anterior.value!==null))||(!op.remove&&typeof anterior.value!=='string')||
      anteriorEfetivo===undefined||(!op.insert&&(!anteriorEfetivo||typeof anteriorEfetivo!=='object'||Array.isArray(anteriorEfetivo)))||
      (dados!==null&&(!dados||typeof dados!=='object'||Array.isArray(dados)||dados.chave!==arquivo.key))||
      (anteriorEfetivo!==null&&anteriorEfetivo.chave!==arquivo.key)||
      (sent&&(!igualSemantico(sent.expected??null,anteriorEfetivo)||sent.key!==arquivo.key||sent.value!==anterior.value||sent.version!==anterior.version))||
      (Object.hasOwn(dep.decisao?.arquivosAtual||{},id)&&!igualSemantico(dep.decisao.arquivosAtual[id],dados))){
    incerto=true;break;
   }
   ordem=dep.ordem;
   try{
    if(validarReciboOperacoes(dep.recibo,dep.payload,dep.pedido)){
     const resultado=dep.recibo.resultados[indice];
     if(resultado.disponivel!==true||!igualSemantico(resultado.chave,op.key)||(!op.remove&&!igualSemantico(resultado.canonico?.dados,dados))){incerto=true;break;}
    }else if(!dep.recibo.aliases||Object.getPrototypeOf(dep.recibo.aliases)!==Object.prototype){
     incerto=true;break;
    }
   }catch{incerto=true;break;}
   // Older unrelated bases may precede our captured base; after an anchor, any
   // gap/fork makes the whole chain inconclusive, never a partial permission.
   if(!igualSemantico(atual,anteriorEfetivo)){
    if(ligou){incerto=true;break;}
    continue;
   }
   ligou=true;atual=dados;
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
