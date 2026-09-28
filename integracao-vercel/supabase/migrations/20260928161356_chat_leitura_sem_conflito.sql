-- Merge only the caller's read receipt. No business rows are rewritten.
-- Existing optimistic checks, invoker security and atomic/idempotent batches remain.
DO $patch$
DECLARE original text; updated text;
BEGIN
 SELECT pg_get_functiondef('public.integracao_gravar(jsonb,uuid)'::regprocedure) INTO original;
 IF md5(original)<>'072db853f00a03f13e6261161d506aa4' THEN
   RAISE EXCEPTION 'integracao_gravar changed; review chat fix before applying';
 END IF;
 updated:=replace(original,$anchor$    FOR a IN SELECT * FROM jsonb_each(coalesce(anterior,'{}')) LOOP$anchor$,$new$    -- Read receipts are per-user, monotonic metadata, not a whole-chat edit.
    -- Preserve every other user's receipt and all non-chat optimistic checks.
    IF tabela='integracao_chat' AND chave->>'colecao'='conversas'
       AND NOT coalesce((op->>'remove')::boolean,false)
       AND jsonb_typeof(mudancas->'dados'->'lidaPor')='object'
       AND ((mudancas->'dados')-'lidaPor') IS NOT DISTINCT FROM ((anterior->'dados')-'lidaPor')
       AND jsonb_typeof(mudancas->'dados'->'lidaPor'->('erp_'||auth.uid()::text))='string' THEN
      mudancas:=jsonb_set(mudancas,'{dados}',
        (atual->'dados') || jsonb_build_object('lidaPor',
          coalesce(atual->'dados'->'lidaPor','{}'::jsonb) || jsonb_build_object(
            'erp_'||auth.uid()::text,
            CASE WHEN (atual->'dados'->'lidaPor'->>('erp_'||auth.uid()::text))::timestamptz >
                      (mudancas->'dados'->'lidaPor'->>('erp_'||auth.uid()::text))::timestamptz
              THEN atual->'dados'->'lidaPor'->('erp_'||auth.uid()::text)
              ELSE mudancas->'dados'->'lidaPor'->('erp_'||auth.uid()::text) END)));
      anterior:=jsonb_set(anterior,'{dados}',atual->'dados');
    END IF;
    FOR a IN SELECT * FROM jsonb_each(coalesce(anterior,'{}')) LOOP$new$);
 IF updated=original THEN RAISE EXCEPTION 'Chat fix anchor absent'; END IF;
 EXECUTE updated;
END $patch$;
