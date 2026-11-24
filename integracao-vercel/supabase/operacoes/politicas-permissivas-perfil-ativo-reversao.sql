-- Reversão de supabase/migrations/20261124120100_politicas_permissivas_exigem_perfil_ativo.sql.
-- Restaura as políticas vivas em 24/11/2026 (qual/with_check = true).
begin;
alter policy metas_auth on public.metas using (true) with check (true);
alter policy meta_hist_auth on public.meta_historico using (true) with check (true);
alter policy meta_comentarios_auth on public.meta_comentarios using (true) with check (true);
alter policy meta_checklist_auth on public.meta_checklist using (true) with check (true);
alter policy meta_resp_auth on public.meta_responsaveis using (true) with check (true);
alter policy meta_arq_auth on public.meta_arquivos using (true) with check (true);
alter policy meta_setores_auth on public.meta_setores using (true) with check (true);
alter policy ordens_servico_auth on public.ordens_servico using (true) with check (true);
alter policy os_comentarios_auth on public.ordem_servico_comentarios using (true) with check (true);
alter policy pagamentos_authenticated_select on public.pagamentos using (true);
alter policy processos_kanban_observacoes_select on public.processos_kanban_observacoes using (true);
commit;
