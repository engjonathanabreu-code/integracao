begin;
-- Alinha as políticas com permissoes().estrutura: Comercial e Diretoria.
-- Mantém as políticas financeiras e não concede exclusão de cadastros.
create policy integracao_comercial_municipios_criar on public.fin_receb_municipios for insert to authenticated with check(integracao_crm_privado.permite('crm'));
create policy integracao_comercial_municipios_editar on public.fin_receb_municipios for update to authenticated using(integracao_crm_privado.permite('crm')) with check(integracao_crm_privado.permite('crm'));
create policy integracao_comercial_remessas_criar on public.fin_receb_remessas for insert to authenticated with check(integracao_crm_privado.permite('crm'));
create policy integracao_comercial_remessas_editar on public.fin_receb_remessas for update to authenticated using(integracao_crm_privado.permite('crm')) with check(integracao_crm_privado.permite('crm'));
grant select,insert,update on public.fin_receb_municipios,public.fin_receb_remessas to authenticated;
notify pgrst,'reload schema';
commit;
