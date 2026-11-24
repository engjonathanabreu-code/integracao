-- As políticas permissivas herdadas de Metas, Ordens de Serviço, pagamentos (leitura) e
-- observações de processos passam a exigir perfil ativo do chamador. Usuários ativos
-- mantêm o mesmo acesso; as regras restritivas existentes não mudam.
-- Aplicada em produção em 24/11/2026. Idempotente (alter policy).
-- Reversão: supabase/operacoes/politicas-permissivas-perfil-ativo-reversao.sql

begin;

alter policy metas_auth on public.metas
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
alter policy meta_hist_auth on public.meta_historico
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
alter policy meta_comentarios_auth on public.meta_comentarios
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
alter policy meta_checklist_auth on public.meta_checklist
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
alter policy meta_resp_auth on public.meta_responsaveis
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
alter policy meta_arq_auth on public.meta_arquivos
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
alter policy meta_setores_auth on public.meta_setores
  using ((select public.is_active_user())) with check ((select public.is_active_user()));

alter policy ordens_servico_auth on public.ordens_servico
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
alter policy os_comentarios_auth on public.ordem_servico_comentarios
  using ((select public.is_active_user())) with check ((select public.is_active_user()));

alter policy pagamentos_authenticated_select on public.pagamentos
  using ((select public.is_active_user()));
alter policy processos_kanban_observacoes_select on public.processos_kanban_observacoes
  using ((select public.is_active_user()));

commit;
