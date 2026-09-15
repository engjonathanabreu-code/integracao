-- Avoid per-row dynamic SQL during the initial shared-data load.
-- Keep the active-profile requirement and each source table's existing RLS.
SET LOCAL lock_timeout = '2s';
ALTER POLICY ler ON public.integracao_moradores USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY integracao_ler ON public.integracao_complementos USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY ler ON public.integracao_nucleos USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY ler ON public.integracao_municipios USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY ler ON public.integracao_remessas USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY ler ON public.integracao_metas USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY ler ON public.integracao_planos USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY ler ON public.integracao_ordens_servico USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY ler ON public.integracao_chat USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY ler ON public.integracao_usuarios USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY ler ON public.integracao_calendario USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY ler ON public.integracao_configuracoes USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY ler ON public.integracao_arquivos USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);

ALTER POLICY ler ON public.integracao_auditoria USING (EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
AND CASE
  WHEN referencia_tabela='integracao_config' THEN true
  WHEN referencia_tabela IS NULL THEN criado_por=(SELECT auth.uid()) OR (SELECT public.is_erp_admin())
  WHEN referencia_tabela='processos_kanban' THEN referencia_id IN (SELECT origem.id FROM public.processos_kanban AS origem)
  WHEN referencia_tabela='metas' THEN referencia_id IN (SELECT origem.id FROM public.metas AS origem)
  WHEN referencia_tabela='ordens_servico' THEN referencia_id IN (SELECT origem.id FROM public.ordens_servico AS origem)
  WHEN referencia_tabela='planos_trabalho' THEN referencia_id IN (SELECT origem.id FROM public.planos_trabalho AS origem)
  WHEN referencia_tabela='erp_eventos' THEN referencia_id IN (SELECT origem.id FROM public.erp_eventos AS origem)
  WHEN referencia_tabela='erp_conversas' THEN referencia_id IN (SELECT origem.id FROM public.erp_conversas AS origem)
  WHEN referencia_tabela='profiles' THEN referencia_id IN (SELECT origem.id FROM public.profiles AS origem)
  WHEN referencia_tabela='fin_receb_municipios' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_municipios AS origem)
  WHEN referencia_tabela='fin_receb_remessas' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_remessas AS origem)
  WHEN referencia_tabela='fin_receb_clientes' THEN referencia_id IN (SELECT origem.id FROM public.fin_receb_clientes AS origem)
  WHEN referencia_tabela='meta_setores' THEN referencia_id IN (SELECT origem.id FROM public.meta_setores AS origem)
  WHEN referencia_tabela='erp_agendas' THEN referencia_id IN (SELECT origem.id FROM public.erp_agendas AS origem)
  ELSE false
END);
