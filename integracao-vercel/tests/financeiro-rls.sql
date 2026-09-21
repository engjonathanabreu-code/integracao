BEGIN;
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE fin_test_users(id uuid,tipo text);
INSERT INTO fin_test_users VALUES(gen_random_uuid(),'Financeiro'),(gen_random_uuid(),'Topografia');
INSERT INTO auth.users(id) SELECT id FROM fin_test_users;
INSERT INTO public.profiles(id,nome,tipo,setor,ativo) SELECT id,'Teste temporário Financeiro',tipo,tipo,true FROM fin_test_users ON CONFLICT(id) DO UPDATE SET tipo=excluded.tipo,setor=excluded.setor,ativo=true;
GRANT SELECT ON fin_test_users TO authenticated;
CREATE TEMP TABLE fin_results(teste text,ok boolean);
GRANT ALL ON fin_results TO authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM fin_test_users WHERE tipo='Financeiro'),true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE pl uuid; et uuid; ev uuid; chat uuid; msg uuid; n integer;
BEGIN
 INSERT INTO public.planos_trabalho(titulo) VALUES('Teste temporário Financeiro') RETURNING id INTO pl;
 INSERT INTO public.etapas_plano(plano_id,titulo) VALUES(pl,'Etapa temporária') RETURNING id INTO et;
 INSERT INTO public.etapa_responsaveis(etapa_id,usuario_id) VALUES(et,auth.uid());
 INSERT INTO public.entregaveis(etapa_id,titulo) VALUES(et,'Entrega temporária');
 UPDATE public.entregaveis SET concluido=true,concluido_por=auth.uid(),concluido_em=now() WHERE etapa_id=et;
 GET DIAGNOSTICS n=ROW_COUNT; INSERT INTO fin_results VALUES('Financeiro conclui entregável',n=1);
 UPDATE public.etapas_plano SET titulo='Etapa atualizada' WHERE id=et;
 GET DIAGNOSTICS n=ROW_COUNT; INSERT INTO fin_results VALUES('Financeiro atualiza etapa',n=1);
 INSERT INTO public.comentarios_plano(plano_id,autor_id,texto) VALUES(pl,auth.uid(),'Comentário temporário');
 INSERT INTO fin_results SELECT 'Financeiro lê plano',EXISTS(SELECT 1 FROM public.planos_trabalho WHERE id=pl);
 INSERT INTO fin_results SELECT 'Financeiro lê clientes',count(*)>0 FROM public.fin_receb_clientes;
 INSERT INTO fin_results SELECT 'Financeiro não administra',NOT public.is_admin();
 ev := (public.erp_collab_action('evento',jsonb_build_object('titulo','Evento temporário','inicio','2026-10-01T10:00:00Z','fim','2026-10-01T11:00:00Z'))->>'id')::uuid;
 INSERT INTO fin_results SELECT 'Financeiro cria e lê evento',EXISTS(SELECT 1 FROM public.erp_eventos WHERE id=ev);
 chat := (public.erp_collab_action('conversa',jsonb_build_object('tipo','direto','participantes',jsonb_build_array((SELECT id FROM fin_test_users WHERE tipo='Topografia'))))->>'id')::uuid;
 msg := (public.erp_collab_action('mensagem',jsonb_build_object('conversa_id',chat,'texto','Teste temporário, rollback'))->>'id')::uuid;
 INSERT INTO fin_results SELECT 'Financeiro cria conversa e mensagem',EXISTS(SELECT 1 FROM public.erp_mensagens WHERE id=msg);
 DELETE FROM public.planos_trabalho WHERE id=pl; GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO fin_results VALUES('Financeiro remove plano temporário',n=1);
END $test$;
RESET ROLE;
UPDATE public.profiles SET ativo=false WHERE id=(SELECT id FROM fin_test_users WHERE tipo='Financeiro');
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 BEGIN
  INSERT INTO public.planos_trabalho(titulo) VALUES('Não deve persistir');
  INSERT INTO fin_results VALUES('Financeiro inativo bloqueado',false);
 EXCEPTION WHEN insufficient_privilege THEN INSERT INTO fin_results VALUES('Financeiro inativo bloqueado',true);
 END;
END $test$;
RESET ROLE;
DO $check$ BEGIN IF EXISTS(SELECT 1 FROM fin_results WHERE NOT ok) THEN RAISE EXCEPTION 'Falha na matriz Financeiro'; END IF; END $check$;
SELECT * FROM fin_results;
ROLLBACK;
