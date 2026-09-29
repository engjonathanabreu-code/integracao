-- Transactional audit: each scenario rolls back, including receipts and revision triggers.
BEGIN;
SET LOCAL statement_timeout='55s';
DO $audit$
DECLARE usuarios jsonb; u jsonb; tabela text; cenario text; r jsonb; op jsonb; base jsonb; remoto jsonb; local jsonb;
 atual jsonb; resultado jsonb; pedido uuid; relatorio jsonb:='[]'; estado text; detalhe text; esperado text;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('id',id,'nome',nome,'ativo',ativo,'tipo',tipo,'setor',setor) ORDER BY nome)
 INTO usuarios FROM public.profiles;
 FOR u IN SELECT value FROM jsonb_array_elements(usuarios) LOOP
  PERFORM set_config('request.jwt.claim.sub',u->>'id',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF NOT (u->>'ativo')::boolean THEN
   BEGIN
    PERFORM public.integracao_gravar('[]'::jsonb,gen_random_uuid());
    estado:='falha_conta_inativa_aceita';detalhe:='';
    RAISE EXCEPTION 'rollback audit' USING ERRCODE='ZX001';
   EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
    WHEN OTHERS THEN estado:=CASE WHEN SQLERRM='Sessão inválida' THEN 'bloqueio_correto' ELSE 'erro' END;detalhe:=SQLERRM;
   END;
   relatorio:=relatorio||jsonb_build_array(jsonb_build_object('usuario',u->>'nome','tipo',u->>'tipo','cenario','conta_inativa','estado',estado,'detalhe',detalhe));
  ELSE
   FOREACH tabela IN ARRAY ARRAY['integracao_moradores','integracao_nucleos','integracao_municipios','integracao_remessas','integracao_metas','integracao_planos','integracao_ordens_servico','integracao_calendario','integracao_usuarios'] LOOP
    FOREACH cenario IN ARRAY ARRAY['sem_conflito','campos_distintos','mesmo_valor','conflito_real'] LOOP
     estado:='';detalhe:='';r:=NULL;
     BEGIN
      EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE jsonb_typeof(dados)=''object'' AND NOT dados ? ''__sync_probe'' ORDER BY colecao,registro_id LIMIT 1 FOR UPDATE',tabela) INTO r;
      IF r IS NULL THEN estado:='sem_registro_editavel';
      ELSE
       base:=r->'dados';local:=base||'{"__sync_probe":{"local":1}}'::jsonb;
       remoto:=CASE cenario WHEN 'sem_conflito' THEN base WHEN 'campos_distintos' THEN base||'{"__sync_probe":{"remote":1}}'::jsonb WHEN 'mesmo_valor' THEN local ELSE base||'{"__sync_probe":{"local":2}}'::jsonb END;
       EXECUTE format('UPDATE public.%I SET dados=$1 WHERE colecao=$2 AND registro_id=$3',tabela) USING remoto,r->>'colecao',r->>'registro_id';
       op:=jsonb_build_object('table',tabela,'key',jsonb_build_object('colecao',r->>'colecao','registro_id',r->>'registro_id'),'expected',jsonb_build_object('dados',base),'changes',jsonb_build_object('dados',local));
       pedido:=gen_random_uuid();
       resultado:=public.integracao_gravar(jsonb_build_array(op),pedido);
       IF resultado IS DISTINCT FROM public.integracao_gravar(jsonb_build_array(op),pedido) THEN RAISE EXCEPTION 'Recibo inconsistente';END IF;
       EXECUTE format('SELECT dados FROM public.%I WHERE colecao=$1 AND registro_id=$2',tabela) INTO atual USING r->>'colecao',r->>'registro_id';
       IF atual->'__sync_probe' IS DISTINCT FROM (CASE WHEN cenario='campos_distintos' THEN '{"local":1,"remote":1}'::jsonb ELSE '{"local":1}'::jsonb END) THEN RAISE EXCEPTION 'Perda de edicao'; END IF;
       estado:=CASE WHEN cenario='conflito_real' THEN 'falha_conflito_nao_bloqueado' ELSE 'ok' END;
      END IF;
      RAISE EXCEPTION 'rollback audit' USING ERRCODE='ZX001';
     EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
      WHEN OTHERS THEN estado:=CASE WHEN SQLSTATE='PT409' AND cenario='conflito_real' THEN 'bloqueio_correto' WHEN SQLSTATE='PT409' THEN 'conflito_falso' ELSE 'erro' END;detalhe:=SQLSTATE||': '||SQLERRM;
     END;
     relatorio:=relatorio||jsonb_build_array(jsonb_build_object('usuario',u->>'nome','tipo',u->>'tipo','tabela',tabela,'cenario',cenario,'estado',estado,'detalhe',detalhe));
    END LOOP;
   END LOOP;
  END IF;
  EXECUTE 'RESET ROLE';
 END LOOP;
 PERFORM set_config('audit.sync_results',relatorio::text,true);
END $audit$;
SELECT current_setting('audit.sync_results')::jsonb AS resultados;
ROLLBACK;
