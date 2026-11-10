-- Content hashes are scoped to visible rows, never a privileged change feed.
CREATE FUNCTION public.integracao_carteira_delta(conhecidos jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' SET jit='off' AS $$
DECLARE resultado jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND ativo AND tipo IN ('Administrador','Diretor Técnico','Diretor de Projetos')) THEN
  RAISE EXCEPTION 'Sem permissão para consultar a carteira completa' USING ERRCODE='42501';
 END IF;
 IF conhecidos IS NULL OR jsonb_typeof(conhecidos)<>'object' OR octet_length(conhecidos::text)>5000000 THEN RAISE EXCEPTION 'Manifesto inválido' USING ERRCODE='PT422'; END IF;
 WITH linhas AS MATERIALIZED (
  SELECT 'm/'||registro_id chave,jsonb_build_object('registro_id',registro_id,'referencia_id',referencia_id,'nome',dados#>>'{requerente,nome}','telefone',dados#>>'{requerente,telefone}','status_crm',dados#>>'{requerente,statusCRM}','situacao',dados->>'situacao','municipioId',dados->>'municipioId','codigo',dados->>'codigo','arquivamento',dados#>'{extras,arquivamento}') dado FROM public.integracao_moradores WHERE colecao='processos'
  UNION ALL
  SELECT 'c/'||id::text,jsonb_build_object('id',id,'nome',nome,'codigo',codigo,'municipio_id',municipio_id,'ativo',ativo) FROM public.fin_receb_clientes
 ), versoes AS MATERIALIZED (SELECT chave,dado,md5(dado::text) versao FROM linhas)
 SELECT jsonb_build_object('manifesto',coalesce(jsonb_object_agg(chave,versao),'{}'),'alterados',coalesce(jsonb_object_agg(chave,dado) FILTER(WHERE conhecidos->>chave IS DISTINCT FROM versao),'{}')) INTO resultado FROM versoes;
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.integracao_carteira_delta(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_carteira_delta(jsonb) TO authenticated;
