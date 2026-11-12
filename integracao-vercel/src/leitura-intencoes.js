// Only goal-only intentions may reuse unrelated cached groups. Other/mixed
// intentions keep the complete read until their dependencies are mapped.
// Fresh profiles/contracts, goal children and auxiliary files remain required.
export function gruposDeLeituraDaIntencao(edicoes){
 if(!Array.isArray(edicoes)||!edicoes.some(e=>e?.colecao==='metas')||!edicoes.every(e=>e&&['metas','auditoria'].includes(e.colecao)))return null;
 return ['metas','usuarios','auxiliar'];
}
