// Projection may carry local rows for display. They are not proof of a write.
export function separarCriacoesPendentes(state,baseline,envio,actor) {
 const db={...state.db};
 const confirmados=new Set(state.bindings.filter(b=>!b.parent).map(b=>JSON.stringify([b.collection,b.id])));
 const temporarios=new Set((envio?.operations||[]).map(o=>o.tempId).filter(Boolean));
 for(const [colecao,rows] of Object.entries(db)){
  if(!Array.isArray(rows)||!Array.isArray(baseline?.[colecao]))continue;
  const anteriores=new Set(baseline[colecao].map(r=>r?.id));
  db[colecao]=rows.filter(r=>{
   if(!r?.id)return true;
   const canonico=confirmados.has(JSON.stringify([colecao,r.id]));
   // Older reconciliation could put an unconfirmed event into the baseline.
   // A rejected batch plus its saved event/author proves this is still a draft;
   // never recover a previously shared (possibly deleted) event this way.
   const reservaAntiga=colecao==='eventos'&&envio?.rejeitada&&!r._compartilhado&&!canonico&&actor?.id===r.criadoPor&&
    (envio.after?.eventos||[]).some(e=>e.id===r.id&&!e._compartilhado);
   if(!reservaAntiga&&!temporarios.has(r.id)&&anteriores.has(r.id))return true;
   return canonico||!!r._compartilhado;
  });
 }
 return {...state,db};
}

// Only repair the old form's implicit agenda-color change after a definite
// rejection. The caller archives the complete original draft before publishing.
export function recuperarCorDeAgenda(local,remoto,envio){
 if(!envio?.rejeitada||envio.erro!=='Somente a administração pode alterar cores')return local;
 const recusadas=new Map((envio.operations||[]).filter(o=>o.action==='evento_cor').map(o=>[o.payload.id,o.payload.cor]));
 return {...local,eventos:(local.eventos||[]).map(e=>{
  const atual=(remoto.eventos||[]).find(r=>r.id===e.id);
  const agenda=(local.agendas||[]).find(a=>a.id===e.agendaId);
  if(!atual||!agenda||!recusadas.has(e.id)||e.cor!==recusadas.get(e.id)||e.cor!==agenda.cor)return e;
  return {...e,cor:atual.cor};
 })};
}

export function mensagemRejeicao(erro){
 return erro?.message||erro?.erro||'Não foi possível confirmar o salvamento. As alterações foram preservadas.';
}
