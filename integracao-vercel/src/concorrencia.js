const igual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copiar=x=>x===undefined?undefined:structuredClone(x);
const objeto=x=>x&&typeof x==='object'&&!Array.isArray(x);
const identificados=xs=>xs.every(x=>objeto(x)&&typeof x.id==='string')&&new Set(xs.map(x=>x.id)).size===xs.length;

// Reconcile only compatible changes. Conflicting leaves retain both values for review.
export function conciliarEdicoes(base,local,remoto,escolhas={}) {
 const conflitos=[];
 const mesclar=(b,l,r,caminho=[])=>{
  if(igual(b,l))return copiar(r);
  if(igual(b,r)||igual(l,r))return copiar(l);
  if(Array.isArray(b)&&Array.isArray(l)&&Array.isArray(r)&&[b,l,r].every(identificados)) {
   return [...new Set([...r,...l].map(x=>x.id))].flatMap(id=>{
    const valor=mesclar(b.find(x=>x.id===id),l.find(x=>x.id===id),r.find(x=>x.id===id),[...caminho,id]);
    return valor===undefined?[]:[valor];
   });
  }
  if((objeto(b)||b===undefined)&&objeto(l)&&objeto(r)) {
   const resultado={};
   for(const k of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){
    // Completion metadata describes the boolean operation, not an independent edit.
    if(['concluido_em','concluido_por'].includes(k)&&b&&l.concluido!==b.concluido&&l.concluido===r.concluido){resultado[k]=copiar(r[k]);continue;}
    const valor=mesclar(b?.[k],l[k],r[k],[...caminho,k]);
    if(valor!==undefined)resultado[k]=valor;
   }
   return resultado;
  }
  const chave=JSON.stringify(caminho);
  if(escolhas[chave]==='remoto')return copiar(r);
  if(escolhas[chave]==='local')return copiar(l);
  conflitos.push({chave,caminho,local:copiar(l),remoto:copiar(r)});
  return copiar(l);
 };
 return {dados:mesclar(base,local,remoto),conflitos};
}

export function erroConcorrencia(e){return ['PT409','40001'].includes(e?.code);}
