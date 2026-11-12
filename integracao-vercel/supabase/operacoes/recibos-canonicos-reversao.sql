-- Revert code only. Never delete integracao_pedidos or client storage.
DO $patch$
DECLARE original text; atualizado text;
BEGIN
 SELECT pg_get_functiondef('public.integracao_gravar(jsonb,uuid)'::regprocedure) INTO original;
 atualizado:=replace(original,$new$aliases jsonb:='{}'; a record; consulta text; quantidade integer; recibo public.integracao_pedidos;
 resultados_canonicos jsonb:='[]'; imagem_canonica jsonb; campos_canonicos jsonb; indice_canonico integer:=0; leitura_canonica boolean;$new$,$old$aliases jsonb:='{}'; a record; consulta text; quantidade integer; recibo public.integracao_pedidos;$old$);
 atualizado:=replace(atualizado,$new$  -- BEGIN RECIBO_CANONICO_V1
  IF op ? 'action' AND NOT coalesce((op->>'remove')::boolean,false) THEN
   resultados_canonicos:=resultados_canonicos||jsonb_build_array(jsonb_build_object(
    'indice',indice_canonico,'tipo','acao','acao',op->>'action',
    'canonico',resultado,'versao',md5(coalesce(resultado,'null'::jsonb)::text)));
  ELSE
   imagem_canonica:=NULL;campos_canonicos:=NULL;leitura_canonica:=true;
   IF NOT coalesce((op->>'remove')::boolean,false) THEN
    -- Same invoker, RLS and locks. A hidden post-write row is unavailable,
    -- never an inferred deletion. Insert-only permissions remain supported.
    BEGIN
     EXECUTE format('SELECT to_jsonb(t) FROM public.%I t, jsonb_populate_record(NULL::public.%I,$1) k WHERE %s',tabela,tabela,filtro) INTO imagem_canonica USING chave;
    EXCEPTION WHEN insufficient_privilege THEN leitura_canonica:=false;
    END;
    IF imagem_canonica IS NULL THEN leitura_canonica:=false; END IF;
    SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) INTO campos_canonicos
     FROM jsonb_each(imagem_canonica) e
     WHERE chave ? e.key OR coalesce(op->'changes','{}'::jsonb) ? e.key
      OR e.key IN ('created_at','updated_at');
   END IF;
   resultados_canonicos:=resultados_canonicos||jsonb_build_array(jsonb_build_object(
    'indice',indice_canonico,'tipo','registro','tabela',tabela,'chave',chave,
    'removido',coalesce((op->>'remove')::boolean,false),'disponivel',leitura_canonica,
    'canonico',CASE WHEN leitura_canonica THEN campos_canonicos ELSE NULL END,
    'versao',CASE WHEN NOT leitura_canonica THEN NULL WHEN imagem_canonica IS NULL THEN md5(jsonb_build_object('tabela',tabela,'chave',chave,'removido',true)::text) ELSE md5(imagem_canonica::text) END));
  END IF;
  indice_canonico:=indice_canonico+1;
  -- END RECIBO_CANONICO_V1
 END LOOP;
 resultado:=jsonb_build_object('aliases',aliases,'protocoloRecibo',1,'pedido',pedido,
  'confirmadoEm',clock_timestamp(),'resultados',resultados_canonicos);$new$,$old$ END LOOP;
 resultado:=jsonb_build_object('aliases',aliases);$old$);
 IF atualizado=original OR md5(atualizado)<>'9afac4a610b268dec4ea50297b0b2fa3' THEN RAISE EXCEPTION 'Função mudou; revisar reversão'; END IF;
 EXECUTE atualizado;
END $patch$;
