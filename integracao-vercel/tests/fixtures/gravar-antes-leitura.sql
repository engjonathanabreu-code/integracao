CREATE OR REPLACE FUNCTION public.integracao_gravar(operacoes jsonb, pedido uuid DEFAULT gen_random_uuid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
   IF tabela NOT IN ('profiles','fin_receb_municipios','fin_receb_remessas','fin_receb_clientes','processos_kanban','processos_kanban_andamentos','processos_kanban_observacoes','processos_kanban_historico','meta_setores','metas','meta_responsaveis','meta_checklist','meta_comentarios','meta_historico','meta_arquivos','ordens_servico','ordem_servico_comentarios','planos_trabalho','etapas_plano','etapa_responsaveis','entregaveis','comentarios_plano','erp_agendas','erp_eventos','erp_conversas','integracao_complementos','integracao_moradores','integracao_nucleos','integracao_municipios','integracao_remessas','integracao_metas','integracao_planos','integracao_ordens_servico','integracao_chat','integracao_usuarios','integracao_calendario','integracao_notificacoes','integracao_auditoria','integracao_configuracoes','integracao_arquivos') THEN RAISE EXCEPTION 'Tabela não permitida'; END IF;
   IF chave IS NULL OR chave='{}' OR jsonb_typeof(chave)<>'object' THEN RAISE EXCEPTION 'Identificador obrigatório'; END IF;
   SELECT array_agg(attr.attname::text ORDER BY attr.attname) INTO pk FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute attr ON attr.attrelid=i.indrelid AND attr.attnum=ANY(i.indkey)
   WHERE i.indrelid=format('public.%I',tabela)::regclass AND i.indisprimary;
   IF pk IS DISTINCT FROM ARRAY(SELECT jsonb_object_keys(chave) ORDER BY 1) THEN RAISE EXCEPTION 'Informe exatamente a chave primária do registro'; END IF;
   SELECT string_agg(format('t.%I=k.%I',key,key),' AND ') INTO filtro FROM jsonb_each(chave);
   IF NOT coalesce((op->>'insert')::boolean,false) THEN
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t, jsonb_populate_record(NULL::public.%I,$1) k WHERE %s FOR UPDATE OF t',tabela,tabela,filtro) INTO atual USING chave;
    IF atual IS NULL THEN RAISE EXCEPTION 'Registro indisponível ou sem permissão: %',tabela; END IF;
    FOR a IN SELECT * FROM jsonb_each(coalesce(anterior,'{}')) LOOP
     IF (atual->a.key) IS DISTINCT FROM a.value THEN RAISE EXCEPTION 'Conflito em %. Outro usuário alterou o registro. Sua edição foi preservada para revisão.',tabela USING ERRCODE='PT409'; END IF;
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
END $function$
