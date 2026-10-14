-- Etapa 1: armazenamento de rascunhos, SEM efeito em autorizacao existente.
-- Aplicar somente como migracao aditiva no projeto autorizado.
-- Sem FKs em profiles: exclusoes existentes nao ficam bloqueadas nem apagam historico.
CREATE TABLE public.integracao_atribuicoes_rascunhos (
  usuario_id uuid PRIMARY KEY,
  revisao bigint NOT NULL DEFAULT 0 CHECK (revisao >= 0),
  matriz jsonb NOT NULL DEFAULT '{"schema_version":1,"atribuicoes":[]}'::jsonb
    CHECK (pg_catalog.jsonb_typeof(matriz) = 'object'),
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  atualizado_em timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  alterado_por uuid NOT NULL
);
CREATE TABLE public.integracao_atribuicoes_auditoria (
  ator_id uuid NOT NULL,
  requisicao_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  revisao_anterior bigint NOT NULL CHECK (revisao_anterior >= 0),
  revisao bigint NOT NULL CHECK (revisao = revisao_anterior + 1),
  matriz_anterior jsonb,
  matriz_nova jsonb NOT NULL,
  motivo text NOT NULL CHECK (pg_catalog.char_length(motivo) BETWEEN 1 AND 1000),
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  resultado jsonb NOT NULL,
  PRIMARY KEY (ator_id, requisicao_id),
  UNIQUE (usuario_id, revisao)
);
ALTER TABLE public.integracao_atribuicoes_rascunhos OWNER TO postgres;
ALTER TABLE public.integracao_atribuicoes_auditoria OWNER TO postgres;
ALTER TABLE public.integracao_atribuicoes_rascunhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracao_atribuicoes_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.integracao_atribuicoes_rascunhos,
  public.integracao_atribuicoes_auditoria FROM PUBLIC, anon, authenticated, service_role;
-- Nao criar politicas diretas. Somente RPCs administrativos acessam estes objetos.

CREATE FUNCTION public.integracao_atribuicoes_auditoria_imutavel()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Historico de rascunhos imutavel';
END;
$$;
ALTER FUNCTION public.integracao_atribuicoes_auditoria_imutavel() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.integracao_atribuicoes_auditoria_imutavel()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER integracao_atribuicoes_auditoria_imutavel
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.integracao_atribuicoes_auditoria
FOR EACH STATEMENT EXECUTE FUNCTION public.integracao_atribuicoes_auditoria_imutavel();

