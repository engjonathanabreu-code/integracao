begin;
-- Same predicates, evaluated once per statement instead of per row.
alter policy "fin_receb_clientes_admin_financeiro" on public."fin_receb_clientes" using ((select public.can_access_fin_recebimentos())) with check ((select public.can_access_fin_recebimentos()));
alter policy "integracao_comercial_moradores_ler" on public."fin_receb_clientes" using (( SELECT (select public.is_comercial()) AS is_comercial));
alter policy "integracao_crm_clientes_criar" on public."fin_receb_clientes" with check ((select integracao_crm_privado.permite('crm'::text)));
alter policy "integracao_crm_clientes_editar" on public."fin_receb_clientes" using (((select integracao_crm_privado.permite('admin'::text)) OR (EXISTS ( SELECT 1
   FROM integracao_crm_cards c
  WHERE (c.cliente_id = fin_receb_clientes.id))))) with check (((select integracao_crm_privado.permite('admin'::text)) OR (EXISTS ( SELECT 1
   FROM integracao_crm_cards c
  WHERE (c.cliente_id = fin_receb_clientes.id)))));
alter policy "integracao_crm_clientes_ler" on public."fin_receb_clientes" using (((select integracao_crm_privado.permite('admin'::text)) OR (EXISTS ( SELECT 1
   FROM integracao_crm_cards c
  WHERE (c.cliente_id = fin_receb_clientes.id)))));
alter policy "fin_receb_municipios_admin_financeiro" on public."fin_receb_municipios" using ((select public.can_access_fin_recebimentos())) with check ((select public.can_access_fin_recebimentos()));
alter policy "integracao_comercial_municipios_criar" on public."fin_receb_municipios" with check ((select integracao_crm_privado.permite('crm'::text)));
alter policy "integracao_comercial_municipios_editar" on public."fin_receb_municipios" using ((select integracao_crm_privado.permite('crm'::text))) with check ((select integracao_crm_privado.permite('crm'::text)));
alter policy "integracao_modulos_municipios_ler" on public."fin_receb_municipios" using (((select integracao_crm_privado.permite('crm'::text)) OR (select integracao_crm_privado.permite('semanal'::text)) OR (select integracao_crm_privado.permite('marketing'::text))));
alter policy "fin_receb_remessas_admin_financeiro" on public."fin_receb_remessas" using ((select public.can_access_fin_recebimentos())) with check ((select public.can_access_fin_recebimentos()));
alter policy "integracao_comercial_remessas_criar" on public."fin_receb_remessas" with check ((select integracao_crm_privado.permite('crm'::text)));
alter policy "integracao_comercial_remessas_editar" on public."fin_receb_remessas" using ((select integracao_crm_privado.permite('crm'::text))) with check ((select integracao_crm_privado.permite('crm'::text)));
alter policy "integracao_modulos_remessas_ler" on public."fin_receb_remessas" using (((select integracao_crm_privado.permite('crm'::text)) OR (select integracao_crm_privado.permite('semanal'::text)) OR (select integracao_crm_privado.permite('marketing'::text))));
alter policy cards_ler on public.integracao_crm_cards using ((select integracao_crm_privado.permite('crm')) and (responsavel_id=(select auth.uid()) or (select integracao_crm_privado.permite('admin'))));
alter policy "erp_admin_full_access" on public."profiles" using ((select public.is_erp_admin())) with check ((select public.is_erp_admin()));
alter policy "profiles_admin_all" on public."profiles" using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "profiles_comercial_select" on public."profiles" using (((select public.is_comercial()) AND (ativo = true)));
alter policy "profiles_projects_director_select" on public."profiles" using (((select public.is_projects_director()) AND (ativo = true) AND (lower(TRIM(BOTH FROM COALESCE(setor, ''::text))) = ANY (ARRAY['projetos'::text, 'topografia'::text, 'pós-protocolo'::text, 'pos-protocolo'::text, 'pós protocolo'::text, 'pos protocolo'::text]))));
alter policy "profiles_read_self" on public."profiles" using (((id = ( SELECT auth.uid() AS uid)) AND (ativo = true)));
alter policy "profiles_tech_director_select" on public."profiles" using (((select public.is_tech_director()) AND (ativo = true)));
commit;

