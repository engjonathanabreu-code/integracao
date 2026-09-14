-- Additive support only: does not import, replace, or delete any existing row.
-- Fingerprints never contain exported row contents. Abort if any old row changes.
CREATE TEMP TABLE integracao_antes(tabela text, total bigint, assinatura text) ON COMMIT DROP;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('INSERT INTO pg_temp.integracao_antes SELECT %L,count(*),md5(coalesce(string_agg((to_jsonb(r)-ARRAY[''integracao_nucleo_id'',''integracao_etapa_id''])::text,'''' ORDER BY (to_jsonb(r)-ARRAY[''integracao_nucleo_id'',''integracao_etapa_id''])::text),'''')) FROM public.%I r',t.tablename,t.tablename);
 END LOOP;
END $$;
ALTER TABLE public.metas ADD COLUMN integracao_nucleo_id uuid REFERENCES public.processos_kanban(id);
CREATE INDEX metas_integracao_nucleo_idx ON public.metas(integracao_nucleo_id) WHERE integracao_nucleo_id IS NOT NULL;
ALTER TABLE public.comentarios_plano ADD COLUMN integracao_etapa_id uuid REFERENCES public.etapas_plano(id) ON DELETE SET NULL;
CREATE INDEX comentarios_integracao_etapa_idx ON public.comentarios_plano(integracao_etapa_id) WHERE integracao_etapa_id IS NOT NULL;

-- Integração also supports standalone groups; all existing groups remain valid.
ALTER TABLE public.erp_conversas DROP CONSTRAINT erp_conversas_check;
ALTER TABLE public.erp_conversas ADD CONSTRAINT erp_conversas_check CHECK (
 (tipo='direto' AND cardinality(participantes)=2 AND entidade_tipo IS NULL AND entidade_id IS NULL)
 OR (tipo='grupo' AND cardinality(participantes)>0 AND ((entidade_tipo IS NULL AND entidade_id IS NULL)
 OR (entidade_tipo IN ('projeto','plano','processo') AND entidade_tipo IS NOT NULL AND entidade_id IS NOT NULL)))
);

-- Preserve the existing event permissions when exposing editing from Integração.
CREATE POLICY integracao_evento_editar ON public.erp_eventos FOR UPDATE TO authenticated
USING(erp_collab_private.active_user() AND (created_by=auth.uid() OR public.is_admin()))
WITH CHECK(erp_collab_private.active_user() AND (created_by=auth.uid() OR public.is_admin()));
GRANT UPDATE(titulo,descricao,inicio,fim,agenda_id,participantes,publico,cor,status) ON public.erp_eventos TO authenticated;
CREATE FUNCTION public.integracao_validar_evento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL THEN
  IF NEW.cor IS DISTINCT FROM OLD.cor AND NOT public.is_admin() THEN RAISE EXCEPTION 'Somente a administração pode alterar cores'; END IF;
  IF NEW.participantes IS DISTINCT FROM OLD.participantes AND EXISTS(SELECT 1 FROM unnest(NEW.participantes) p WHERE NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p AND ativo)) THEN RAISE EXCEPTION 'Participante inválido'; END IF;
  IF NEW.agenda_id IS NOT NULL AND NOT NEW.publico THEN RAISE EXCEPTION 'Reservas de ativos devem ser públicas para a equipe'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.integracao_validar_evento() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER integracao_validar_evento BEFORE UPDATE ON public.erp_eventos FOR EACH ROW EXECUTE FUNCTION public.integracao_validar_evento();
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
ALTER TABLE public.erp_eventos ADD CONSTRAINT integracao_reserva_sem_sobreposicao
EXCLUDE USING gist (agenda_id extensions.gist_uuid_ops WITH =, tstzrange(inicio,fim,'[)') WITH &&)
WHERE (status='ativo' AND agenda_id IS NOT NULL);

CREATE TABLE public.integracao_complementos (
  colecao text NOT NULL,
  registro_id text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}',
  criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  referencia_tabela text,
  referencia_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (colecao,registro_id)
);
ALTER TABLE public.integracao_complementos ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.integracao_acesso(tabela text, registro uuid, dono uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE permitido boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND ativo) THEN RETURN false; END IF;
  IF tabela='integracao_config' THEN RETURN true; END IF;
  IF tabela IS NULL THEN RETURN dono=auth.uid() OR public.is_erp_admin(); END IF;
  IF tabela NOT IN ('processos_kanban','metas','ordens_servico','planos_trabalho','erp_eventos','erp_conversas','profiles','fin_receb_municipios','fin_receb_remessas','fin_receb_clientes','meta_setores','erp_agendas') THEN RETURN false; END IF;
  -- SELECT executes with the caller's existing RLS policies, including private chats.
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id=$1)',tabela) INTO permitido USING registro;
  RETURN permitido;
