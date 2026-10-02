-- Safe three-way reconciliation for every shared row, retaining row locks and RLS.
CREATE OR REPLACE FUNCTION public.integracao_mesclar_json_seguro(base jsonb, local jsonb, remoto jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE campo text; valor jsonb; resultado jsonb := '{}'; identificador jsonb; b jsonb; l jsonb; r jsonb;
BEGIN
 IF local IS NOT DISTINCT FROM base THEN RETURN remoto; END IF;
 IF remoto IS NOT DISTINCT FROM base OR local IS NOT DISTINCT FROM remoto THEN RETURN local; END IF;
 IF (jsonb_typeof(base)='object' OR base IS NULL)
    AND jsonb_typeof(local)='object' AND jsonb_typeof(remoto)='object' THEN
  FOR campo IN SELECT jsonb_object_keys(coalesce(base,'{}')) UNION SELECT jsonb_object_keys(local) UNION SELECT jsonb_object_keys(remoto) LOOP
   valor := public.integracao_mesclar_json_seguro(base->campo,local->campo,remoto->campo);
   IF valor IS NOT NULL THEN resultado := resultado || jsonb_build_object(campo,valor); END IF;
  END LOOP;
  RETURN resultado;
 END IF;
 -- Only lists with unique, stable string IDs are merged by item. Ordered scalar
 -- lists stay atomic: merging arbitrary arrays would invent domain semantics.
 IF jsonb_typeof(base)='array' AND jsonb_typeof(local)='array' AND jsonb_typeof(remoto)='array'
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(base||local||remoto) e
                    WHERE jsonb_typeof(e)<>'object' OR jsonb_typeof(e->'id') IS DISTINCT FROM 'string')
    AND (SELECT count(*)=count(DISTINCT e->'id') FROM jsonb_array_elements(base) e)
    AND (SELECT count(*)=count(DISTINCT e->'id') FROM jsonb_array_elements(local) e)
    AND (SELECT count(*)=count(DISTINCT e->'id') FROM jsonb_array_elements(remoto) e) THEN
  resultado:='[]';
  FOR identificador IN SELECT e->'id' FROM jsonb_array_elements(remoto||local) WITH ORDINALITY x(e,pos)
                       GROUP BY e->'id' ORDER BY min(pos) LOOP
   SELECT e INTO b FROM jsonb_array_elements(base) e WHERE e->'id'=identificador;
   SELECT e INTO l FROM jsonb_array_elements(local) e WHERE e->'id'=identificador;
   SELECT e INTO r FROM jsonb_array_elements(remoto) e WHERE e->'id'=identificador;
   valor:=public.integracao_mesclar_json_seguro(b,l,r);
   IF valor IS NOT NULL THEN resultado:=resultado||jsonb_build_array(valor); END IF;
  END LOOP;
  RETURN resultado;
 END IF;
 RAISE EXCEPTION 'O mesmo campo recebeu alterações diferentes.' USING ERRCODE='PT409';
