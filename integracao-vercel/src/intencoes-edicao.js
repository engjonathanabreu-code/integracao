import {igualSemantico} from './igualdade-semantica.js';
import {conciliarEdicoes} from './concorrencia.js';
import {remapearIdentidades} from './aliases-tipados.js';
import {edicaoSomenteLocal} from './intencoes-locais.js';
const copia=x=>structuredClone(x);
const lista=x=>Array.isArray(x)&&x.every(i=>i&&typeof i.id==='string')&&new Set(x.map(i=>i.id)).size===x.length;
const valor=x=>x===undefined?{existe:false}:{existe:true,valor:copia(x)};
export function extrairIntencao(antes,depois){
 const edicoes=[];
 for(const colecao of new Set([...Object.keys(antes),...Object.keys(depois)])){
  if(igualSemantico(antes[colecao],depois[colecao]))continue;
  if(lista(antes[colecao])&&lista(depois[colecao])){
   const a=new Map(antes[colecao].map(x=>[x.id,x])),b=new Map(depois[colecao].map(x=>[x.id,x]));
   for(const id of new Set([...a.keys(),...b.keys()]))if(!igualSemantico(a.get(id),b.get(id)))edicoes.push({colecao,id,antes:valor(a.get(id)),depois:valor(b.get(id))});
  }else edicoes.push({colecao,antes:valor(antes[colecao]),depois:valor(depois[colecao])});
 }
 return edicoes.filter(e=>!edicaoSomenteLocal(e));
}
export const recursosIntencao=edicoes=>edicoes.filter(e=>e.colecao!=='auditoria').map(e=>JSON.stringify([e.colecao,e.id||'*']));
// Overlay only the explicit changed records. Missing canonical rows remain conflicts,
// never evidence that a client may insert a row hidden by RLS.
export function aplicarIntencao(remoto,edicoes,{aliases={},escolhas={}}={}){
 const dados=copia(remoto),conflitos=[];
 for(const entrada of edicoes){
  const e=remapearIdentidades(entrada,aliases),{colecao,id}=e;
  const base=e.antes.existe?e.antes.valor:undefined,local=e.depois.existe?e.depois.valor:undefined;
  const atual=id?(dados[colecao]||[]).find(r=>r.id===id):dados[colecao];
  const caminho=id?[colecao,id]:[colecao];
  const relativas=Object.fromEntries(Object.entries(escolhas).filter(([k])=>JSON.stringify(JSON.parse(k).slice(0,caminho.length))===JSON.stringify(caminho)).map(([k,v])=>[JSON.stringify(JSON.parse(k).slice(caminho.length)),v]));
  const r=conciliarEdicoes(base,local,atual,relativas);
  conflitos.push(...r.conflitos.map(c=>({...c,caminho:[...caminho,...c.caminho],chave:JSON.stringify([...caminho,...c.caminho])})));
  if(id){dados[colecao]=(dados[colecao]||[]).filter(x=>x.id!==id);if(r.dados!==undefined)dados[colecao].push(r.dados);}
  else if(r.dados===undefined)delete dados[colecao];else dados[colecao]=r.dados;
 }
 return {dados,conflitos};
}
export function semearOriginais(remoto,edicoes){
 const dados=copia(remoto);
 for(const e of edicoes)if(e.id&&e.antes.existe&&!(dados[e.colecao]||[]).some(x=>x.id===e.id))dados[e.colecao]=[...(dados[e.colecao]||[]),copia(e.antes.valor)];
 return dados;
}

export function recortarIntencao(db,edicoes){
 const corte={};
 for(const e of edicoes){
  if(e.id){corte[e.colecao]||=[];const r=db[e.colecao]?.find(r=>r.id===e.id);if(r)corte[e.colecao].push(copia(r));}
  else if(Object.hasOwn(db,e.colecao))corte[e.colecao]=copia(db[e.colecao]);
 }
 return corte;
}
