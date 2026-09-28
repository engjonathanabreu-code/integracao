-- Núcleos já permitem INSERT a todos os perfis ativos em processos_kanban.
-- Remessas passam a seguir a mesma autorização, sem ampliar DELETE ou administração.
create policy integracao_setores_remessas_criar
on public.fin_receb_remessas
for insert to authenticated
with check (exists (
  select 1 from public.profiles where id = (select auth.uid()) and ativo
));
