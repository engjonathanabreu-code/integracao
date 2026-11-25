-- Reversão de supabase/migrations/20261125190000_clientes_edicao_sem_perfil_consulta.sql.
-- Restaura a definição de 20260928125709_clientes_edicao_todos_setores.sql (qualquer perfil ativo).
begin;
alter policy integracao_setores_cadastro_editar on public.fin_receb_clientes
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and ativo))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and ativo));
commit;
