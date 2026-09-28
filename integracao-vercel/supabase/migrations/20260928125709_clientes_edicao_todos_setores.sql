-- Cadastros compartilhados: usuários ativos de todos os setores podem editar.
-- Não altera INSERT/DELETE, funções administrativas ou políticas financeiras.
create policy integracao_setores_cadastro_editar
on public.fin_receb_clientes
for update to authenticated
using (exists (select 1 from public.profiles where id = (select auth.uid()) and ativo))
with check (exists (select 1 from public.profiles where id = (select auth.uid()) and ativo));

create policy integracao_setores_cadastro_editar
on public.fin_receb_municipios
for update to authenticated
using (exists (select 1 from public.profiles where id = (select auth.uid()) and ativo))
with check (exists (select 1 from public.profiles where id = (select auth.uid()) and ativo));

create policy integracao_setores_cadastro_editar
on public.fin_receb_remessas
for update to authenticated
using (exists (select 1 from public.profiles where id = (select auth.uid()) and ativo))
with check (exists (select 1 from public.profiles where id = (select auth.uid()) and ativo));
