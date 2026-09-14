// Explicit destinations for Integração fields. Canonical ERP columns stay in the ERP tables.
export const tabelasModulos={
  processos:'integracao_moradores',nucleos:'integracao_nucleos',municipios:'integracao_municipios',remessas:'integracao_remessas',
  metas:'integracao_metas',checklist:'integracao_metas',arquivos:'integracao_metas',
  planos:'integracao_planos',etapas:'integracao_planos',entregaveis:'integracao_planos',
  ordensServico:'integracao_ordens_servico',conversas:'integracao_chat',mensagens:'integracao_chat',
  usuarios:'integracao_usuarios',eventos:'integracao_calendario',agendas:'integracao_calendario',
  notificacoes:'integracao_notificacoes',auditoria:'integracao_auditoria',
  config:'integracao_configuracoes',regrasIA:'integracao_configuracoes',tiposDocumento:'integracao_configuracoes',advogados:'integracao_configuracoes',camposComercial:'integracao_configuracoes',
};
export const tabelasProprias=[...new Set(Object.values(tabelasModulos))];
export const destinoComplemento=(colecao)=>tabelasModulos[colecao]||'integracao_complementos';
export function unirCampos(base,novo) {
  if(!novo || typeof novo!=='object' || Array.isArray(novo))return structuredClone(novo);
  const result=base && typeof base==='object' && !Array.isArray(base)?structuredClone(base):{};
  for(const [key,value] of Object.entries(novo))result[key]=unirCampos(result[key],value);
  return result;
}
export function reunirComplementos(base) {
  const rows=new Map((base.integracao_complementos||[]).map(r=>[`${r.colecao}:${r.registro_id}`,{...r,_tabela:'integracao_complementos'}]));
  for(const table of tabelasProprias)for(const row of base[table]||[])rows.set(`${row.colecao}:${row.registro_id}`,{...row,_tabela:table});
  return [...rows.values()];
}
