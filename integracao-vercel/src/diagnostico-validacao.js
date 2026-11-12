// Only schema metadata observed in the database is retained. PostgreSQL details
// can contain a complete failing row; messages/details never enter the journal.
const orientacoes={
 fin_receb_clientes_dia_vencimento_check:'O dia de vencimento deve estar entre 1 e 31.',
 fin_receb_clientes_numero_parcelas_check:'O número de parcelas deve ser positivo ou estar ausente.',
 integracao_moradores_colecao_check:'O vínculo do morador deve pertencer à coleção de processos.',
 integracao_moradores_dados_check:'Os dados do morador devem estar no formato de objeto.',
 processos_kanban_etapa_atual_check:'Revise a etapa do núcleo entre as opções disponíveis.',
 processos_kanban_etapa_prefeitura_check:'Revise a etapa da prefeitura entre as opções disponíveis.',
 processos_kanban_prioridade_check:'Revise a prioridade entre as opções disponíveis.',
 profiles_tipo_check:'Revise o perfil entre as opções autorizadas.'
};
export const restricaoPermitida=v=>typeof v==='string'&&Object.hasOwn(orientacoes,v)?v:null;
export const orientacaoRestricao=v=>orientacoes[restricaoPermitida(v)]||null;
export function restricaoDaFalha(e){
 const vistos=new Set();
 while(e&&!vistos.has(e)){
  vistos.add(e);
  if(e.code==='23514'){
   const nome=restricaoPermitida(e.constraint)||restricaoPermitida(typeof e.message==='string'?e.message.match(/\bcheck constraint "([a-z][a-z0-9_]{0,62})"/)?.[1]:null);
   if(nome)return nome;
  }
  e=e.cause;
 }
 return null;
}
