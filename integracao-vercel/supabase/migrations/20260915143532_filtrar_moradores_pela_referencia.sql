-- Read-only, caller permissions and existing RLS apply to both sources.
CREATE OR REPLACE FUNCTION public.integracao_moradores_carga(municipio text DEFAULT NULL, resumo boolean DEFAULT true, inicio integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' SET jit = off AS $fn$
DECLARE clientes jsonb; complementos jsonb; total bigint;
BEGIN
 IF NOT resumo AND municipio IS NULL THEN RAISE EXCEPTION 'Informe o município para abrir os moradores'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND ativo) THEN RAISE EXCEPTION 'Perfil ativo necessário' USING ERRCODE='42501'; END IF;
 IF inicio=0 THEN
 SELECT coalesce(jsonb_agg(CASE WHEN resumo THEN jsonb_build_object('id',c.id,'municipio_id',c.municipio_id,'remessa_id',c.remessa_id,'codigo',c.codigo,'nome',c.nome,'cpf_cnpj',c.cpf_cnpj,'ativo',c.ativo) ELSE to_jsonb(c) END ORDER BY c.id),'[]'::jsonb)
 INTO clientes FROM public.fin_receb_clientes c WHERE municipio IS NULL OR c.municipio_id::text=municipio;
 ELSE clientes='[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(CASE WHEN resumo THEN jsonb_build_object('colecao',e.colecao,'registro_id',e.registro_id,'referencia_id',e.referencia_id,'dados',
   public.integracao_pendencias_insumos(e.dados)
   ) ELSE to_jsonb(e) END ORDER BY e.registro_id),'[]'::jsonb)
 INTO complementos FROM (SELECT * FROM public.integracao_moradores e
 WHERE e.colecao='processos' AND (municipio IS NULL OR e.referencia_id IN (SELECT c.id FROM public.fin_receb_clientes c WHERE c.municipio_id::text=municipio) OR (e.referencia_id IS NULL AND e.dados->>'municipioId'=municipio)) ORDER BY e.registro_id LIMIT 500 OFFSET greatest(inicio,0))e;
 IF inicio=0 THEN SELECT count(*) INTO total FROM public.integracao_moradores e WHERE e.colecao='processos' AND (municipio IS NULL OR e.referencia_id IN (SELECT c.id FROM public.fin_receb_clientes c WHERE c.municipio_id::text=municipio) OR (e.referencia_id IS NULL AND e.dados->>'municipioId'=municipio)); END IF;
 RETURN jsonb_build_object('clientes',clientes,'complementos',complementos,'total',total);
END $fn$;
REVOKE ALL ON FUNCTION public.integracao_moradores_carga(text,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_moradores_carga(text,boolean,integer) TO authenticated;