END $$;
REVOKE ALL ON FUNCTION public.integracao_mesclar_json_seguro(jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integracao_mesclar_json_seguro(jsonb,jsonb,jsonb) TO authenticated;

DO $patch$
DECLARE original text; atualizado text; inicio integer; fim integer;
BEGIN
 SELECT pg_get_functiondef('public.integracao_gravar(jsonb,uuid)'::regprocedure) INTO original;
 IF md5(original)<>'76b2c115d4ee7861a605085eeaae6893' THEN
  RAISE EXCEPTION 'integracao_gravar changed; review global reconciliation before applying';
 END IF;
 inicio:=position('    -- Compare edited JSON fields' in original);
 fim:=position('    END LOOP;' in substring(original FROM inicio));
 IF inicio=0 OR fim=0 THEN RAISE EXCEPTION 'Reconciliation anchor absent'; END IF;
 atualizado:=overlay(original placing $new$    -- A repeated completion has one result. Keep the first recorded author/time.
    IF tabela='meta_checklist' AND NOT coalesce((op->>'remove')::boolean,false)
       AND mudancas ? 'concluido' AND (atual->'concluido') IS NOT DISTINCT FROM (mudancas->'concluido')
       AND (anterior->'concluido') IS DISTINCT FROM (mudancas->'concluido') THEN
      mudancas:=mudancas-'concluido_em'-'concluido_por';
      anterior:=anterior-'concluido_em'-'concluido_por';
    END IF;
    FOR a IN SELECT * FROM jsonb_each(coalesce(anterior,'{}')) LOOP
     IF (atual->a.key) IS DISTINCT FROM a.value THEN
      IF NOT coalesce((op->>'remove')::boolean,false) AND mudancas ? a.key THEN
       BEGIN
        mudancas:=jsonb_set(mudancas,ARRAY[a.key],public.integracao_mesclar_json_seguro(
          a.value,mudancas->a.key,atual->a.key));
       EXCEPTION WHEN SQLSTATE 'PT409' THEN
        RAISE EXCEPTION 'Alterações diferentes em %. Revise o campo % para continuar.',tabela,a.key
          USING ERRCODE='PT409',DETAIL=jsonb_build_object('tabela',tabela,'chave',chave,'campo',a.key)::text;
       END;
      ELSE
       RAISE EXCEPTION 'O registro mudou antes da exclusão ou alteração em %.',tabela USING ERRCODE='PT409';
      END IF;
     END IF;
    END LOOP;$new$ from inicio for fim+length('    END LOOP;')-1);
 -- Concurrent creation of the same complement is reconciled too. Conflict
 -- handling targets only the primary key; other unique constraints still fail.
 atualizado:=replace(atualizado,
 $old$    consulta:=format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r',tabela,colunas,valores,tabela);
    EXECUTE consulta USING mudancas;$old$,
 $new$    consulta:=format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r ON CONFLICT (%s) DO NOTHING',tabela,colunas,valores,tabela,
      (SELECT string_agg(format('%I',x),',') FROM unnest(pk) x));
    EXECUTE consulta USING mudancas;
    GET DIAGNOSTICS quantidade=ROW_COUNT;
    IF quantidade=0 THEN
     EXECUTE format('SELECT to_jsonb(t) FROM public.%I t, jsonb_populate_record(NULL::public.%I,$1) k WHERE %s FOR UPDATE OF t',tabela,tabela,filtro) INTO atual USING chave;
     IF atual IS NULL THEN RAISE EXCEPTION 'Registro indisponível ou sem permissão: %',tabela; END IF;
     EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::public.%I,$1))',tabela) INTO resultado USING mudancas;
     FOR a IN SELECT * FROM jsonb_each(mudancas) LOOP
      IF a.key IN ('created_by','criado_por','created_at','updated_at') THEN CONTINUE; END IF;
      BEGIN
       mudancas:=jsonb_set(mudancas,ARRAY[a.key],public.integracao_mesclar_json_seguro(
        CASE WHEN a.key='dados' THEN '{}'::jsonb ELSE NULL::jsonb END,resultado->a.key,atual->a.key));
      EXCEPTION WHEN SQLSTATE 'PT409' THEN
       RAISE EXCEPTION 'O item já foi criado com outro valor em %. Revise o campo %.',tabela,a.key USING ERRCODE='PT409';
      END;
     END LOOP;
     mudancas:=mudancas-'created_by'-'criado_por'-'created_at'-'updated_at'-'referencia_tabela'-'referencia_id';
     FOREACH colunas IN ARRAY pk LOOP mudancas:=mudancas-colunas; END LOOP;
     IF mudancas<>'{}' AND NOT atual @> mudancas THEN
      SELECT string_agg(format('%I=r.%I',key,key),',') INTO atribuicoes FROM jsonb_each(mudancas);
      EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r, jsonb_populate_record(NULL::public.%I,$2) k WHERE %s',tabela,atribuicoes,tabela,tabela,filtro) USING mudancas,chave;
      GET DIAGNOSTICS quantidade=ROW_COUNT;
      IF quantidade<>1 THEN RAISE EXCEPTION 'Gravação não autorizada'; END IF;
     END IF;
    END IF;$new$);
 IF position('ON CONFLICT (%s) DO NOTHING' in atualizado)=0 THEN RAISE EXCEPTION 'Concurrent insert anchor absent'; END IF;
 EXECUTE atualizado;
END $patch$;

