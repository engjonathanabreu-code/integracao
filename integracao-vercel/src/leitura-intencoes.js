import {remapearIdentidades} from './aliases-tipados.js';
// Single-module intentions may reuse unrelated cached groups. Mixed/unknown
// intentions keep the complete read until their dependencies are mapped.
// Profiles/contracts, child rows and auxiliary files must still be fresh.
export function gruposDeLeituraDaIntencao(edicoes){
 if(!Array.isArray(edicoes)||!edicoes.length)return null;
 if(edicoes.some(e=>e?.colecao==='metas')&&edicoes.every(e=>e&&(['metas','auditoria'].includes(e.colecao)||e.colecao==='notificacoes'&&e.antes?.existe===false&&e.depois?.existe===true&&e.depois.valor?.rota?.pag==='metas')))return ['metas','usuarios','auxiliar'];
 if(edicoes.some(e=>['eventos','agendas'].includes(e?.colecao))&&edicoes.every(e=>e&&['eventos','agendas','auditoria'].includes(e.colecao)))return ['calendario','usuarios','auxiliar'];
 return null;
}

// C3 — leitura por registro. Cada coleção mapeada lista as tabelas do servidor
// que compõem sua projeção, filtradas pela coluna que liga a linha ao registro.
// `incluirDe` acrescenta, depois da primeira leitura, ids de filhos lidos agora
// (complementos de itens criados por outra pessoa desde a última carga).
// Coleção não mapeada, edição sem id, ou criação cuja identidade/linhas são
// definidas pelo servidor (ação com tempId, série recorrente) devolve null:
// quem chama mantém a leitura por grupos ou a leitura completa.
const valores=e=>[e.antes?.existe&&e.antes.valor,e.depois?.existe&&e.depois.valor].filter(v=>v&&typeof v==='object');
const idsFilhos=(e,campo)=>valores(e).flatMap(v=>Array.isArray(v[campo])?v[campo].map(x=>x?.id).filter(id=>typeof id==='string'&&id):[]);
const criacao=e=>e.antes?.existe!==true;
const extensoes=(tabela,ids)=>[[tabela,'registro_id',ids],['integracao_complementos','registro_id',ids]];
const MAPA={
 metas:e=>[['metas','id',[e.id]],...['meta_responsaveis','meta_checklist','meta_comentarios','meta_historico','meta_arquivos'].map(t=>[t,'meta_id',[e.id]]),
  ...['integracao_metas','integracao_complementos'].map(t=>[t,'registro_id',[e.id,...idsFilhos(e,'checklist'),...idsFilhos(e,'arquivos')],[['meta_checklist','id'],['meta_arquivos','id']]])],
 ordensServico:e=>[['ordens_servico','id',[e.id]],['ordem_servico_comentarios','ordem_servico_id',[e.id]],...extensoes('integracao_ordens_servico',[e.id])],
 setoresMeta:e=>[['meta_setores','id',[e.id]],['integracao_complementos','registro_id',[e.id]]],
 eventos:e=>criacao(e)?null:[['erp_eventos','id',[e.id]],['erp_evento_respostas','evento_id',[e.id]],...extensoes('integracao_calendario',[e.id])],
 agendas:e=>criacao(e)?null:[['erp_agendas','id',[e.id]],...extensoes('integracao_calendario',[e.id])],
 auditoria:e=>extensoes('integracao_auditoria',[e.id]),
 notificacoes:e=>extensoes('integracao_notificacoes',[e.id]),
};
export const colecoesComEscopo=Object.freeze(Object.keys(MAPA));
export function escopoDaIntencao(intencao,aliases={}){
 const edicoes=remapearIdentidades(intencao?.edicoes||[],aliases||{});
 if(!Array.isArray(edicoes)||!edicoes.length)return null;
 const escopo={};
 for(const e of edicoes){
  if(!e||typeof e.id!=='string'||!e.id||!Object.hasOwn(MAPA,e.colecao))return null;
  const entradas=MAPA[e.colecao](e);
  if(!entradas)return null;
  for(const [tabela,coluna,ids,incluirDe] of entradas){
   const atual=escopo[tabela]??={coluna,ids:[]};
   if(atual.coluna!==coluna)return null;
   for(const id of ids)if(!atual.ids.includes(id))atual.ids.push(id);
   for(const par of incluirDe||[])if(!(atual.incluirDe??=[]).some(p=>p[0]===par[0]&&p[1]===par[1]))atual.incluirDe.push(par);
  }
 }
 return escopo;
}
// Read in full next to a scope: profiles/contract/directory (permissions and
// names), file metadata (selected files are not part of the edits) and, for
// Metas, the sector names that encode/decode setor_id.
export function tabelasCompletasDoEscopo(escopo){
 if(!escopo)return null;
 return ['profiles','integracao_usuarios','integracao_arquivos',...(escopo.metas?['meta_setores']:[])];
}