END $$;
REVOKE ALL ON FUNCTION public.integracao_acesso(text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_acesso(text,uuid,uuid) TO authenticated;
CREATE POLICY integracao_ler ON public.integracao_complementos FOR SELECT TO authenticated
USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY integracao_inserir ON public.integracao_complementos FOR INSERT TO authenticated
WITH CHECK(criado_por=auth.uid() AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY integracao_editar ON public.integracao_complementos FOR UPDATE TO authenticated
USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por))
WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY integracao_remover ON public.integracao_complementos FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY integracao_config_inserir ON public.integracao_complementos AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK(referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core());
CREATE POLICY integracao_config_editar ON public.integracao_complementos AS RESTRICTIVE FOR UPDATE TO authenticated
USING(referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())
WITH CHECK(referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core());
CREATE POLICY integracao_config_remover ON public.integracao_complementos AS RESTRICTIVE FOR DELETE TO authenticated
USING(referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core());
GRANT SELECT,INSERT,DELETE ON public.integracao_complementos TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_complementos TO authenticated;
REVOKE ALL ON public.integracao_complementos FROM anon;

-- Atomic per-user mutation batches with field-level optimistic concurrency.
-- Only explicit edits call this function. Initial loading never calls it.
CREATE TABLE public.integracao_pedidos (
 usuario_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 pedido uuid NOT NULL,
 resumo text NOT NULL,
 resultado jsonb NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(usuario_id,pedido)
);
ALTER TABLE public.integracao_pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pedidos_ler ON public.integracao_pedidos FOR SELECT TO authenticated USING(usuario_id=auth.uid());
CREATE POLICY pedidos_criar ON public.integracao_pedidos FOR INSERT TO authenticated WITH CHECK(usuario_id=auth.uid());
GRANT SELECT,INSERT ON public.integracao_pedidos TO authenticated;
REVOKE ALL ON public.integracao_pedidos FROM anon;

