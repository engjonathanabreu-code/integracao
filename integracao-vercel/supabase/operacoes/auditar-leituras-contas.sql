BEGIN;
SET LOCAL statement_timeout='55s';
DO $audit$
DECLARE usuarios jsonb; u jsonb; outro text; eu text; tab text; cenario text; dados jsonb; base jsonb; local jsonb; esperado jsonb;
 registro text; col text; op jsonb; request uuid; atual jsonb; relatorio jsonb:='[]'; estado text; detalhe text;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('id',id,'nome',nome) ORDER BY nome) INTO usuarios FROM public.profiles WHERE ativo;
 FOR u IN SELECT value FROM jsonb_array_elements(usuarios) LOOP
  eu:='erp_'||(u->>'id');
  SELECT 'erp_'||(value->>'id') INTO outro FROM jsonb_array_elements(usuarios) WHERE value->>'id'<>u->>'id' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',u->>'id',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOREACH tab IN ARRAY ARRAY['integracao_chat','integracao_notificacoes'] LOOP
   FOREACH cenario IN ARRAY ARRAY['leitura_desatualizada','reenvio_idempotente','conflito_conteudo'] LOOP
    estado:='';detalhe:='';
    BEGIN
     registro:=gen_random_uuid()::text; col:=CASE WHEN tab='integracao_chat' THEN 'conversas' ELSE 'notificacoes' END;
     base:=jsonb_build_object('id',registro,'titulo','Teste revertido','lidaPor',CASE WHEN tab='integracao_chat' THEN '{}'::jsonb ELSE '[]'::jsonb END);
     dados:=jsonb_set(base,'{lidaPor}',CASE WHEN tab='integracao_chat' THEN jsonb_build_object(outro,'2026-09-29T12:00:00Z') ELSE jsonb_build_array(outro) END);
     local:=jsonb_set(base,'{lidaPor}',CASE WHEN tab='integracao_chat' THEN jsonb_build_object(eu,'2026-09-29T13:00:00Z') ELSE jsonb_build_array(eu) END);
     esperado:=CASE WHEN tab='integracao_chat' THEN jsonb_build_object(outro,'2026-09-29T12:00:00Z',eu,'2026-09-29T13:00:00Z') ELSE jsonb_build_array(outro,eu) END;
     IF cenario='conflito_conteudo' THEN
      dados:=jsonb_set(dados,'{titulo}','"Outro valor"'::jsonb);
      local:=jsonb_set(local,'{titulo}','"Valor local"'::jsonb);
     END IF;
     EXECUTE format('INSERT INTO public.%I(colecao,registro_id,dados,criado_por) VALUES($1,$2,$3,$4)',tab) USING col,registro,dados,(u->>'id')::uuid;
     op:=jsonb_build_object('table',tab,'key',jsonb_build_object('colecao',col,'registro_id',registro),'expected',jsonb_build_object('dados',base),'changes',jsonb_build_object('dados',local));
     request:=gen_random_uuid();
     PERFORM public.integracao_gravar(jsonb_build_array(op),request);
     IF cenario='reenvio_idempotente' THEN PERFORM public.integracao_gravar(jsonb_build_array(op),request); END IF;
     EXECUTE format('SELECT dados FROM public.%I WHERE colecao=$1 AND registro_id=$2',tab) INTO atual USING col,registro;
     IF atual->'lidaPor' IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'Leituras divergentes'; END IF;
     estado:=CASE WHEN cenario='conflito_conteudo' THEN 'falha' ELSE 'ok' END;
     RAISE EXCEPTION 'rollback audit' USING ERRCODE='ZX001';
    EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
     WHEN OTHERS THEN estado:=CASE WHEN SQLSTATE='PT409' AND cenario='conflito_conteudo' THEN 'bloqueio_correto' ELSE 'erro' END;detalhe:=SQLSTATE||': '||SQLERRM;
    END;
    relatorio:=relatorio||jsonb_build_array(jsonb_build_object('usuario',u->>'nome','tabela',tab,'cenario',cenario,'estado',estado,'detalhe',detalhe));
   END LOOP;
  END LOOP;
  EXECUTE 'RESET ROLE';
 END LOOP;
 PERFORM set_config('audit.sync_results',relatorio::text,true);
END $audit$;
SELECT current_setting('audit.sync_results')::jsonb AS resultados;
ROLLBACK;
