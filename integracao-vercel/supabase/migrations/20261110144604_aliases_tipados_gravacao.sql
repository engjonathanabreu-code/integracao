-- Pure identifier mapping; preserves free text and array order.
CREATE FUNCTION public.integracao_remap_identidades(valor jsonb,aliases jsonb,campo text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE resultado jsonb; k text; v jsonb; destino text;
BEGIN
 IF jsonb_typeof(valor)='string' AND campo=ANY(ARRAY['id','erpId','erpRef','financeiroRef','registro_id','referencia_id','tempId','usuarioId','usuario_id','autorId','autor_id','created_by','criado_por','criadoPor','concluido_por','enviado_por','municipioId','municipio_id','remessaId','remessa_id','nucleoId','nucleo_id','processoId','processo_id','metaId','meta_id','planoId','plano_id','etapaId','etapa_id','eventoId','evento_id','agendaId','agenda_id','conversaId','conversa_id','entidade_id','associacao_id','integracao_nucleo_id','kanbanId','responsaveis','participantes','comerciais_adicionais','responsaveis_ids','lidaPor']) THEN
  RETURN coalesce(aliases->(valor#>>'{}'),valor);
 ELSIF jsonb_typeof(valor)='array' THEN
  SELECT coalesce(jsonb_agg(public.integracao_remap_identidades(e,aliases,campo) ORDER BY ordem),'[]'::jsonb) INTO resultado FROM jsonb_array_elements(valor) WITH ORDINALITY AS x(e,ordem);
  RETURN resultado;
 ELSIF jsonb_typeof(valor)='object' THEN
  resultado:='{}';
  FOR k,v IN SELECT * FROM jsonb_each(valor) LOOP
   destino:=CASE WHEN campo=ANY(ARRAY['lidaPor','ultimaLeitura','respostas']) THEN coalesce(aliases->>k,k) ELSE k END;
   resultado:=resultado||jsonb_build_object(destino,public.integracao_remap_identidades(v,aliases,k));
  END LOOP;
  RETURN resultado;
 END IF;
 RETURN valor;
END $$;
REVOKE ALL ON FUNCTION public.integracao_remap_identidades(jsonb,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_remap_identidades(jsonb,jsonb,text) TO authenticated,service_role;
DO $patch$
DECLARE original text; atualizado text;
BEGIN
 SELECT pg_get_functiondef('public.integracao_gravar(jsonb,uuid)'::regprocedure) INTO original;
 IF md5(original)<>'af3701624cb93df9f3090092bbf38142' THEN RAISE EXCEPTION 'integracao_gravar mudou; revisar a migration antes de aplicar'; END IF;
 atualizado:=replace(original,$old$  FOR a IN SELECT * FROM jsonb_each_text(aliases) LOOP
   op:=replace(op::text,to_jsonb(a.key)::text,to_jsonb(a.value)::text)::jsonb;
  END LOOP;$old$,$new$  op:=public.integracao_remap_identidades(op,aliases);$new$);
 IF atualizado=original THEN RAISE EXCEPTION 'Âncora de aliases ausente'; END IF;
 EXECUTE atualizado;
END $patch$;
