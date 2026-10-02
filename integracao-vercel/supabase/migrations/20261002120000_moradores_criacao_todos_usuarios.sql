-- Moradores já permitem SELECT/UPDATE a todos os perfis ativos.
-- A criação passa a seguir a mesma autorização, sem ampliar DELETE ou administração.
create policy integracao_setores_moradores_criar
on public.fin_receb_clientes
for insert to authenticated
with check (exists (
  select 1 from public.profiles where id = (select auth.uid()) and ativo
));
