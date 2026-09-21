export const GRUPOS_TEMPO_REAL={
 clientes:['fin_receb_municipios','fin_receb_remessas','fin_receb_clientes','integracao_municipios','integracao_remessas','integracao_moradores'],
 processos:['processos_kanban','processos_kanban_andamentos','processos_kanban_observacoes','processos_kanban_historico','integracao_nucleos'],
 metas:['metas','meta_setores','meta_responsaveis','meta_checklist','meta_comentarios','meta_historico','meta_arquivos','integracao_metas','ordens_servico','ordem_servico_comentarios','integracao_ordens_servico'],
 planos:['planos_trabalho','etapas_plano','etapa_responsaveis','entregaveis','comentarios_plano','documentos','projetos','integracao_planos'],
 calendario:['erp_agendas','erp_eventos','erp_evento_respostas','integracao_calendario'],
 chat:['erp_conversas','erp_mensagens','erp_exclusoes_chat','integracao_chat'],
 usuarios:['profiles','integracao_usuarios'],
 config:['integracao_complementos','integracao_configuracoes'],
 auxiliar:['integracao_arquivos','integracao_notificacoes','integracao_auditoria'],
 crm:['integracao_crm_cards','integracao_crm_atendimentos','integracao_crm_tarefas','integracao_crm_conversas','integracao_crm_mensagens','integracao_crm_agentes'],
 ponto:['integracao_ponto_jornadas','integracao_ponto_batidas','integracao_ponto_revisoes','integracao_ponto_decisoes','integracao_ponto_ajustes'],
 semanal:['integracao_semanal_municipios','integracao_semanal_semanas','integracao_semanal_registros','integracao_semanal_arquivos','integracao_semanal_exclusoes'],
 marketing:['integracao_marketing_grupos','integracao_marketing_atualizacoes','integracao_marketing_rotina','integracao_marketing_projetos','integracao_marketing_progresso','integracao_marketing_etapas'],
};
export const tabelasDosGrupos=grupos=>[...new Set(grupos.flatMap(g=>GRUPOS_TEMPO_REAL[g]||[]))];
export const afetaResumo=grupos=>!grupos||grupos.some(g=>['clientes','processos','config'].includes(g));
export const falhaTransitoria=e=>[408,429,500,502,503,504].includes(e?.status)||['TypeError','TimeoutError','AbortError'].includes(e?.name);
export function gruposDasOperacoes(ops){if(ops.some(o=>o.action||!Object.values(GRUPOS_TEMPO_REAL).some(ts=>ts.includes(o.table))))return null;return Object.keys(GRUPOS_TEMPO_REAL).filter(g=>ops.some(o=>GRUPOS_TEMPO_REAL[g].includes(o.table)));}
