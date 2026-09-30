-- Restore the previous application deployment before removing the new endpoints.
BEGIN;
DROP FUNCTION public.integracao_financeiro_editar_conciliado(uuid,jsonb,jsonb);
DROP FUNCTION public.integracao_crm_institucional_conciliado(uuid,jsonb,jsonb);
CREATE OR REPLACE FUNCTION integracao_crm_privado.converter_lead(p_card uuid, p_municipio uuid, p_remessa uuid, p_dados jsonb, p_anterior jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.integracao_crm_cards; cliente uuid; campo text; codigo_remessa text; proximo integer; begin
 if not integracao_crm_privado.card_permitido(p_card) then raise exception 'Sem permissão';end if;
 select * into c from public.integracao_crm_cards where id=p_card for update;
 if c.origem='vinculado' then raise exception 'Este contato já foi vinculado';end if;
 if p_dados->>'status' not in ('Contrato','Cliente ativo') or p_dados->>'status' is null then raise exception 'Escolha Contrato para confirmar o cliente';end if;
 if c.cliente_id is not null then
 if exists(select 1 from public.fin_receb_clientes where id=c.cliente_id and municipio_id=p_municipio and remessa_id=p_remessa) and to_jsonb(c) @> p_dados then return c.cliente_id;end if;
 raise exception 'Lead já convertido. Atualize a ficha';end if;
 foreach campo in array array['status','valor_total','forma_negociacao','parcelas','desconto_percentual','entrada_percentual'] loop
 if not coalesce(p_anterior ? campo,false) or (to_jsonb(c)->campo) is distinct from p_anterior->campo then raise exception 'A negociação mudou. Reabra a ficha antes de confirmar';end if;end loop;
 if c.lead_municipio_id is not null and c.lead_municipio_id<>p_municipio then raise exception 'A remessa deve pertencer ao município do lead';end if;
 select codigo into codigo_remessa from public.fin_receb_remessas where id=p_remessa and municipio_id=p_municipio and ativo;
 if not found then raise exception 'Confirme uma remessa ativa do município';end if;
 perform pg_advisory_xact_lock(hashtextextended('cliente-remessa:'||p_remessa::text,0));
 select coalesce(max(substring(codigo from '_([0-9]+)$')::integer),0)+1 into proximo from public.fin_receb_clientes where remessa_id=p_remessa;
 perform set_config('integracao.conversao_lead',p_card::text,true);
 insert into public.fin_receb_clientes(municipio_id,remessa_id,codigo,nome,cpf_cnpj) values(p_municipio,p_remessa,codigo_remessa||'_'||lpad(proximo::text,greatest(3,length(proximo::text)),'0'),c.lead_nome,c.lead_cpf) returning id into cliente;
 perform set_config('integracao.conversao_lead','',true);
 insert into public.integracao_moradores(colecao,registro_id,referencia_tabela,referencia_id,criado_por,dados)
 values('processos',cliente::text,'fin_receb_clientes',cliente,auth.uid(),jsonb_build_object('municipioId',p_municipio,'remessaId',p_remessa,'requerente',jsonb_build_object('telefone',c.lead_telefone))||case when c.lead_nucleo_id is null then '{}'::jsonb else jsonb_build_object('nucleoId',c.lead_nucleo_id::text) end);
 update public.integracao_crm_cards set status=p_dados->>'status',valor_total=(p_dados->>'valor_total')::numeric,forma_negociacao=p_dados->>'forma_negociacao',parcelas=(p_dados->>'parcelas')::integer,desconto_percentual=(p_dados->>'desconto_percentual')::numeric,entrada_percentual=(p_dados->>'entrada_percentual')::numeric,lead_municipio_id=p_municipio,updated_at=clock_timestamp() where id=p_card;
 return cliente;
end $function$;

CREATE OR REPLACE FUNCTION integracao_crm_privado.definir_comerciais(p_card uuid, p_responsaveis uuid[], p_anteriores uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.integracao_crm_cards; atuais uuid[]; anteriores uuid[]; novos uuid[]; principal uuid;begin
 select * into c from public.integracao_crm_cards where id=p_card for update;
 if not found or not integracao_crm_privado.card_permitido(p_card) then raise exception 'Sem permissão';end if;
 if c.cliente_id is not null or c.origem='vinculado' then raise exception 'Edite os responsáveis enquanto o contato ainda é um lead';end if;
 novos:=integracao_crm_privado.validar_comerciais(p_responsaveis);
 select coalesce(array_agg(distinct u order by u),'{}'::uuid[]) into atuais from unnest(array_remove(array[c.responsavel_id],null)||c.comerciais_adicionais) u;
 select coalesce(array_agg(distinct u order by u),'{}'::uuid[]) into anteriores from unnest(p_anteriores) u;
 if atuais=novos then return;end if;
 if atuais is distinct from anteriores then raise exception 'Os responsáveis mudaram. Feche e reabra esta janela antes de salvar';end if;
 principal:=case when c.responsavel_id=any(novos) then c.responsavel_id else novos[1] end;
 update public.integracao_crm_cards set responsavel_id=principal,comerciais_adicionais=array_remove(novos,principal),updated_at=clock_timestamp() where id=p_card;
end $function$;

CREATE OR REPLACE FUNCTION integracao_crm_privado.followup(p_card uuid, p_pedido uuid, p_anterior uuid, p_dias integer, p_resumo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare atual public.integracao_crm_followups; repetido public.integracao_crm_followups; novo uuid; instante timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or not integracao_crm_privado.card_permitido(p_card) then raise exception 'Sem permissão para este cliente';end if;
 perform 1 from public.integracao_crm_cards where id=p_card and origem<>'vinculado' and arquivado_em is null for update;
 if not found or not integracao_crm_privado.card_permitido(p_card) then raise exception 'Cliente indisponível ou transferido';end if;
 if p_dias is null or p_dias not between 1 and 3650 or p_pedido is null then raise exception 'Selecione um prazo de 1 a 3650 dias';end if;
 select * into repetido from public.integracao_crm_followups where pedido_id=p_pedido;
 if found then
  if repetido.card_id<>p_card or repetido.criado_por<>auth.uid() then raise exception 'Pedido inválido';end if;
  return repetido.id;
 end if;
 select * into atual from public.integracao_crm_followups where card_id=p_card and status='pendente' for update;
 if atual.id is distinct from p_anterior then raise exception 'O FollowUp mudou. Atualize a ficha antes de registrar';end if;
 if atual.id is not null then
  if p_resumo is null or length(trim(p_resumo)) not between 5 and 2000 then raise exception 'Escreva um breve resumo, de 5 a 2000 caracteres, do que foi feito ou descoberto';end if;
  update public.integracao_crm_followups set status='feito',concluido_em=instante,concluido_por=auth.uid(),resumo=trim(p_resumo) where id=atual.id;
 elsif nullif(trim(p_resumo),'') is not null then raise exception 'Agende o primeiro FollowUp antes de registrar a conclusão';
 end if;
 insert into public.integracao_crm_followups(card_id,pedido_id,criado_por,criado_em,prazo_dias,previsto_em)
 values(p_card,p_pedido,auth.uid(),instante,p_dias,instante+make_interval(days=>p_dias)) returning id into novo;
 return novo;
end $function$;

CREATE OR REPLACE FUNCTION integracao_crm_privado.institucional_followup(p_card uuid, p_pedido uuid, p_anterior uuid, p_dias integer, p_resumo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare atual public.integracao_crm_institucionais_followups; repetido public.integracao_crm_institucionais_followups; novo uuid; instante timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or not integracao_crm_privado.institucional_permitido(p_card) then raise exception 'Sem permissão para este cliente';end if;
 perform 1 from public.integracao_crm_institucionais where id=p_card and status='Em negociação' for update;
 if not found or not integracao_crm_privado.institucional_permitido(p_card) then raise exception 'Cliente indisponível ou transferido';end if;
 if p_dias is null or p_dias not between 1 and 3650 or p_pedido is null then raise exception 'Selecione um prazo de 1 a 3650 dias';end if;
 select * into repetido from public.integracao_crm_institucionais_followups where pedido_id=p_pedido;
 if found then
  if repetido.card_id<>p_card or repetido.criado_por<>auth.uid() then raise exception 'Pedido inválido';end if;
  return repetido.id;
 end if;
 select * into atual from public.integracao_crm_institucionais_followups where card_id=p_card and status='pendente' for update;
 if atual.id is distinct from p_anterior then raise exception 'O FollowUp mudou. Atualize a ficha antes de registrar';end if;
 if atual.id is not null then
  if p_resumo is null or length(trim(p_resumo)) not between 5 and 2000 then raise exception 'Escreva um breve resumo, de 5 a 2000 caracteres, do que foi feito ou descoberto';end if;
  update public.integracao_crm_institucionais_followups set status='feito',concluido_em=instante,concluido_por=auth.uid(),resumo=trim(p_resumo) where id=atual.id;
 elsif nullif(trim(p_resumo),'') is not null then raise exception 'Agende o primeiro FollowUp antes de registrar a conclusão';
 end if;
 insert into public.integracao_crm_institucionais_followups(card_id,pedido_id,criado_por,criado_em,prazo_dias,previsto_em)
 values(p_card,p_pedido,auth.uid(),instante,p_dias,instante+make_interval(days=>p_dias)) returning id into novo;
 return novo;
end $function$;

CREATE OR REPLACE FUNCTION public.integracao_financeiro_importar(p_itens jsonb, p_arquivo text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$declare item jsonb;n integer:=0;begin
if not integracao_financeiro_privado.operar() then raise exception 'Sem permissão financeira';end if;
if p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 500 then raise exception 'Selecione de 1 a 500 parcelas';end if;
for item in select value from jsonb_array_elements(p_itens) order by value->>'id' loop perform public.integracao_financeiro_editar((item->>'id')::uuid,(item->>'versao')::bigint,item->'dados');n=n+1;end loop;
insert into public.fin_receb_importacoes(arquivo_nome,total_registros,conciliados,pendentes,created_by) values(left(p_arquivo,240),n,n,0,auth.uid());return n;
end$function$;

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
    -- Read receipts are per-user, monotonic metadata, not a whole-chat edit.
    -- Preserve every other user's receipt and all non-chat optimistic checks.
    IF tabela='integracao_chat' AND chave->>'colecao'='conversas'
       AND NOT coalesce((op->>'remove')::boolean,false)
       AND jsonb_typeof(mudancas->'dados'->'lidaPor')='object'
       AND ((mudancas->'dados')-'lidaPor') IS NOT DISTINCT FROM ((anterior->'dados')-'lidaPor')
       AND jsonb_typeof(mudancas->'dados'->'lidaPor'->('erp_'||auth.uid()::text))='string' THEN
      mudancas:=jsonb_set(mudancas,'{dados}',
        (atual->'dados') || jsonb_build_object('lidaPor',
          coalesce(atual->'dados'->'lidaPor','{}'::jsonb) || jsonb_build_object(
            'erp_'||auth.uid()::text,
            CASE WHEN (atual->'dados'->'lidaPor'->>('erp_'||auth.uid()::text))::timestamptz >
                      (mudancas->'dados'->'lidaPor'->>('erp_'||auth.uid()::text))::timestamptz
              THEN atual->'dados'->'lidaPor'->('erp_'||auth.uid()::text)
              ELSE mudancas->'dados'->'lidaPor'->('erp_'||auth.uid()::text) END)));
      anterior:=jsonb_set(anterior,'{dados}',atual->'dados');
    END IF;
    -- A read marker is additive and owned by the caller, even from a stale draft.
    IF tabela='integracao_notificacoes' AND chave->>'colecao'='notificacoes'
       AND NOT coalesce((op->>'remove')::boolean,false)
       AND jsonb_typeof(mudancas->'dados'->'lidaPor')='array'
       AND jsonb_typeof(atual->'dados'->'lidaPor')='array'
       AND ((mudancas->'dados')-'lidaPor') IS NOT DISTINCT FROM ((anterior->'dados')-'lidaPor')
       AND (mudancas->'dados'->'lidaPor') @> jsonb_build_array('erp_'||auth.uid()::text) THEN
      mudancas:=jsonb_set(mudancas,'{dados}',
        (atual->'dados') || jsonb_build_object('lidaPor',
          CASE WHEN (atual->'dados'->'lidaPor') @> jsonb_build_array('erp_'||auth.uid()::text)
            THEN atual->'dados'->'lidaPor'
            ELSE (atual->'dados'->'lidaPor') || jsonb_build_array('erp_'||auth.uid()::text) END));
      anterior:=jsonb_set(anterior,'{dados}',atual->'dados');
    END IF;
    -- Compare edited JSON fields, not the entire resident document.
    -- Inserts/deletes and other columns retain their original optimistic checks.
    IF ((tabela='integracao_moradores' AND chave->>'colecao'='processos') OR tabela IN (
         'integracao_nucleos','integracao_municipios','integracao_remessas','integracao_metas',
         'integracao_planos','integracao_ordens_servico','integracao_calendario','integracao_usuarios'))
       AND NOT coalesce((op->>'remove')::boolean,false)
       AND jsonb_typeof(anterior->'dados')='object'
       AND jsonb_typeof(mudancas->'dados')='object'
       AND jsonb_typeof(atual->'dados')='object' THEN
      BEGIN
       mudancas:=jsonb_set(mudancas,'{dados}',public.integracao_mesclar_json_seguro(
         anterior->'dados',mudancas->'dados',atual->'dados'));
      EXCEPTION WHEN SQLSTATE 'PT409' THEN
       RAISE EXCEPTION 'Conflito em %. O mesmo campo recebeu alterações diferentes. Sua edição foi preservada para revisão.',tabela USING ERRCODE='PT409';
      END;
      anterior:=jsonb_set(anterior,'{dados}',atual->'dados');
    END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.integracao_mesclar_json_seguro(base jsonb, local jsonb, remoto jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE campo text; valor jsonb; resultado jsonb := '{}';
BEGIN
 IF local IS NOT DISTINCT FROM base THEN RETURN remoto; END IF;
 IF remoto IS NOT DISTINCT FROM base OR local IS NOT DISTINCT FROM remoto THEN RETURN local; END IF;
 IF (jsonb_typeof(base)='object' OR base IS NULL)
    AND jsonb_typeof(local)='object' AND jsonb_typeof(remoto)='object' THEN
  FOR campo IN SELECT jsonb_object_keys(local) UNION SELECT jsonb_object_keys(remoto) LOOP
   valor := public.integracao_mesclar_json_seguro(base->campo,local->campo,remoto->campo);
   IF valor IS NOT NULL THEN resultado := resultado || jsonb_build_object(campo,valor); END IF;
  END LOOP;
  RETURN resultado;
 END IF;
 RAISE EXCEPTION 'Conflito em integracao_moradores. O mesmo campo recebeu alterações diferentes. Sua edição foi preservada para revisão.' USING ERRCODE='PT409';
END $function$;

CREATE OR REPLACE FUNCTION public.reorder_plan_steps(p_plan_id uuid, p_step_ids uuid[], p_expected_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  current_ids uuid[];
begin
  if auth.uid() is null or not coalesce(public.can_manage_core(), false) then
    raise exception 'Sem permissao para reordenar etapas' using errcode = '42501';
  end if;

  perform 1 from public.planos_trabalho where id = p_plan_id for update;
  if not found then
    raise exception 'Plano indisponivel' using errcode = '42501';
  end if;
  perform 1 from public.etapas_plano where plano_id = p_plan_id order by id for update;
  select array_agg(id order by ordem, id) into current_ids
    from public.etapas_plano where plano_id = p_plan_id;

  if current_ids is distinct from p_expected_ids then
    raise exception 'As etapas foram alteradas. Reabra o plano e tente novamente.' using errcode = '40001';
  end if;
  if p_step_ids is null or cardinality(p_step_ids) <> coalesce(cardinality(current_ids), 0)
    or (select count(distinct id) from unnest(p_step_ids) as ids(id)) <> cardinality(p_step_ids)
    or not (p_step_ids <@ current_ids and current_ids <@ p_step_ids) then
    raise exception 'Lista de etapas invalida' using errcode = '22023';
  end if;

  update public.etapas_plano as step set ordem = (position.n - 1)::integer
    from unnest(p_step_ids) with ordinality as position(id, n)
    where step.id = position.id and step.plano_id = p_plan_id
      and step.ordem is distinct from (position.n - 1)::integer;
end;
$function$;
COMMIT;