CREATE FUNCTION public.integracao_atribuicoes_ler(p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_r public.integracao_atribuicoes_rascunhos%ROWTYPE;
  v_historico jsonb;
BEGIN
  IF v_ator IS NULL OR public.is_erp_admin() IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrador ativo necessario';
  END IF;
  IF p_usuario_id IS NULL OR NOT EXISTS
    (SELECT 1 FROM public.profiles AS p WHERE p.id = p_usuario_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Usuario de destino invalido';
  END IF;
  SELECT r.* INTO v_r FROM public.integracao_atribuicoes_rascunhos AS r
    WHERE r.usuario_id = p_usuario_id;
  SELECT COALESCE(pg_catalog.jsonb_agg(h.item ORDER BY h.revisao DESC), '[]'::jsonb)
    INTO v_historico FROM (
      SELECT a.revisao, pg_catalog.jsonb_build_object(
        'revisao', a.revisao, 'revisao_anterior', a.revisao_anterior,
        'ator_id', a.ator_id, 'requisicao_id', a.requisicao_id,
        'motivo', a.motivo, 'criado_em', a.criado_em,
        'matriz_anterior', a.matriz_anterior, 'matriz_nova', a.matriz_nova) AS item
      FROM public.integracao_atribuicoes_auditoria AS a
      WHERE a.usuario_id = p_usuario_id ORDER BY a.revisao DESC LIMIT 20
    ) AS h;
  RETURN pg_catalog.jsonb_build_object(
    'modo', 'rascunho_sem_efeito', 'acesso_efetivo_alterado', false,
    'usuario_id', p_usuario_id, 'revisao', COALESCE(v_r.revisao, 0),
    'matriz', COALESCE(v_r.matriz, '{"schema_version":1,"atribuicoes":[]}'::jsonb),
    'atualizado_em', v_r.atualizado_em, 'alterado_por', v_r.alterado_por,
    'historico', v_historico);
END;
$$;
ALTER FUNCTION public.integracao_atribuicoes_ler(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.integracao_atribuicoes_ler(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.integracao_atribuicoes_ler(uuid) TO authenticated;

CREATE FUNCTION public.integracao_atribuicoes_salvar(
  p_usuario_id uuid, p_revisao_esperada bigint, p_matriz jsonb,
  p_motivo text, p_requisicao_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_r public.integracao_atribuicoes_rascunhos%ROWTYPE;
  v_a public.integracao_atribuicoes_auditoria%ROWTYPE;
  v_item jsonb;
  v_motivo text := pg_catalog.btrim(p_motivo);
  v_agora timestamptz;
  v_resultado jsonb;
BEGIN
  IF v_ator IS NULL OR public.is_erp_admin() IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrador ativo necessario';
  END IF;
  IF p_usuario_id = v_ator THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Edicao de rascunho proprio proibida';
  END IF;
  IF p_usuario_id IS NULL OR NOT EXISTS
    (SELECT 1 FROM public.profiles AS p WHERE p.id = p_usuario_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Usuario de destino invalido';
  END IF;
  IF p_revisao_esperada IS NULL OR p_revisao_esperada < 0 OR p_requisicao_id IS NULL
    OR v_motivo IS NULL OR pg_catalog.char_length(v_motivo) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Revisao, motivo e requisicao obrigatorios';
  END IF;
  -- Contrato fechado; nao aceita cargo/setor/ativo/ator ou campos arbitrarios.
  IF p_matriz IS NULL OR pg_catalog.jsonb_typeof(p_matriz) IS DISTINCT FROM 'object'
    OR pg_catalog.octet_length(p_matriz::text) > 32768 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Matriz de rascunho invalida';
  END IF;
  IF (p_matriz - ARRAY['schema_version','atribuicoes']::text[]) <> '{}'::jsonb
    OR p_matriz->'schema_version' IS DISTINCT FROM '1'::jsonb
    OR pg_catalog.jsonb_typeof(p_matriz->'atribuicoes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Contrato de rascunho invalido';
  END IF;
  IF pg_catalog.jsonb_array_length(p_matriz->'atribuicoes') > 66 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Muitas celulas no rascunho';
  END IF;
  FOR v_item IN SELECT e.value FROM pg_catalog.jsonb_array_elements(p_matriz->'atribuicoes') AS e(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Celula de rascunho invalida';
    END IF;
    IF (v_item - ARRAY['recurso','acao','decisao','escopo']::text[]) <> '{}'::jsonb
      OR pg_catalog.jsonb_typeof(v_item->'recurso') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(v_item->'acao') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(v_item->'decisao') IS DISTINCT FROM 'string'
      OR (v_item->>'recurso') NOT IN ('clientes','nucleos','remessas','planos','metas_ordens',
        'calendario','chat','documentos','solicitacoes','agentes_ia','concessoes')
      OR (v_item->>'acao') NOT IN ('ler','criar','editar','aprovar','exportar','excluir')
      OR (v_item->>'decisao') NOT IN ('herdar','permitir','negar')
      OR v_item->'escopo' IS DISTINCT FROM '{"tipo":"atual"}'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Recurso, acao, decisao ou escopo invalidos';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_matriz->'atribuicoes') AS e(value)
    GROUP BY e.value->>'recurso', e.value->>'acao' HAVING count(*) > 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Celula duplicada no rascunho';
  END IF;

  -- O INSERT concorrente aguarda o PK; FOR UPDATE serializa salvamentos do destino.
  -- A linha inicial e removida pelo rollback automatico se qualquer validacao falhar.
  INSERT INTO public.integracao_atribuicoes_rascunhos(usuario_id, alterado_por)
    VALUES (p_usuario_id, v_ator) ON CONFLICT (usuario_id) DO NOTHING;
  SELECT r.* INTO STRICT v_r FROM public.integracao_atribuicoes_rascunhos AS r
    WHERE r.usuario_id = p_usuario_id FOR UPDATE;
  SELECT a.* INTO v_a FROM public.integracao_atribuicoes_auditoria AS a
    WHERE a.ator_id = v_ator AND a.requisicao_id = p_requisicao_id;
  IF FOUND THEN
    IF v_a.usuario_id IS DISTINCT FROM p_usuario_id
      OR v_a.revisao_anterior IS DISTINCT FROM p_revisao_esperada
      OR v_a.matriz_nova IS DISTINCT FROM p_matriz OR v_a.motivo IS DISTINCT FROM v_motivo THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Requisicao idempotente reutilizada com outro conteudo';
    END IF;
    RETURN v_a.resultado;
  END IF;
  IF v_r.revisao <> p_revisao_esperada THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Conflito de revisao; recarregue o rascunho';
  END IF;
  v_agora := pg_catalog.clock_timestamp();
  UPDATE public.integracao_atribuicoes_rascunhos AS r SET
    revisao = v_r.revisao + 1, matriz = p_matriz,
    atualizado_em = v_agora, alterado_por = v_ator WHERE r.usuario_id = p_usuario_id;
  v_resultado := pg_catalog.jsonb_build_object(
    'modo', 'rascunho_sem_efeito', 'acesso_efetivo_alterado', false,
    'usuario_id', p_usuario_id, 'revisao', v_r.revisao + 1,
    'matriz', p_matriz, 'atualizado_em', v_agora,
    'alterado_por', v_ator, 'requisicao_id', p_requisicao_id);
  INSERT INTO public.integracao_atribuicoes_auditoria(
    ator_id, requisicao_id, usuario_id, revisao_anterior, revisao,
    matriz_anterior, matriz_nova, motivo, criado_em, resultado
  ) VALUES (
    v_ator, p_requisicao_id, p_usuario_id, v_r.revisao, v_r.revisao + 1,
    CASE WHEN v_r.revisao = 0 THEN NULL ELSE v_r.matriz END,
    p_matriz, v_motivo, v_agora, v_resultado
  );
  RETURN v_resultado;
END;
$$;
ALTER FUNCTION public.integracao_atribuicoes_salvar(uuid,bigint,jsonb,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.integracao_atribuicoes_salvar(uuid,bigint,jsonb,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.integracao_atribuicoes_salvar(uuid,bigint,jsonb,text,uuid) TO authenticated;
COMMENT ON TABLE public.integracao_atribuicoes_rascunhos IS
  'Rascunhos administrativos SEM efeito sobre direitos atuais; etapa 1 independente.';
COMMENT ON TABLE public.integracao_atribuicoes_auditoria IS
  'Historico imutavel dos rascunhos; nenhuma concessao real de acesso.';
COMMENT ON FUNCTION public.integracao_atribuicoes_salvar(uuid,bigint,jsonb,text,uuid) IS
  'Salva somente rascunho com auditoria e CAS. Nao altera acesso efetivo, profiles ou regras existentes.';
