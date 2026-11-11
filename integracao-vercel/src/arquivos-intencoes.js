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

// Advance a frozen file's base only through its own confirmed predecessors.
// An unrelated remote change remains subject to the normal SQL precondition.
export function arquivosDaIntencao(item,items){
 const escopo=escopoArquivosDaIntencao(item,items),originais=item.original.intencao.arquivos||{};
 const arquivos=structuredClone(escopo?Object.fromEntries(escopo.ids.filter(id=>Object.hasOwn(originais,id)).map(id=>[id,originais[id]])):originais),porId=new Map(items.map(i=>[i.id,i]));
 const deps=(escopo?.dependencias||item.dependencias||[]).map(id=>{let d=porId.get(id);const vistos=new Set();while(d?.substituidaPor&&!vistos.has(d.id)){vistos.add(d.id);d=porId.get(d.substituidaPor);}return d;}).filter(d=>d?.estado==='confirmado'&&d.recibo).sort((a,b)=>a.ordem-b.ordem);
 for(const [id,arquivo] of Object.entries(arquivos)){
  const baseOriginal=arquivo.expected??null;
  for(const dep of deps){
   const anterior=dep.original.intencao.arquivos?.[id];
   const op=dep.payload?.find(o=>o.table==='integracao_arquivos'&&o.key?.registro_id===id);
   if(!anterior||(!igualSemantico(baseOriginal,anterior.expected??null)&&!(op?.expected&&igualSemantico(baseOriginal,op.expected.dados??null))))continue;
   // Recognizing somebody else's current file is not permission to overwrite it.
   if(Object.hasOwn(dep.decisao?.arquivosAtual||{},id)&&!igualSemantico(dep.decisao.arquivosAtual[id],op?.remove?null:op?.changes?.dados))continue;
   if(op?.remove)arquivo.expected=null;
   else if(op?.changes?.dados)arquivo.expected=structuredClone(op.changes.dados);
  }
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
