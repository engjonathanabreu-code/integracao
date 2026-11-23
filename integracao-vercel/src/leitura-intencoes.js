// Single-module intentions may reuse unrelated cached groups. Mixed/unknown
// intentions keep the complete read until their dependencies are mapped.
// Profiles/contracts, child rows and auxiliary files must still be fresh.
export function gruposDeLeituraDaIntencao(edicoes){
 if(!Array.isArray(edicoes)||!edicoes.length)return null;
 if(edicoes.some(e=>e?.colecao==='metas')&&edicoes.every(e=>e&&['metas','auditoria'].includes(e.colecao)))return ['metas','usuarios','auxiliar'];
 if(edicoes.some(e=>['eventos','agendas'].includes(e?.colecao))&&edicoes.every(e=>e&&['eventos','agendas','auditoria'].includes(e.colecao)))return ['calendario','usuarios','auxiliar'];
 return null;
}
