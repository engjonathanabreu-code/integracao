-- Merge only the authenticated caller's notification read marker.
-- No stored rows, grants, RLS policies or business conflict checks are changed.
DO $patch$
DECLARE original text; updated text;
BEGIN
 SELECT pg_get_functiondef('public.integracao_gravar(jsonb,uuid)'::regprocedure) INTO original;
 IF md5(original)<>'99a3a5f234c1c0fcb82f248e7c4e1a35' THEN
  RAISE EXCEPTION 'integracao_gravar changed; review notification fix before applying';
 END IF;
 updated:=replace(original,$anchor$    FOR a IN SELECT * FROM jsonb_each(coalesce(anterior,'{}')) LOOP$anchor$,$new$    -- A read marker is additive and owned by the caller, even from a stale draft.
    IF tabela='integracao_notificacoes' AND chave->>'colecao'='notificacoes'
       AND NOT coalesce((op->>'remove')::boolean,false)
       AND jsonb_typeof(mudancas->'dados'->'lidaPor')='array'
       AND jsonb_typeof(atual->'dados'->'lidaPor')='array'
       AND ((mudancas->'dados')-'lidaPor') IS NOT DISTINCT FROM ((anterior->'dados')-'lidaPor')
       AND (mudancas->'dados'->'lidaPor') @> jsonb_build_array('erp_'||auth.uid()::text) THEN
      mudancas:=jsonb_set(mudancas,'{dados}',
        (atual->'dados') || jsonb_build_object('lidaPor',
          CASE WHEN (atual->'dados'->'lidaPor') @> jsonb_build_array('erp_'||auth.uid()::text)
            THEN atual->'dados'->'lidaPor'
            ELSE (atual->'dados'->'lidaPor') || jsonb_build_array('erp_'||auth.uid()::text) END));
      anterior:=jsonb_set(anterior,'{dados}',atual->'dados');
    END IF;
    FOR a IN SELECT * FROM jsonb_each(coalesce(anterior,'{}')) LOOP$new$);
 IF updated=original THEN RAISE EXCEPTION 'Notification fix anchor absent'; END IF;
 EXECUTE updated;
END $patch$;
