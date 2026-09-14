-- Run only inside BEGIN ... ROLLBACK. These fixtures are never committed.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',(SELECT id FROM public.profiles WHERE ativo AND tipo='Administrador' LIMIT 1),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE mid uuid:=gen_random_uuid(); outcome jsonb; original jsonb; denied boolean:=false; request_id uuid:=gen_random_uuid(); batch jsonb; first_result jsonb;
BEGIN
 PERFORM set_config('integracao.test_admin',auth.uid()::text,true);
 PERFORM public.integracao_gravar(jsonb_build_array(jsonb_build_object('table','metas','key',jsonb_build_object('id',mid),'insert',true,'changes',jsonb_build_object('titulo','TESTE TRANSACIONAL INTEGRACAO','semana_inicio',current_date,'prazo',current_date+7,'status','Em andamento','associacao_tipo','avulsa','created_by',auth.uid()))));
 PERFORM public.integracao_gravar(jsonb_build_array(jsonb_build_object('table','metas','key',jsonb_build_object('id',mid),'expected',jsonb_build_object('titulo','TESTE TRANSACIONAL INTEGRACAO'),'changes',jsonb_build_object('titulo','EDICAO VALIDADA'))));
 IF NOT EXISTS(SELECT 1 FROM public.metas WHERE id=mid AND titulo='EDICAO VALIDADA') THEN RAISE EXCEPTION 'Edição falhou'; END IF;
 BEGIN
  PERFORM public.integracao_gravar(jsonb_build_array(jsonb_build_object('table','metas','key',jsonb_build_object('id',mid),'expected',jsonb_build_object('titulo','TESTE TRANSACIONAL INTEGRACAO'),'changes',jsonb_build_object('titulo','NAO DEVE SOBRESCREVER'))));
 EXCEPTION WHEN serialization_failure THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Conflito não foi bloqueado'; END IF;
 PERFORM public.integracao_gravar(jsonb_build_array(jsonb_build_object('table','integracao_complementos','key',jsonb_build_object('colecao','metas','registro_id',mid::text),'insert',true,'changes',jsonb_build_object('dados',jsonb_build_object('campoExclusivo','preservado'),'referencia_tabela','metas','referencia_id',mid,'criado_por',auth.uid()))));
 IF NOT EXISTS(SELECT 1 FROM public.integracao_complementos WHERE registro_id=mid::text AND dados->>'campoExclusivo'='preservado') THEN RAISE EXCEPTION 'Complemento não persistiu'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.integracao_gravar(jsonb_build_array(
   jsonb_build_object('table','metas','key',jsonb_build_object('id',mid),'expected',jsonb_build_object('titulo','EDICAO VALIDADA'),'changes',jsonb_build_object('titulo','LOTE QUE DEVE REVERTER')),
   jsonb_build_object('table','metas','key',jsonb_build_object('id',gen_random_uuid()),'expected','{}'::jsonb,'changes',jsonb_build_object('titulo','inexistente'))));
 EXCEPTION WHEN OTHERS THEN denied:=true;
 END;
 IF NOT denied OR NOT EXISTS(SELECT 1 FROM public.metas WHERE id=mid AND titulo='EDICAO VALIDADA') THEN RAISE EXCEPTION 'Lote não foi atômico'; END IF;
 batch:=jsonb_build_array(jsonb_build_object('action','conversa','tempId',gen_random_uuid(),'payload',jsonb_build_object('tipo','grupo','titulo','TESTE TRANSACIONAL GRUPO','participantes',jsonb_build_array(auth.uid()))));
 first_result:=public.integracao_gravar(batch,request_id);
 IF public.integracao_gravar(batch,request_id)<>first_result THEN RAISE EXCEPTION 'Repetição gerou resultado diferente'; END IF;
 IF (SELECT count(*) FROM public.erp_conversas WHERE id=(SELECT value::uuid FROM jsonb_each_text(first_result->'aliases') LIMIT 1))<>1 THEN RAISE EXCEPTION 'Grupo ausente ou duplicado'; END IF;
 denied:=false;
 BEGIN PERFORM public.integracao_gravar('[]',request_id); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Reutilização indevida de pedido aceita'; END IF;
 IF has_function_privilege('anon','public.integracao_gravar(jsonb,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Acesso anônimo indevido'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',(SELECT id FROM public.profiles WHERE ativo AND tipo='Topografia' LIMIT 1),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false;
BEGIN
 IF public.integracao_acesso('profiles',current_setting('integracao.test_admin')::uuid,auth.uid()) THEN RAISE EXCEPTION 'Perfil privado exposto'; END IF;
 BEGIN
  INSERT INTO public.integracao_complementos(colecao,registro_id,dados,referencia_tabela) VALUES('config',gen_random_uuid()::text,'{}','integracao_config');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Usuário comum alterou configuração administrativa'; END IF;
END $$;
RESET ROLE;
SELECT 'Gravação, proteção contra conflito, complemento e atomicidade validados; fixtures serão revertidas.' as resultado;
