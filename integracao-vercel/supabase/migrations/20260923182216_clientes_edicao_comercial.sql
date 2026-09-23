-- Clientes é um cadastro compartilhado, independente da carteira do CRM.
-- A interface já permite edição cadastral/comercial ao perfil Comercial ativo.
-- O SELECT ... FOR UPDATE de integracao_gravar também exige uma política UPDATE.
-- Mantém RLS, políticas existentes, checagem de perfil ativo e controle de conflitos.
create policy integracao_comercial_moradores_editar
on public.fin_receb_clientes
for update to authenticated
using ((select public.is_comercial()))
with check ((select public.is_comercial()));
