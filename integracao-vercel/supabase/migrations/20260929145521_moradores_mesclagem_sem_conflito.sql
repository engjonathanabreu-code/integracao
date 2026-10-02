-- Merge compatible resident edits under the existing row lock and caller RLS.
-- Missing keys (SQL NULL) remain distinct from explicit JSON null. Arrays are atomic.
CREATE OR REPLACE FUNCTION public.integracao_mesclar_json_seguro(base jsonb, local jsonb, remoto jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE campo text; valor jsonb; resultado jsonb := '{}';
BEGIN
 IF local IS NOT DISTINCT FROM base THEN RETURN remoto; END IF;
 IF remoto IS NOT DISTINCT FROM base OR local IS NOT DISTINCT FROM remoto THEN RETURN local; END IF;
 IF (jsonb_typeof(base)='object' OR base IS NULL)
    AND jsonb_typeof(local)='object' AND jsonb_typeof(remoto)='object' THEN
  FOR campo IN SELECT jsonb_object_keys(local) UNION SELECT jsonb_object_keys(remoto) LOOP
   valor := public.integracao_mesclar_json_seguro(base->campo,local->campo,remoto->campo);
   IF valor IS NOT NULL THEN resultado := resultado || jsonb_build_object(campo,valor); END IF;
  END LOOP;
  RETURN resultado;
 END IF;
 RAISE EXCEPTION 'Conflito em integracao_moradores. O mesmo campo recebeu alterações diferentes. Sua edição foi preservada para revisão.' USING ERRCODE='PT409';
END $$;
REVOKE ALL ON FUNCTION public.integracao_mesclar_json_seguro(jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integracao_mesclar_json_seguro(jsonb,jsonb,jsonb) TO authenticated;

DO $patch$
DECLARE original text; updated text;
BEGIN
 SELECT pg_get_functiondef('public.integracao_gravar(jsonb,uuid)'::regprocedure) INTO original;
 IF md5(original)<>'5878fa4dd9f483803e355508870fa5ef' THEN
  RAISE EXCEPTION 'integracao_gravar changed; review resident merge before applying';
 END IF;
 updated:=replace(original,$anchor$    FOR a IN SELECT * FROM jsonb_each(coalesce(anterior,'{}')) LOOP$anchor$,$new$    -- Compare edited JSON fields, not the entire resident document.
    -- Inserts/deletes and other columns retain their original optimistic checks.
    IF tabela='integracao_moradores' AND chave->>'colecao'='processos'
       AND NOT coalesce((op->>'remove')::boolean,false)
       AND jsonb_typeof(anterior->'dados')='object'
       AND jsonb_typeof(mudancas->'dados')='object'
       AND jsonb_typeof(atual->'dados')='object' THEN
      mudancas:=jsonb_set(mudancas,'{dados}',public.integracao_mesclar_json_seguro(
        anterior->'dados',mudancas->'dados',atual->'dados'));
      anterior:=jsonb_set(anterior,'{dados}',atual->'dados');
    END IF;
    FOR a IN SELECT * FROM jsonb_each(coalesce(anterior,'{}')) LOOP$new$);
 IF updated=original THEN RAISE EXCEPTION 'Resident merge anchor absent'; END IF;
 EXECUTE updated;
END $patch$;
