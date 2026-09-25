-- Calendar bridge to e-mail and Google Agenda.
-- The ERP calendar stays the single source of truth: no existing row, policy or
-- ERP screen is changed. Every change to erp_eventos is queued here and drained
-- by /api/calendario-emails, which is the only writer of enviado_em.

CREATE TABLE public.integracao_calendario_assinaturas (
 usuario_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 token text NOT NULL UNIQUE DEFAULT (replace(pg_catalog.gen_random_uuid()::text,'-','')||replace(pg_catalog.gen_random_uuid()::text,'-','')),
 receber_convites boolean NOT NULL DEFAULT true,
 receber_resumo boolean NOT NULL DEFAULT true,
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
-- The token is a calendar password: only the owner reads it, through the RPC below.
ALTER TABLE public.integracao_calendario_assinaturas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.integracao_calendario_assinaturas FROM PUBLIC,anon,authenticated;

CREATE TABLE public.integracao_calendario_estado (
 evento_id uuid PRIMARY KEY,
 sequencia integer NOT NULL DEFAULT 0,
 assinatura text NOT NULL DEFAULT '',
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integracao_calendario_estado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.integracao_calendario_estado FROM PUBLIC,anon,authenticated;

CREATE TABLE public.integracao_calendario_fila (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 evento_id uuid NOT NULL,
 usuario_id uuid,
 email text NOT NULL,
 nome text NOT NULL DEFAULT '',
 tipo text NOT NULL CHECK (tipo IN ('convite','atualizacao','cancelamento')),
 sequencia integer NOT NULL DEFAULT 0,
 evento jsonb NOT NULL DEFAULT '{}'::jsonb,
 criado_em timestamptz NOT NULL DEFAULT now(),
 enviado_em timestamptz,
 tentativas integer NOT NULL DEFAULT 0,
 erro text
);
ALTER TABLE public.integracao_calendario_fila ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.integracao_calendario_fila FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_calendario_fila_pendentes ON public.integracao_calendario_fila (criado_em) WHERE enviado_em IS NULL;
CREATE INDEX integracao_calendario_fila_evento ON public.integracao_calendario_fila (evento_id);

-- The fingerprint is rendered in UTC, with the participants sorted, so the same
-- event never looks changed just because another session has another time zone
-- or listed the same people in another order.
CREATE FUNCTION erp_collab_private.integracao_calendario_assinatura_evento(ev public.erp_eventos) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT md5(concat_ws('|',ev.titulo,ev.descricao,
  to_char(ev.inicio AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS'),
  to_char(ev.fim AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS'),
  ev.agenda_id,ev.status,ev.recorrencia,ev.entidade_tipo,ev.entidade_id,
  (SELECT string_agg(p::text,',' ORDER BY p) FROM unnest(ev.participantes) p)));
$$;
REVOKE ALL ON FUNCTION erp_collab_private.integracao_calendario_assinatura_evento(public.erp_eventos) FROM PUBLIC,anon,authenticated;

-- One snapshot per recipient. Storing the event as it was avoids sending a
-- cancellation that describes a later edit, and lets a retry be exact.
CREATE FUNCTION erp_collab_private.integracao_calendario_enfileirar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 ev public.erp_eventos;
 anterior public.integracao_calendario_estado;
 cancelar boolean;
 assinatura text;
 seq integer;
 alvo uuid[];
 removidos uuid[] := '{}'::uuid[];
 corpo jsonb;
BEGIN
 IF TG_OP='DELETE' THEN ev := OLD; ELSE ev := NEW; END IF;
 cancelar := TG_OP='DELETE' OR ev.status <> 'ativo';
 assinatura := erp_collab_private.integracao_calendario_assinatura_evento(ev);
 SELECT * INTO anterior FROM public.integracao_calendario_estado WHERE evento_id=ev.id;
 -- Colour, visibility and other cosmetic edits must not e-mail the team again.
 IF TG_OP='UPDATE' AND anterior.assinatura=assinatura THEN RETURN NULL; END IF;
 -- Nothing was ever announced, so there is nothing to cancel.
 IF cancelar AND anterior.evento_id IS NULL THEN RETURN NULL; END IF;
 IF TG_OP='INSERT' AND cancelar THEN RETURN NULL; END IF;

 seq := COALESCE(anterior.sequencia,-1)+1;
 SELECT COALESCE(array_agg(DISTINCT p),'{}'::uuid[]) INTO alvo FROM unnest(ev.participantes||ARRAY[ev.created_by]) p WHERE p IS NOT NULL;
 IF TG_OP='UPDATE' THEN
  SELECT COALESCE(array_agg(p),'{}'::uuid[]) INTO removidos FROM unnest(OLD.participantes) p WHERE NOT (p=ANY(alvo));
 END IF;

 corpo := jsonb_build_object(
  'id',ev.id,'titulo',ev.titulo,'descricao',ev.descricao,'inicio',ev.inicio,'fim',ev.fim,
  'status',ev.status,'recorrencia',ev.recorrencia,'cor',ev.cor,'publico',ev.publico,
  'agenda',(SELECT a.nome FROM public.erp_agendas a WHERE a.id=ev.agenda_id),
  'nucleo',(SELECT concat_ws('/',k.municipio,k.estado) FROM public.processos_kanban k WHERE ev.entidade_tipo='processo' AND k.id=ev.entidade_id),
  'organizador',(SELECT jsonb_build_object('nome',p.nome,'email',p.email) FROM public.profiles p WHERE p.id=ev.created_by),
  'participantes',(SELECT COALESCE(jsonb_agg(jsonb_build_object('nome',p.nome,'email',p.email) ORDER BY p.nome),'[]'::jsonb) FROM public.profiles p WHERE p.id=ANY(ev.participantes)));

 INSERT INTO public.integracao_calendario_fila(evento_id,usuario_id,email,nome,tipo,sequencia,evento)
 SELECT ev.id,p.id,p.email,p.nome,
  CASE WHEN cancelar OR p.id=ANY(removidos) THEN 'cancelamento'
       WHEN anterior.evento_id IS NULL THEN 'convite'
       ELSE 'atualizacao' END,
  seq,corpo
 FROM public.profiles p
 LEFT JOIN public.integracao_calendario_assinaturas a ON a.usuario_id=p.id
 WHERE p.ativo AND p.email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  AND (p.id=ANY(alvo) OR p.id=ANY(removidos))
  AND COALESCE(a.receber_convites,true);

 IF TG_OP='DELETE' THEN DELETE FROM public.integracao_calendario_estado WHERE evento_id=ev.id;
 ELSE
  INSERT INTO public.integracao_calendario_estado(evento_id,sequencia,assinatura) VALUES(ev.id,seq,assinatura)
  ON CONFLICT (evento_id) DO UPDATE SET sequencia=EXCLUDED.sequencia,assinatura=EXCLUDED.assinatura,atualizado_em=now();
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION erp_collab_private.integracao_calendario_enfileirar() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER integracao_calendario_fila AFTER INSERT OR UPDATE OR DELETE ON public.erp_eventos
FOR EACH ROW EXECUTE FUNCTION erp_collab_private.integracao_calendario_enfileirar();

-- Each person reads and changes only their own subscription; the token never
-- reaches another account, and regenerating it invalidates the old feed URL.
CREATE FUNCTION public.integracao_calendario_assinatura(p_convites boolean DEFAULT NULL,p_resumo boolean DEFAULT NULL,p_regerar boolean DEFAULT false)
RETURNS TABLE(token text,receber_convites boolean,receber_resumo boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND ativo) THEN
  RAISE EXCEPTION 'Sessão inválida' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.integracao_calendario_assinaturas(usuario_id) VALUES(auth.uid()) ON CONFLICT (usuario_id) DO NOTHING;
 UPDATE public.integracao_calendario_assinaturas a SET
  receber_convites=COALESCE(p_convites,a.receber_convites),
  receber_resumo=COALESCE(p_resumo,a.receber_resumo),
  token=CASE WHEN p_regerar THEN replace(pg_catalog.gen_random_uuid()::text,'-','')||replace(pg_catalog.gen_random_uuid()::text,'-','') ELSE a.token END,
  atualizado_em=now()
 WHERE a.usuario_id=auth.uid();
 RETURN QUERY SELECT a.token,a.receber_convites,a.receber_resumo FROM public.integracao_calendario_assinaturas a WHERE a.usuario_id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.integracao_calendario_assinatura(boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_calendario_assinatura(boolean,boolean,boolean) TO authenticated;

-- The feed is personal: only what the person takes part in or created. Shared
-- agendas stay in the system, so a subscription never exports the whole firm.
CREATE FUNCTION public.integracao_calendario_feed(p_token text,p_desde timestamptz,p_ate timestamptz)
RETURNS TABLE(nome text,evento jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.nome,jsonb_build_object(
   'id',e.id,'titulo',e.titulo,'descricao',e.descricao,'inicio',e.inicio,'fim',e.fim,
   'status',e.status,'recorrencia',e.recorrencia,'publico',e.publico,
   'agenda',(SELECT g.nome FROM public.erp_agendas g WHERE g.id=e.agenda_id),
   'nucleo',(SELECT concat_ws('/',k.municipio,k.estado) FROM public.processos_kanban k WHERE e.entidade_tipo='processo' AND k.id=e.entidade_id),
   'organizador',(SELECT jsonb_build_object('nome',o.nome,'email',o.email) FROM public.profiles o WHERE o.id=e.created_by))
 FROM public.integracao_calendario_assinaturas a
 JOIN public.profiles p ON p.id=a.usuario_id AND p.ativo
 JOIN public.erp_eventos e ON (p.id=ANY(e.participantes) OR e.created_by=p.id)
 WHERE a.token=p_token AND length(p_token)>=32 AND e.inicio>=p_desde AND e.inicio<p_ate
 ORDER BY e.inicio;
$$;
REVOKE ALL ON FUNCTION public.integracao_calendario_feed(text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;

-- One row per person with something in the day, for the morning summary.
CREATE FUNCTION public.integracao_calendario_resumo(p_inicio timestamptz,p_fim timestamptz)
RETURNS TABLE(usuario_id uuid,nome text,email text,eventos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id,p.nome,p.email,jsonb_agg(jsonb_build_object(
   'id',e.id,'titulo',e.titulo,'descricao',e.descricao,'inicio',e.inicio,'fim',e.fim,
   'agenda',(SELECT g.nome FROM public.erp_agendas g WHERE g.id=e.agenda_id),
   'nucleo',(SELECT concat_ws('/',k.municipio,k.estado) FROM public.processos_kanban k WHERE e.entidade_tipo='processo' AND k.id=e.entidade_id),
   'organizador',(SELECT jsonb_build_object('nome',o.nome,'email',o.email) FROM public.profiles o WHERE o.id=e.created_by)) ORDER BY e.inicio)
 FROM public.profiles p
 LEFT JOIN public.integracao_calendario_assinaturas a ON a.usuario_id=p.id
 JOIN public.erp_eventos e ON (p.id=ANY(e.participantes) OR e.created_by=p.id)
 WHERE p.ativo AND p.email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  AND COALESCE(a.receber_resumo,true) AND e.status='ativo' AND e.inicio>=p_inicio AND e.inicio<p_fim
 GROUP BY p.id,p.nome,p.email;
$$;
REVOKE ALL ON FUNCTION public.integracao_calendario_resumo(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;

-- Events that already exist in the ERP are adopted in silence: the queue starts
-- empty, nobody is e-mailed about the past, and the next real change to one of
-- them goes out as an update instead of a first invitation.
INSERT INTO public.integracao_calendario_estado(evento_id,sequencia,assinatura)
SELECT e.id,0,erp_collab_private.integracao_calendario_assinatura_evento(e) FROM public.erp_eventos e
ON CONFLICT (evento_id) DO NOTHING;
