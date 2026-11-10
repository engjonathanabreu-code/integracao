-- Additive protocol: old clients retain their existing RPC.
CREATE FUNCTION public.integracao_moradores_pagina_v2(inicio integer DEFAULT 0, revisao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' SET jit='off' AS $$
DECLARE atual text; resultado jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND ativo) THEN
  RAISE EXCEPTION 'Perfil ativo necessário' USING ERRCODE='42501';
 END IF;
 IF inicio IS NULL OR inicio<0 OR inicio%500<>0 OR inicio>1000000 THEN
  RAISE EXCEPTION 'Página inválida' USING ERRCODE='PT422';
 END IF;
 -- STABLE: version and rows share the same statement snapshot, including nested RPC.
 SELECT md5(coalesce(jsonb_object_agg(modulo,versao ORDER BY modulo),'{}')::text)
 INTO atual FROM public.integracao_revisoes;
 IF inicio>0 AND revisao IS NULL OR revisao IS NOT NULL AND revisao<>atual THEN
  RAISE EXCEPTION 'O conjunto mudou durante a leitura. Atualize e tente novamente.' USING ERRCODE='PT409';
 END IF;
 resultado:=public.integracao_moradores_carga(NULL,true,inicio);
 RETURN resultado||jsonb_build_object('revisao',atual);
END $$;
REVOKE ALL ON FUNCTION public.integracao_moradores_pagina_v2(integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_moradores_pagina_v2(integer,text) TO authenticated;
