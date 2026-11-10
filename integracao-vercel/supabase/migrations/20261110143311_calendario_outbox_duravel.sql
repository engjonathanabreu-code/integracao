-- Additive expansion only. Does not enable sending or import historical backlog.
-- Rollback must keep the v2 sender or disable sending: the old sender cannot read uncertainty.
CREATE SCHEMA integracao_envios_privado;
REVOKE ALL ON SCHEMA integracao_envios_privado FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA integracao_envios_privado TO service_role;
CREATE TABLE integracao_envios_privado.config (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), habilitado boolean NOT NULL DEFAULT false,
 corte timestamptz, CHECK(NOT habilitado OR corte IS NOT NULL)
);
INSERT INTO integracao_envios_privado.config DEFAULT VALUES;
CREATE TABLE integracao_envios_privado.autorizacoes_legado (
 fila_id bigint PRIMARY KEY REFERENCES public.integracao_calendario_fila(id),
 versao text NOT NULL, referencia_aprovacao text NOT NULL,
 autorizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE integracao_envios_privado.autorizacoes_legado ENABLE ROW LEVEL SECURITY;
CREATE TABLE integracao_envios_privado.outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chave text NOT NULL UNIQUE,
 origem text NOT NULL CHECK(origem IN ('convite','resumo')), fila_id bigint UNIQUE REFERENCES public.integracao_calendario_fila(id),
 corpo jsonb NOT NULL CHECK(jsonb_typeof(corpo)='object'),
 estado text NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente','enviando','incerto','enviado','bloqueado')),
 tentativa integer NOT NULL DEFAULT 0, lease uuid, lease_ate timestamptz,
 proxima timestamptz NOT NULL DEFAULT now(), recibo text, erro_codigo text,
 criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE integracao_envios_privado.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE integracao_envios_privado.outbox ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA integracao_envios_privado TO service_role;
CREATE INDEX outbox_pendentes ON integracao_envios_privado.outbox(proxima,criado_em) WHERE estado='pendente';
CREATE FUNCTION public.integracao_envios_config() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('habilitado',habilitado,'corte',corte,'protocolo',2) FROM integracao_envios_privado.config WHERE id;
$$;
CREATE FUNCTION public.integracao_envios_enfileirar(p_chave text,p_origem text,p_corpo jsonb,p_fila bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item integracao_envios_privado.outbox;
BEGIN
 IF NOT (SELECT habilitado FROM integracao_envios_privado.config WHERE id) THEN RETURN jsonb_build_object('estado','desativado'); END IF;
 IF (p_origem='convite') IS DISTINCT FROM (p_fila IS NOT NULL) THEN RAISE EXCEPTION 'Origem incompatível'; END IF;
 IF length(p_chave)>200 OR length(p_chave)<1 OR jsonb_typeof(p_corpo)<>'object' THEN RAISE EXCEPTION 'Envio inválido'; END IF;
 IF p_origem='convite' AND NOT EXISTS(SELECT 1 FROM public.integracao_calendario_fila f,integracao_envios_privado.config c WHERE c.id AND f.id=p_fila AND (f.criado_em>=c.corte OR EXISTS(SELECT 1 FROM integracao_envios_privado.autorizacoes_legado a WHERE a.fila_id=f.id AND a.versao=md5(to_jsonb(f)::text))) AND f.enviado_em IS NULL) THEN
  RAISE EXCEPTION 'Item fora do lote autorizado';
 END IF;
 INSERT INTO integracao_envios_privado.outbox(chave,origem,corpo,fila_id) VALUES(p_chave,p_origem,p_corpo,p_fila) ON CONFLICT(chave) DO NOTHING;
 SELECT * INTO item FROM integracao_envios_privado.outbox WHERE chave=p_chave FOR UPDATE;
 IF item.corpo IS DISTINCT FROM p_corpo OR item.origem IS DISTINCT FROM p_origem OR item.fila_id IS DISTINCT FROM p_fila THEN
  RAISE EXCEPTION 'Chave reutilizada para outro conteúdo' USING ERRCODE='PT409';
 END IF;
 RETURN jsonb_build_object('id',item.id,'estado',item.estado);
END $$;
CREATE FUNCTION public.integracao_envios_claim(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item integracao_envios_privado.outbox;
BEGIN
 IF NOT (SELECT habilitado FROM integracao_envios_privado.config WHERE id) THEN RETURN NULL; END IF;
 SELECT * INTO item FROM integracao_envios_privado.outbox WHERE id=p_id FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF item.estado='enviando' AND item.lease_ate<now() THEN
  UPDATE integracao_envios_privado.outbox SET estado='incerto',erro_codigo='LEASE_EXPIRADO',atualizado_em=now() WHERE id=p_id;
  RETURN jsonb_build_object('id',p_id,'estado','incerto');
 END IF;
 IF item.estado<>'pendente' OR item.proxima>now() THEN RETURN NULL; END IF;
 UPDATE integracao_envios_privado.outbox SET estado='enviando',lease=gen_random_uuid(),lease_ate=now()+interval '180 seconds',tentativa=tentativa+1,atualizado_em=now()
 WHERE id=p_id RETURNING * INTO item;
 RETURN jsonb_build_object('id',item.id,'chave',item.chave,'corpo',item.corpo,'lease',item.lease,'tentativa',item.tentativa);
END $$;
CREATE FUNCTION public.integracao_envios_finalizar(p_id uuid,p_lease uuid,p_estado text,p_recibo text DEFAULT NULL,p_erro text DEFAULT NULL,p_espera integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item integracao_envios_privado.outbox;
BEGIN
 IF p_estado NOT IN ('enviado','incerto','bloqueado','pendente') OR (p_estado='enviado' AND coalesce(p_recibo,'')='') THEN RAISE EXCEPTION 'Confirmação inválida'; END IF;
 SELECT * INTO item FROM integracao_envios_privado.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR item.lease IS DISTINCT FROM p_lease THEN RAISE EXCEPTION 'Lease inválido' USING ERRCODE='PT409'; END IF;
 IF item.estado='enviado' AND item.recibo=p_recibo AND p_estado='enviado' THEN RETURN jsonb_build_object('estado','enviado'); END IF;
 IF item.estado<>'enviando' THEN RAISE EXCEPTION 'Estado exige reconciliação' USING ERRCODE='PT409'; END IF;
 UPDATE integracao_envios_privado.outbox SET estado=p_estado,recibo=p_recibo,erro_codigo=left(p_erro,80),proxima=now()+make_interval(secs=>greatest(1,least(p_espera,86400))),atualizado_em=now() WHERE id=p_id;
 IF p_estado='enviado' AND item.fila_id IS NOT NULL THEN
  UPDATE public.integracao_calendario_fila SET enviado_em=now(),tentativas=tentativas+item.tentativa,erro=NULL WHERE id=item.fila_id AND enviado_em IS NULL;
 END IF;
 RETURN jsonb_build_object('estado',p_estado);
END $$;
REVOKE ALL ON FUNCTION public.integracao_envios_config(),public.integracao_envios_enfileirar(text,text,jsonb,bigint),public.integracao_envios_claim(uuid),public.integracao_envios_finalizar(uuid,uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_envios_config(),public.integracao_envios_enfileirar(text,text,jsonb,bigint),public.integracao_envios_claim(uuid),public.integracao_envios_finalizar(uuid,uuid,text,text,text,integer) TO service_role;
-- No purge of receipts, no enqueue/backfill and no enablement here.

CREATE FUNCTION public.integracao_envios_pendentes(p_limite integer DEFAULT 40) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) FROM (
  SELECT f.* FROM public.integracao_calendario_fila f
  CROSS JOIN integracao_envios_privado.config c
  LEFT JOIN integracao_envios_privado.outbox o ON o.fila_id=f.id
  WHERE c.id AND c.habilitado AND (f.criado_em>=c.corte OR EXISTS(SELECT 1 FROM integracao_envios_privado.autorizacoes_legado a WHERE a.fila_id=f.id AND a.versao=md5(to_jsonb(f)::text))) AND f.enviado_em IS NULL
   AND (o.id IS NULL OR (o.estado='pendente' AND o.proxima<=now()) OR (o.estado='enviando' AND o.lease_ate<now()))
  ORDER BY f.criado_em,f.id LIMIT greatest(1,least(p_limite,40))
 ) f;
$$;
REVOKE ALL ON FUNCTION public.integracao_envios_pendentes(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_envios_pendentes(integer) TO service_role;