CREATE FUNCTION public.integracao_gravar(operacoes jsonb,pedido uuid DEFAULT gen_random_uuid())
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE op jsonb; tabela text; chave jsonb; anterior jsonb; mudancas jsonb;
 atual jsonb; colunas text; valores text; atribuicoes text; resultado jsonb; filtro text; pk text[];
 aliases jsonb:='{}'; a record; consulta text; quantidade integer; recibo public.integracao_pedidos;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND ativo) THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
 IF jsonb_typeof(operacoes)<>'array' OR jsonb_array_length(operacoes)>1000 THEN RAISE EXCEPTION 'Lote inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||pedido::text,0));
 SELECT * INTO recibo FROM public.integracao_pedidos r WHERE r.usuario_id=auth.uid() AND r.pedido=integracao_gravar.pedido;
 IF FOUND THEN
  IF recibo.resumo<>md5(operacoes::text) THEN RAISE EXCEPTION 'Pedido já utilizado para outra alteração'; END IF;
  RETURN recibo.resultado;
 END IF;
 FOR op IN SELECT value FROM jsonb_array_elements(operacoes) LOOP
  FOR a IN SELECT * FROM jsonb_each_text(aliases) LOOP
   op:=replace(op::text,to_jsonb(a.key)::text,to_jsonb(a.value)::text)::jsonb;
  END LOOP;
  tabela:=op->>'table'; chave:=op->'key'; anterior:=op->'expected'; mudancas:=op->'changes';
  IF tabela IS NOT NULL THEN
   IF tabela NOT IN ('profiles','fin_receb_municipios','fin_receb_remessas','fin_receb_clientes','processos_kanban','processos_kanban_andamentos','processos_kanban_observacoes','processos_kanban_historico','meta_setores','metas','meta_responsaveis','meta_checklist','meta_comentarios','meta_historico','meta_arquivos','ordens_servico','ordem_servico_comentarios','planos_trabalho','etapas_plano','etapa_responsaveis','entregaveis','comentarios_plano','erp_agendas','erp_eventos','erp_conversas','integracao_complementos') THEN RAISE EXCEPTION 'Tabela não permitida'; END IF;
   IF chave IS NULL OR chave='{}' OR jsonb_typeof(chave)<>'object' THEN RAISE EXCEPTION 'Identificador obrigatório'; END IF;
   SELECT array_agg(attr.attname::text ORDER BY attr.attname) INTO pk FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute attr ON attr.attrelid=i.indrelid AND attr.attnum=ANY(i.indkey)
   WHERE i.indrelid=format('public.%I',tabela)::regclass AND i.indisprimary;
   IF pk IS DISTINCT FROM ARRAY(SELECT jsonb_object_keys(chave) ORDER BY 1) THEN RAISE EXCEPTION 'Informe exatamente a chave primária do registro'; END IF;
   SELECT string_agg(format('t.%I=k.%I',key,key),' AND ') INTO filtro FROM jsonb_each(chave);
   IF NOT coalesce((op->>'insert')::boolean,false) THEN
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t, jsonb_populate_record(NULL::public.%I,$1) k WHERE %s FOR UPDATE OF t',tabela,tabela,filtro) INTO atual USING chave;
    IF atual IS NULL THEN RAISE EXCEPTION 'Registro indisponível ou sem permissão: %',tabela; END IF;
    FOR a IN SELECT * FROM jsonb_each(coalesce(anterior,'{}')) LOOP
     IF (atual->a.key) IS DISTINCT FROM a.value THEN RAISE EXCEPTION 'Conflito em %. Outro usuário alterou o registro. Sua edição foi preservada para revisão.',tabela USING ERRCODE='40001'; END IF;
    END LOOP;
   END IF;
  END IF;
  IF coalesce((op->>'remove')::boolean,false) THEN
   IF tabela='profiles' THEN RAISE EXCEPTION 'Exclusão não permitida nesta tabela'; END IF;
   EXECUTE format('DELETE FROM public.%I t USING jsonb_populate_record(NULL::public.%I,$1) k WHERE %s',tabela,tabela,filtro) USING chave;
   GET DIAGNOSTICS quantidade=ROW_COUNT;
   IF quantidade<>1 THEN RAISE EXCEPTION 'Exclusão não autorizada'; END IF;
  ELSIF op ? 'action' THEN
   IF op->>'action' NOT IN ('agenda','agenda_atualizar','evento','evento_status','evento_cor','evento_mover','resposta','conversa','mensagem','exclusao','decidir_exclusao','lida','pessoal') THEN RAISE EXCEPTION 'Ação não permitida'; END IF;
   resultado:=public.erp_collab_action(op->>'action',op->'payload');
   IF op ? 'tempId' THEN aliases:=aliases||jsonb_build_object(op->>'tempId',resultado->>'id'); END IF;
  ELSE
   IF tabela IS NULL OR mudancas IS NULL OR jsonb_typeof(mudancas)<>'object' OR mudancas='{}' THEN RAISE EXCEPTION 'Alteração inválida'; END IF;
   IF NOT coalesce((op->>'insert')::boolean,false) AND (mudancas ? 'id' OR mudancas ? 'created_by' OR mudancas ? 'criado_por' OR mudancas ? 'referencia_tabela' OR mudancas ? 'referencia_id') THEN RAISE EXCEPTION 'Identidade do registro não pode ser alterada'; END IF;
   IF coalesce((op->>'insert')::boolean,false) THEN
    mudancas:=mudancas||chave;
    SELECT string_agg(format('%I',key),','), string_agg(format('r.%I',key),',') INTO colunas,valores FROM jsonb_each(mudancas);
    consulta:=format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r',tabela,colunas,valores,tabela);
    EXECUTE consulta USING mudancas;
   ELSE
    SELECT string_agg(format('%I=r.%I',key,key),',') INTO atribuicoes FROM jsonb_each(mudancas);
    EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r, jsonb_populate_record(NULL::public.%I,$2) k WHERE %s',tabela,atribuicoes,tabela,tabela,filtro) USING mudancas,chave;
    GET DIAGNOSTICS quantidade=ROW_COUNT;
    IF quantidade<>1 THEN RAISE EXCEPTION 'Gravação não autorizada ou registro ambíguo'; END IF;
   END IF;
  END IF;
 END LOOP;
 resultado:=jsonb_build_object('aliases',aliases);
 INSERT INTO public.integracao_pedidos(usuario_id,pedido,resumo,resultado) VALUES(auth.uid(),pedido,md5(operacoes::text),resultado);
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.integracao_gravar(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_gravar(jsonb,uuid) TO authenticated;

DO $$ DECLARE t record; total_depois bigint; assinatura_depois text; BEGIN
 FOR t IN SELECT * FROM pg_temp.integracao_antes LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg((to_jsonb(r)-ARRAY[''integracao_nucleo_id'',''integracao_etapa_id''])::text,'''' ORDER BY (to_jsonb(r)-ARRAY[''integracao_nucleo_id'',''integracao_etapa_id''])::text),'''')) FROM public.%I r',t.tabela) INTO total_depois,assinatura_depois;
  IF total_depois<>t.total OR assinatura_depois<>t.assinatura THEN RAISE EXCEPTION 'Os dados de % mudaram durante a preparação. A operação foi cancelada para preservar os registros.',t.tabela; END IF;
 END LOOP;
END $$;
