-- Read-only regression test: all temporary data is rolled back.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE access_cases(referencia_tabela text,referencia_id uuid,criado_por uuid);
INSERT INTO access_cases SELECT 'processos_kanban',id,NULL FROM public.processos_kanban LIMIT 2;
INSERT INTO access_cases SELECT 'metas',id,NULL FROM public.metas LIMIT 2;
INSERT INTO access_cases SELECT 'ordens_servico',id,NULL FROM public.ordens_servico LIMIT 2;
INSERT INTO access_cases SELECT 'planos_trabalho',id,NULL FROM public.planos_trabalho LIMIT 2;
INSERT INTO access_cases SELECT 'erp_eventos',id,NULL FROM public.erp_eventos LIMIT 2;
INSERT INTO access_cases SELECT 'erp_conversas',id,NULL FROM public.erp_conversas LIMIT 2;
INSERT INTO access_cases SELECT 'profiles',id,NULL FROM public.profiles LIMIT 2;
INSERT INTO access_cases SELECT 'fin_receb_municipios',id,NULL FROM public.fin_receb_municipios LIMIT 2;
INSERT INTO access_cases SELECT 'fin_receb_remessas',id,NULL FROM public.fin_receb_remessas LIMIT 2;
INSERT INTO access_cases SELECT 'fin_receb_clientes',id,NULL FROM public.fin_receb_clientes LIMIT 2;
INSERT INTO access_cases SELECT 'meta_setores',id,NULL FROM public.meta_setores LIMIT 2;
INSERT INTO access_cases SELECT 'erp_agendas',id,NULL FROM public.erp_agendas LIMIT 2;
INSERT INTO access_cases SELECT t,id,dono FROM unnest(ARRAY['processos_kanban','metas','ordens_servico','planos_trabalho','erp_eventos','erp_conversas','profiles','fin_receb_municipios','fin_receb_remessas','fin_receb_clientes','meta_setores','erp_agendas','integracao_config','invalida',NULL]::text[])t CROSS JOIN unnest(ARRAY['00000000-0000-0000-0000-000000000000'::uuid,NULL])id CROSS JOIN unnest(ARRAY[(SELECT id FROM public.profiles WHERE ativo AND tipo='Administrador' ORDER BY id LIMIT 1),NULL])dono;
GRANT SELECT ON access_cases TO authenticated;
CREATE TEMP TABLE access_results(tipo text,cases bigint,differences bigint);
GRANT INSERT ON access_results TO authenticated;
DO $test$
DECLARE account record;
BEGIN
 FOR account IN SELECT DISTINCT ON (tipo,ativo) id,tipo,ativo FROM public.profiles ORDER BY tipo,ativo,id LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',account.id,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  INSERT INTO access_results SELECT account.tipo||':'||account.ativo,count(*),count(*) FILTER (WHERE coalesce(public.integracao_acesso(referencia_tabela,referencia_id,criado_por),false) IS DISTINCT FROM coalesce((EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
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
END),false)) FROM access_cases;
  RESET ROLE;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}',true);
 SET LOCAL ROLE authenticated;
 INSERT INTO access_results SELECT 'sem_perfil',count(*),count(*) FILTER (WHERE coalesce(public.integracao_acesso(referencia_tabela,referencia_id,criado_por),false) IS DISTINCT FROM coalesce((EXISTS(SELECT 1 FROM public.profiles AS perfil WHERE perfil.id=(SELECT auth.uid()) AND perfil.ativo)
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
END),false)) FROM access_cases;
 RESET ROLE;
END $test$;
SELECT * FROM access_results;

DO $assert$ BEGIN IF EXISTS(SELECT 1 FROM access_results WHERE differences<>0) THEN RAISE EXCEPTION 'A otimização alterou uma decisão de acesso'; END IF; END $assert$;
ROLLBACK;
