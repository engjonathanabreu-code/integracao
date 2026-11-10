-- Read-only receipt lookup with the same payload identity as integracao_gravar.
CREATE FUNCTION public.integracao_consultar_pedido(operacoes jsonb,pedido uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE recibo public.integracao_pedidos;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND ativo) THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(operacoes)<>'array' OR jsonb_array_length(operacoes)>1000 OR pedido IS NULL THEN RAISE EXCEPTION 'Pedido inválido' USING ERRCODE='22023'; END IF;
 SELECT * INTO recibo FROM public.integracao_pedidos r WHERE r.usuario_id=auth.uid() AND r.pedido=integracao_consultar_pedido.pedido;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF recibo.resumo<>md5(operacoes::text) THEN RAISE EXCEPTION 'Pedido já utilizado para outra alteração' USING ERRCODE='PT409'; END IF;
 RETURN recibo.resultado;
END $$;
REVOKE ALL ON FUNCTION public.integracao_consultar_pedido(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_consultar_pedido(jsonb,uuid) TO authenticated;
