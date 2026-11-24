import {igualSemantico,igualCampo,adaptadorCampo,conjuntoValido} from './igualdade-semantica.js';
const copiar=x=>x===undefined?undefined:structuredClone(x);
const objeto=x=>x&&typeof x==='object'&&!Array.isArray(x);
const identificados=xs=>xs.every(x=>objeto(x)&&typeof x.id==='string')&&new Set(xs.map(x=>x.id)).size===xs.length;

// Set merge for registered id lists (C4): keep the remote set, apply exactly the
// local additions and removals relative to the base. Remote order wins.
function mesclarConjunto(b,l,r){
 const base=new Set(b),local=new Set(l);
 const removidos=new Set(b.filter(x=>!local.has(x)));
 return [...r.filter(x=>!removidos.has(x)),...l.filter(x=>!base.has(x)&&!r.includes(x))];
}

// Reconcile only compatible changes. Conflicting leaves retain both values for review.
// `colecao` selects the C4 field adapters; without it only unambiguous set fields apply.
export function conciliarEdicoes(base,local,remoto,escolhas={},{colecao}={}) {
 const conflitos=[];
 // `campo` mirrors `caminho` with '*' for identified list items.
 const mesclar=(b,l,r,caminho=[],campo=[])=>{
  // Device-local fields keep the local value here, as before; they only stop
  // blocking confirmation.
  const registrado=campo.length?adaptadorCampo(colecao,campo):null;
  const adaptador=registrado?.tipo==='gerado_servidor'?null:registrado;
  const igual=adaptador?(x,y)=>igualCampo(colecao,campo,x,y):igualSemantico;
  if(igual(b,l))return copiar(r);
  if(igual(b,r)||igual(l,r))return copiar(l);
  if(adaptador?.tipo==='conjunto'&&[b,l,r].every(x=>conjuntoValido(x,adaptador)))return mesclarConjunto(b,l,r);
  if(Array.isArray(b)&&Array.isArray(l)&&Array.isArray(r)&&[b,l,r].every(identificados)) {
   return [...new Set([...r,...l].map(x=>x.id))].flatMap(id=>{
    const valor=mesclar(b.find(x=>x.id===id),l.find(x=>x.id===id),r.find(x=>x.id===id),[...caminho,id],[...campo,'*']);
    return valor===undefined?[]:[valor];
   });
  }
  if((objeto(b)||b===undefined)&&objeto(l)&&objeto(r)) {
   const resultado={};
   for(const k of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){
    // Completion metadata describes the boolean operation, not an independent edit.
    if(['concluido_em','concluido_por'].includes(k)&&b&&l.concluido!==b.concluido&&l.concluido===r.concluido){resultado[k]=copiar(r[k]);continue;}
    // Same for a registered timestamp that accompanies a field both sides moved
    // to the same value: the server's first stamp wins instead of a conflict.
    const carimbo=adaptadorCampo(colecao,[...campo,k]);
    if(carimbo?.tipo==='instante'&&carimbo.acompanha&&b&&Object.hasOwn(r,k)&&!igualSemantico(l[carimbo.acompanha],b[carimbo.acompanha])&&igualSemantico(l[carimbo.acompanha],r[carimbo.acompanha])){resultado[k]=copiar(r[k]);continue;}
    const valor=mesclar(b?.[k],l[k],r[k],[...caminho,k],[...campo,k]);
    if(valor!==undefined)resultado[k]=valor;
   }
   return resultado;
  }
  const chave=JSON.stringify(caminho);
  if(escolhas[chave]==='remoto')return copiar(r);
  if(escolhas[chave]==='local')return copiar(l);
  conflitos.push({chave,caminho,base:copiar(b),local:copiar(l),remoto:copiar(r)});
  return copiar(l);
 };
 return {dados:mesclar(base,local,remoto),conflitos};
}

export function erroConcorrencia(e){return ['PT409','40001'].includes(e?.code);}
