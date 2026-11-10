-- Explicit per-item recovery only. No historical row is approved by this migration.
CREATE TABLE integracao_envios_privado.revisoes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 envio_id uuid NOT NULL REFERENCES integracao_envios_privado.outbox(id),
 acao text NOT NULL CHECK(acao IN ('confirmar_recibo','retomar_recusado')),
 evidencia_hash text NOT NULL CHECK(length(evidencia_hash)=64),
 recibo text, criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE integracao_envios_privado.revisoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON integracao_envios_privado.revisoes TO service_role;
GRANT USAGE ON SEQUENCE integracao_envios_privado.revisoes_id_seq TO service_role;
CREATE FUNCTION public.integracao_envios_previa(p_ids uuid[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('versao',md5(to_jsonb(o)::text))),'[]'::jsonb)
 FROM integracao_envios_privado.outbox o WHERE o.id=ANY(p_ids) AND cardinality(p_ids)<=20;
$$;
CREATE FUNCTION public.integracao_envios_reconciliar(p_id uuid,p_versao text,p_acao text,p_evidencia_hash text,p_recibo text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item integracao_envios_privado.outbox;
BEGIN
 SELECT * INTO item FROM integracao_envios_privado.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR md5(to_jsonb(item)::text) IS DISTINCT FROM p_versao THEN RAISE EXCEPTION 'Prévia desatualizada' USING ERRCODE='PT409'; END IF;
 IF length(p_evidencia_hash)<>64 OR p_evidencia_hash !~ '^[0-9a-f]+$' THEN RAISE EXCEPTION 'Evidência obrigatória'; END IF;
 IF p_acao='confirmar_recibo' THEN
  IF item.estado NOT IN ('incerto','enviando') OR coalesce(p_recibo,'')='' THEN RAISE EXCEPTION 'Estado não permite confirmação'; END IF;
  UPDATE integracao_envios_privado.outbox SET estado='enviado',recibo=p_recibo,atualizado_em=now(),erro_codigo=NULL WHERE id=p_id;
  IF item.fila_id IS NOT NULL THEN UPDATE public.integracao_calendario_fila SET enviado_em=now(),erro=NULL WHERE id=item.fila_id AND enviado_em IS NULL; END IF;
 ELSIF p_acao='retomar_recusado' THEN
  IF item.estado<>'bloqueado' OR item.erro_codigo NOT IN ('RECUSA_PROVEDOR','LIMITE_PROVEDOR') THEN RAISE EXCEPTION 'Resultado incerto exige recibo; não reenviar'; END IF;
  UPDATE integracao_envios_privado.outbox SET estado='pendente',tentativa=0,proxima=now(),atualizado_em=now() WHERE id=p_id;
 ELSE RAISE EXCEPTION 'Ação não permitida'; END IF;
 INSERT INTO integracao_envios_privado.revisoes(envio_id,acao,evidencia_hash,recibo) VALUES(p_id,p_acao,p_evidencia_hash,p_recibo);
 RETURN jsonb_build_object('id',p_id,'acao',p_acao);
END $$;
REVOKE ALL ON FUNCTION public.integracao_envios_previa(uuid[]),public.integracao_envios_reconciliar(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_envios_previa(uuid[]),public.integracao_envios_reconciliar(uuid,text,text,text,text) TO service_role;

CREATE FUNCTION public.integracao_envios_previa_legado(p_ids bigint[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('versao',md5(to_jsonb(f)::text))),'[]'::jsonb)
 FROM public.integracao_calendario_fila f WHERE f.id=ANY(p_ids) AND cardinality(p_ids)<=20 AND f.enviado_em IS NULL;
$$;
CREATE FUNCTION public.integracao_envios_autorizar_legado(p_id bigint,p_versao text,p_referencia_aprovacao text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item public.integracao_calendario_fila;
BEGIN
 SELECT * INTO item FROM public.integracao_calendario_fila WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR item.enviado_em IS NOT NULL OR md5(to_jsonb(item)::text) IS DISTINCT FROM p_versao THEN RAISE EXCEPTION 'Prévia desatualizada' USING ERRCODE='PT409'; END IF;
 IF length(trim(p_referencia_aprovacao))<8 THEN RAISE EXCEPTION 'Referência da aprovação seletiva obrigatória'; END IF;
 IF EXISTS(SELECT 1 FROM integracao_envios_privado.outbox WHERE fila_id=p_id AND estado IN ('enviando','incerto','enviado')) THEN RAISE EXCEPTION 'Item exige reconciliação; não autorizar novo envio'; END IF;
 INSERT INTO integracao_envios_privado.autorizacoes_legado(fila_id,versao,referencia_aprovacao) VALUES(p_id,p_versao,p_referencia_aprovacao)
 ON CONFLICT(fila_id) DO UPDATE SET versao=excluded.versao,referencia_aprovacao=excluded.referencia_aprovacao,autorizado_em=now();
 RETURN jsonb_build_object('id',p_id,'autorizado',true,'enviado',false);
END $$;
REVOKE ALL ON FUNCTION public.integracao_envios_previa_legado(bigint[]),public.integracao_envios_autorizar_legado(bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_envios_previa_legado(bigint[]),public.integracao_envios_autorizar_legado(bigint,text,text) TO service_role;
