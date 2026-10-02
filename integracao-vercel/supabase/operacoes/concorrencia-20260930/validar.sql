CREATE TEMP TABLE sync_audit_init(dummy boolean);
CREATE FUNCTION pg_temp.validar_concorrencia(p_simular_migracoes boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $verify$
DECLARE usuarios jsonb; u jsonb; r jsonb; atual jsonb; op jsonb; tabela text; estado text; relatorio jsonb:='[]'; contador integer:=0;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('id',id,'ativo',ativo)) INTO usuarios FROM public.profiles;
 BEGIN
 IF p_simular_migracoes THEN EXECUTE $migrations$-- Safe three-way reconciliation for every shared row, retaining row locks and RLS.
CREATE OR REPLACE FUNCTION public.integracao_mesclar_json_seguro(base jsonb, local jsonb, remoto jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE campo text; valor jsonb; resultado jsonb := '{}'; identificador jsonb; b jsonb; l jsonb; r jsonb;
BEGIN
 IF local IS NOT DISTINCT FROM base THEN RETURN remoto; END IF;
 IF remoto IS NOT DISTINCT FROM base OR local IS NOT DISTINCT FROM remoto THEN RETURN local; END IF;
 IF (jsonb_typeof(base)='object' OR base IS NULL)
    AND jsonb_typeof(local)='object' AND jsonb_typeof(remoto)='object' THEN
  FOR campo IN SELECT jsonb_object_keys(coalesce(base,'{}')) UNION SELECT jsonb_object_keys(local) UNION SELECT jsonb_object_keys(remoto) LOOP
   valor := public.integracao_mesclar_json_seguro(base->campo,local->campo,remoto->campo);
   IF valor IS NOT NULL THEN resultado := resultado || jsonb_build_object(campo,valor); END IF;
  END LOOP;
  RETURN resultado;
 END IF;
 -- Only lists with unique, stable string IDs are merged by item. Ordered scalar
 -- lists stay atomic: merging arbitrary arrays would invent domain semantics.
 IF jsonb_typeof(base)='array' AND jsonb_typeof(local)='array' AND jsonb_typeof(remoto)='array'
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(base||local||remoto) e
                    WHERE jsonb_typeof(e)<>'object' OR jsonb_typeof(e->'id') IS DISTINCT FROM 'string')
    AND (SELECT count(*)=count(DISTINCT e->'id') FROM jsonb_array_elements(base) e)
    AND (SELECT count(*)=count(DISTINCT e->'id') FROM jsonb_array_elements(local) e)
    AND (SELECT count(*)=count(DISTINCT e->'id') FROM jsonb_array_elements(remoto) e) THEN
  resultado:='[]';
  FOR identificador IN SELECT e->'id' FROM jsonb_array_elements(remoto||local) WITH ORDINALITY x(e,pos)
                       GROUP BY e->'id' ORDER BY min(pos) LOOP
   SELECT e INTO b FROM jsonb_array_elements(base) e WHERE e->'id'=identificador;
   SELECT e INTO l FROM jsonb_array_elements(local) e WHERE e->'id'=identificador;
   SELECT e INTO r FROM jsonb_array_elements(remoto) e WHERE e->'id'=identificador;
   valor:=public.integracao_mesclar_json_seguro(b,l,r);
   IF valor IS NOT NULL THEN resultado:=resultado||jsonb_build_array(valor); END IF;
  END LOOP;
  RETURN resultado;
 END IF;
 RAISE EXCEPTION 'O mesmo campo recebeu alterações diferentes.' USING ERRCODE='PT409';
END $$;
REVOKE ALL ON FUNCTION public.integracao_mesclar_json_seguro(jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integracao_mesclar_json_seguro(jsonb,jsonb,jsonb) TO authenticated;

DO $patch$
DECLARE original text; atualizado text; inicio integer; fim integer;
BEGIN
 SELECT pg_get_functiondef('public.integracao_gravar(jsonb,uuid)'::regprocedure) INTO original;
 IF md5(original)<>'76b2c115d4ee7861a605085eeaae6893' THEN
  RAISE EXCEPTION 'integracao_gravar changed; review global reconciliation before applying';
 END IF;
 inicio:=position('    -- Compare edited JSON fields' in original);
 fim:=position('    END LOOP;' in substring(original FROM inicio));
 IF inicio=0 OR fim=0 THEN RAISE EXCEPTION 'Reconciliation anchor absent'; END IF;
 atualizado:=overlay(original placing $new$    -- A repeated completion has one result. Keep the first recorded author/time.
    IF tabela='meta_checklist' AND NOT coalesce((op->>'remove')::boolean,false)
       AND mudancas ? 'concluido' AND (atual->'concluido') IS NOT DISTINCT FROM (mudancas->'concluido')
       AND (anterior->'concluido') IS DISTINCT FROM (mudancas->'concluido') THEN
      mudancas:=mudancas-'concluido_em'-'concluido_por';
      anterior:=anterior-'concluido_em'-'concluido_por';
    END IF;
    FOR a IN SELECT * FROM jsonb_each(coalesce(anterior,'{}')) LOOP
     IF (atual->a.key) IS DISTINCT FROM a.value THEN
      IF NOT coalesce((op->>'remove')::boolean,false) AND mudancas ? a.key THEN
       BEGIN
        mudancas:=jsonb_set(mudancas,ARRAY[a.key],public.integracao_mesclar_json_seguro(
          a.value,mudancas->a.key,atual->a.key));
       EXCEPTION WHEN SQLSTATE 'PT409' THEN
        RAISE EXCEPTION 'Alterações diferentes em %. Revise o campo % para continuar.',tabela,a.key
          USING ERRCODE='PT409',DETAIL=jsonb_build_object('tabela',tabela,'chave',chave,'campo',a.key)::text;
       END;
      ELSE
       RAISE EXCEPTION 'O registro mudou antes da exclusão ou alteração em %.',tabela USING ERRCODE='PT409';
      END IF;
     END IF;
    END LOOP;$new$ from inicio for fim+length('    END LOOP;')-1);
 -- Concurrent creation of the same complement is reconciled too. Conflict
 -- handling targets only the primary key; other unique constraints still fail.
 atualizado:=replace(atualizado,
 $old$    consulta:=format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r',tabela,colunas,valores,tabela);
    EXECUTE consulta USING mudancas;$old$,
 $new$    consulta:=format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r ON CONFLICT (%s) DO NOTHING',tabela,colunas,valores,tabela,
      (SELECT string_agg(format('%I',x),',') FROM unnest(pk) x));
    EXECUTE consulta USING mudancas;
    GET DIAGNOSTICS quantidade=ROW_COUNT;
    IF quantidade=0 THEN
     EXECUTE format('SELECT to_jsonb(t) FROM public.%I t, jsonb_populate_record(NULL::public.%I,$1) k WHERE %s FOR UPDATE OF t',tabela,tabela,filtro) INTO atual USING chave;
     IF atual IS NULL THEN RAISE EXCEPTION 'Registro indisponível ou sem permissão: %',tabela; END IF;
     EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::public.%I,$1))',tabela) INTO resultado USING mudancas;
     FOR a IN SELECT * FROM jsonb_each(mudancas) LOOP
      IF a.key IN ('created_by','criado_por','created_at','updated_at') THEN CONTINUE; END IF;
      BEGIN
       mudancas:=jsonb_set(mudancas,ARRAY[a.key],public.integracao_mesclar_json_seguro(
        CASE WHEN a.key='dados' THEN '{}'::jsonb ELSE NULL::jsonb END,resultado->a.key,atual->a.key));
      EXCEPTION WHEN SQLSTATE 'PT409' THEN
       RAISE EXCEPTION 'O item já foi criado com outro valor em %. Revise o campo %.',tabela,a.key USING ERRCODE='PT409';
      END;
     END LOOP;
     mudancas:=mudancas-'created_by'-'criado_por'-'created_at'-'updated_at'-'referencia_tabela'-'referencia_id';
     FOREACH colunas IN ARRAY pk LOOP mudancas:=mudancas-colunas; END LOOP;
     IF mudancas<>'{}' AND NOT atual @> mudancas THEN
      SELECT string_agg(format('%I=r.%I',key,key),',') INTO atribuicoes FROM jsonb_each(mudancas);
      EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r, jsonb_populate_record(NULL::public.%I,$2) k WHERE %s',tabela,atribuicoes,tabela,tabela,filtro) USING mudancas,chave;
      GET DIAGNOSTICS quantidade=ROW_COUNT;
      IF quantidade<>1 THEN RAISE EXCEPTION 'Gravação não autorizada'; END IF;
     END IF;
    END IF;$new$);
 IF position('ON CONFLICT (%s) DO NOTHING' in atualizado)=0 THEN RAISE EXCEPTION 'Concurrent insert anchor absent'; END IF;
 EXECUTE atualizado;
END $patch$;


-- Dedicated versioned editors use the same merge under their existing RLS and
-- validation. Legacy endpoints remain strict for clients without a baseline.
CREATE FUNCTION public.integracao_financeiro_editar_conciliado(p_id uuid,p_anterior jsonb,p_dados jsonb)
RETURNS public.fin_receb_parcelas LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE atual public.fin_receb_parcelas; anterior public.fin_receb_parcelas; local public.fin_receb_parcelas; k text; dados jsonb:='{}'; alvo jsonb; antigo jsonb; remoto jsonb;
BEGIN
 IF NOT integracao_financeiro_privado.operar() THEN RAISE EXCEPTION 'Acesso financeiro somente para consulta'; END IF;
 SELECT * INTO atual FROM public.fin_receb_parcelas WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parcela indisponível ou sem permissão'; END IF;
 IF jsonb_typeof(p_anterior) IS DISTINCT FROM 'object' OR jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Informe os valores anteriores'; END IF;
 anterior:=jsonb_populate_record(NULL::public.fin_receb_parcelas,p_anterior);
 local:=jsonb_populate_record(anterior,p_dados);
 FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
  IF k NOT IN ('vencimento','valor_previsto','juros','multa','linha_digitavel','nosso_numero','documento','status','pago_em','valor_liquidado','tipo') OR NOT p_anterior ? k THEN RAISE EXCEPTION 'Campo financeiro inválido ou sem valor anterior'; END IF;
  antigo:=to_jsonb(anterior)->k;alvo:=to_jsonb(local)->k;remoto:=to_jsonb(atual)->k;
  IF k='linha_digitavel' THEN antigo:=coalesce(to_jsonb(nullif(anterior.linha_digitavel,'')),'null'::jsonb);alvo:=coalesce(to_jsonb(nullif(local.linha_digitavel,'')),'null'::jsonb); END IF;
  IF alvo IS DISTINCT FROM antigo THEN
   BEGIN dados:=dados||jsonb_build_object(k,public.integracao_mesclar_json_seguro(antigo,alvo,remoto));
   EXCEPTION WHEN SQLSTATE 'PT409' THEN RAISE EXCEPTION 'A parcela recebeu valores diferentes no campo %. Revise para continuar.',k USING ERRCODE='PT409'; END;
  END IF;
 END LOOP;
 IF dados='{}' OR to_jsonb(atual) @> dados THEN RETURN atual; END IF;
 RETURN public.integracao_financeiro_editar(p_id,atual.versao,dados);
END $$;
REVOKE ALL ON FUNCTION public.integracao_financeiro_editar_conciliado(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integracao_financeiro_editar_conciliado(uuid,jsonb,jsonb) TO authenticated;

CREATE FUNCTION public.integracao_crm_institucional_conciliado(p_id uuid,p_anterior jsonb,p_dados jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE atual public.integracao_crm_institucionais; dados jsonb; k text;
BEGIN
 -- The original privileged validator locks and checks the version at write time.
 -- This read uses the existing SELECT policy; no UPDATE grant is added.
 SELECT * INTO atual FROM public.integracao_crm_institucionais WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Negócio indisponível ou sem permissão'; END IF;
 IF jsonb_typeof(p_anterior) IS DISTINCT FROM 'object' OR jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Informe os valores anteriores'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
  IF k NOT IN ('nome','contato','produto','valor','responsavel_id','status','motivo_perda') OR NOT p_anterior ? k THEN RAISE EXCEPTION 'Campo institucional inválido ou sem valor anterior'; END IF;
 END LOOP;
 -- Only edited fields are proposed; other current fields remain current.
 dados:=to_jsonb(atual);
 FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
  BEGIN dados:=jsonb_set(dados,ARRAY[k],public.integracao_mesclar_json_seguro(p_anterior->k,p_dados->k,to_jsonb(atual)->k));
  EXCEPTION WHEN SQLSTATE 'PT409' THEN RAISE EXCEPTION 'O negócio recebeu valores diferentes no campo %. Revise para continuar.',k USING ERRCODE='PT409'; END;
 END LOOP;
 -- Call the original validator even for an idempotent operation, preserving
 -- responsibility and active-account authorization without duplicating rules.
 RETURN public.integracao_crm_salvar_institucional(p_id,atual.versao,dados->>'nome',dados->>'contato',dados->>'produto',(dados->>'valor')::numeric,(dados->>'responsavel_id')::uuid,dados->>'status',dados->>'motivo_perda',NULL);
EXCEPTION WHEN raise_exception THEN
 IF SQLERRM='O negócio foi alterado. Reabra a ficha antes de salvar' THEN RAISE EXCEPTION 'O negócio mudou durante o salvamento.' USING ERRCODE='PT409'; END IF;
 RAISE;
END $$;
REVOKE ALL ON FUNCTION public.integracao_crm_institucional_conciliado(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integracao_crm_institucional_conciliado(uuid,jsonb,jsonb) TO authenticated;

-- Preserve existing authorization/validation and change only concurrency handling.
DO $patch$
DECLARE original text; atualizado text;
BEGIN
 SELECT pg_get_functiondef('public.reorder_plan_steps(uuid,uuid[],uuid[])'::regprocedure) INTO original;
 IF md5(original)<>'c992633e84b9f4c8210e5771cd500d57' THEN RAISE EXCEPTION 'Review current step ordering function'; END IF;
 atualizado:=replace(original,'  if current_ids is distinct from p_expected_ids then',
 '  if current_ids is not distinct from p_step_ids then return; end if;
  if current_ids is distinct from p_expected_ids then');
 IF atualizado=original THEN RAISE EXCEPTION 'Ordering anchor absent'; END IF;EXECUTE atualizado;

 SELECT pg_get_functiondef('integracao_crm_privado.converter_lead(uuid,uuid,uuid,jsonb,jsonb)'::regprocedure) INTO original;
 IF md5(original)<>'ad20187509a0345dedf9d5a0233d9d4b' THEN RAISE EXCEPTION 'Review current lead conversion function'; END IF;
 atualizado:=replace(original,
 $old$ if not coalesce(p_anterior ? campo,false) or (to_jsonb(c)->campo) is distinct from p_anterior->campo then raise exception 'A negociação mudou. Reabra a ficha antes de confirmar';end if;end loop;$old$,
 $new$ if not coalesce(p_anterior ? campo,false) or not coalesce(p_dados ? campo,false) then raise exception 'Informe os valores anteriores da negociação';end if;
 begin
  p_dados:=jsonb_set(p_dados,ARRAY[campo],public.integracao_mesclar_json_seguro(p_anterior->campo,p_dados->campo,to_jsonb(c)->campo));
 exception when sqlstate 'PT409' then raise exception 'A negociação recebeu valores diferentes em %. Revise antes de confirmar.',campo using errcode='PT409';end;
 end loop;$new$);
 IF atualizado=original THEN RAISE EXCEPTION 'Lead conversion anchor absent'; END IF;EXECUTE atualizado;

 SELECT pg_get_functiondef('integracao_crm_privado.definir_comerciais(uuid,uuid[],uuid[])'::regprocedure) INTO original;
 IF md5(original)<>'8e5311958b2554c49e0ca4b982007b94' THEN RAISE EXCEPTION 'Review current assignee function'; END IF;
 atualizado:=replace(original,
 $old$ if atuais is distinct from anteriores then raise exception 'Os responsáveis mudaram. Feche e reabra esta janela antes de salvar';end if;$old$,
 $new$ if atuais is distinct from anteriores then
  select coalesce(array_agg(u order by u),'{}'::uuid[]) into novos from (
   (select unnest(atuais) u except (select unnest(anteriores) except select unnest(novos)))
   union (select unnest(novos) except select unnest(anteriores))) unidos;
  novos:=integracao_crm_privado.validar_comerciais(novos);
 end if;$new$);
 IF atualizado=original THEN RAISE EXCEPTION 'Assignee anchor absent'; END IF;EXECUTE atualizado;

 SELECT pg_get_functiondef('integracao_crm_privado.followup(uuid,uuid,uuid,integer,text)'::regprocedure) INTO original;
 IF md5(original)<>'027db33903e53d2edea1711844c85242' THEN RAISE EXCEPTION 'Review current followup function'; END IF;
 atualizado:=replace(original,
 $old$ if atual.id is distinct from p_anterior then raise exception 'O FollowUp mudou. Atualize a ficha antes de registrar';end if;$old$,
 $new$ if atual.id is distinct from p_anterior then
  if atual.id is not null and atual.prazo_dias=p_dias and (
   (p_anterior is null and nullif(trim(p_resumo),'') is null)
   or exists(select 1 from public.integracao_crm_followups f where f.id=p_anterior and f.card_id=p_card and f.status='feito' and f.resumo=trim(p_resumo))) then return atual.id;end if;
  raise exception 'O FollowUp recebeu outro prazo ou resumo. Confira o agendamento atual.' using errcode='PT409';
 end if;$new$);
 IF atualizado=original THEN RAISE EXCEPTION 'Followup anchor absent'; END IF;
 atualizado:=replace(atualizado,'novo uuid;', 'novo uuid; convergente public.integracao_pedidos; assinatura text;');
 atualizado:=replace(atualizado,' select * into repetido from public.integracao_crm_followups where pedido_id=p_pedido;',
 $receipt$ assinatura:=md5(jsonb_build_object('tipo','followup','card',p_card,'anterior',p_anterior,'dias',p_dias,'resumo',coalesce(trim(p_resumo),''))::text);
 select * into convergente from public.integracao_pedidos where usuario_id=auth.uid() and pedido=p_pedido;
 if found then
  if convergente.resumo<>assinatura then raise exception 'Pedido já utilizado para outra alteração';end if;
  return (convergente.resultado->>'followup')::uuid;
 end if;
 select * into repetido from public.integracao_crm_followups where pedido_id=p_pedido;$receipt$);
 atualizado:=replace(atualizado,'then return atual.id;end if;',
 $receipt$then
  insert into public.integracao_pedidos(usuario_id,pedido,resumo,resultado) values(auth.uid(),p_pedido,assinatura,jsonb_build_object('followup',atual.id));
  return atual.id;end if;$receipt$);
 IF position('convergente.resultado' in atualizado)=0 THEN RAISE EXCEPTION 'Followup receipt anchor absent'; END IF;
 EXECUTE atualizado;

 SELECT pg_get_functiondef('integracao_crm_privado.institucional_followup(uuid,uuid,uuid,integer,text)'::regprocedure) INTO original;
 IF md5(original)<>'e37155b1ba0ecb3c9fb2318912533cc1' THEN RAISE EXCEPTION 'Review current institutional followup function'; END IF;
 atualizado:=replace(original,
 $old$ if atual.id is distinct from p_anterior then raise exception 'O FollowUp mudou. Atualize a ficha antes de registrar';end if;$old$,
 $new$ if atual.id is distinct from p_anterior then
  if atual.id is not null and atual.prazo_dias=p_dias and (
   (p_anterior is null and nullif(trim(p_resumo),'') is null)
   or exists(select 1 from public.integracao_crm_institucionais_followups f where f.id=p_anterior and f.card_id=p_card and f.status='feito' and f.resumo=trim(p_resumo))) then return atual.id;end if;
  raise exception 'O FollowUp recebeu outro prazo ou resumo. Confira o agendamento atual.' using errcode='PT409';
 end if;$new$);
 IF atualizado=original THEN RAISE EXCEPTION 'Followup anchor absent'; END IF;
 atualizado:=replace(atualizado,'novo uuid;', 'novo uuid; convergente public.integracao_pedidos; assinatura text;');
 atualizado:=replace(atualizado,' select * into repetido from public.integracao_crm_institucionais_followups where pedido_id=p_pedido;',
 $receipt$ assinatura:=md5(jsonb_build_object('tipo','institucional_followup','card',p_card,'anterior',p_anterior,'dias',p_dias,'resumo',coalesce(trim(p_resumo),''))::text);
 select * into convergente from public.integracao_pedidos where usuario_id=auth.uid() and pedido=p_pedido;
 if found then
  if convergente.resumo<>assinatura then raise exception 'Pedido já utilizado para outra alteração';end if;
  return (convergente.resultado->>'followup')::uuid;
 end if;
 select * into repetido from public.integracao_crm_institucionais_followups where pedido_id=p_pedido;$receipt$);
 atualizado:=replace(atualizado,'then return atual.id;end if;',
 $receipt$then
  insert into public.integracao_pedidos(usuario_id,pedido,resumo,resultado) values(auth.uid(),p_pedido,assinatura,jsonb_build_object('followup',atual.id));
  return atual.id;end if;$receipt$);
 IF position('convergente.resultado' in atualizado)=0 THEN RAISE EXCEPTION 'Followup receipt anchor absent'; END IF;
 EXECUTE atualizado;

 SELECT pg_get_functiondef('public.integracao_financeiro_importar(jsonb,text)'::regprocedure) INTO original;
 atualizado:=replace(original,
 $old$perform public.integracao_financeiro_editar((item->>'id')::uuid,(item->>'versao')::bigint,item->'dados');$old$,
 $new$if jsonb_typeof(item->'anterior')='object' then
 perform public.integracao_financeiro_editar_conciliado((item->>'id')::uuid,item->'anterior',item->'dados');
 else perform public.integracao_financeiro_editar((item->>'id')::uuid,(item->>'versao')::bigint,item->'dados');end if;$new$);
 IF atualizado=original THEN RAISE EXCEPTION 'Import concurrency anchor absent'; END IF;EXECUTE atualizado;
END $patch$;
NOTIFY pgrst,'reload schema';
$migrations$;END IF;
 FOR u IN SELECT value FROM jsonb_array_elements(usuarios) LOOP
  PERFORM set_config('request.jwt.claim.sub',u->>'id',true);EXECUTE 'SET LOCAL ROLE authenticated';
  IF NOT (u->>'ativo')::boolean THEN
   BEGIN PERFORM public.integracao_gravar('[]',gen_random_uuid());estado:='falha_inativa';
   EXCEPTION WHEN OTHERS THEN estado:=CASE WHEN SQLERRM='Sessão inválida' THEN 'inativa_bloqueada' ELSE 'erro' END;END;
   relatorio:=relatorio||jsonb_build_array(jsonb_build_object('tabela','sessao','resultado',estado));
  ELSE
   BEGIN
    SELECT to_jsonb(c) INTO r FROM public.meta_checklist c LIMIT 1;
    IF r IS NULL THEN estado:='sem_amostra';
    ELSE
     op:=jsonb_build_object('table','meta_checklist','key',jsonb_build_object('id',r->'id'),
      'expected',jsonb_build_object('concluido',NOT (r->>'concluido')::boolean,'concluido_em',null),
      'changes',jsonb_build_object('concluido',r->'concluido','concluido_em',clock_timestamp()));
     PERFORM public.integracao_gravar(jsonb_build_array(op),gen_random_uuid());
     SELECT to_jsonb(c) INTO atual FROM public.meta_checklist c WHERE id=(r->>'id')::uuid;
     IF atual->'concluido_em' IS DISTINCT FROM r->'concluido_em' OR atual->'concluido_por' IS DISTINCT FROM r->'concluido_por' THEN estado:='falha_autoria';ELSE estado:='checklist_ok';END IF;
    END IF;
    RAISE EXCEPTION 'rollback scenario' USING ERRCODE='ZX001';
   EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
    WHEN OTHERS THEN estado:=CASE WHEN SQLSTATE='PT409' THEN 'conflito_falso' ELSE 'sem_permissao_de_edicao' END;
   END;
   relatorio:=relatorio||jsonb_build_array(jsonb_build_object('tabela','meta_checklist','resultado',estado));
   FOREACH tabela IN ARRAY ARRAY['integracao_complementos','integracao_moradores','integracao_nucleos','integracao_municipios','integracao_remessas','integracao_metas','integracao_planos','integracao_ordens_servico','integracao_chat','integracao_usuarios','integracao_calendario','integracao_notificacoes','integracao_auditoria','integracao_configuracoes','integracao_arquivos'] LOOP
    BEGIN
     EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE jsonb_typeof(dados)=''object'' AND NOT dados ? ''__sync_global_probe'' LIMIT 1',tabela) INTO r;
     IF r IS NULL THEN estado:='sem_amostra';
     ELSE
      EXECUTE format('UPDATE public.%I SET dados=dados||''{"__sync_global_probe":{"remoto":1}}''::jsonb WHERE colecao=$1 AND registro_id=$2',tabela) USING r->>'colecao',r->>'registro_id';
      GET DIAGNOSTICS contador=ROW_COUNT;
      IF contador=0 THEN estado:='sem_permissao_de_edicao';
      ELSE
       op:=jsonb_build_object('table',tabela,'key',jsonb_build_object('colecao',r->>'colecao','registro_id',r->>'registro_id'),
        'expected',jsonb_build_object('dados',r->'dados'),'changes',jsonb_build_object('dados',(r->'dados')||'{"__sync_global_probe":{"local":1}}'::jsonb));
       PERFORM public.integracao_gravar(jsonb_build_array(op),gen_random_uuid());
       EXECUTE format('SELECT dados FROM public.%I WHERE colecao=$1 AND registro_id=$2',tabela) INTO atual USING r->>'colecao',r->>'registro_id';
       estado:=CASE WHEN atual->'__sync_global_probe'='{"local":1,"remoto":1}'::jsonb THEN 'campos_independentes_ok' ELSE 'falha_mescla' END;
      END IF;
     END IF;
     RAISE EXCEPTION 'rollback scenario' USING ERRCODE='ZX001';
    EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
     WHEN OTHERS THEN estado:=CASE WHEN SQLSTATE='PT409' THEN 'conflito_falso' ELSE 'sem_permissao_de_edicao' END;
    END;
    relatorio:=relatorio||jsonb_build_array(jsonb_build_object('tabela',tabela,'resultado',estado));
   END LOOP;
  END IF;
  EXECUTE 'RESET ROLE';
 END LOOP;
 RAISE EXCEPTION 'rollback all migrations and scenarios' USING ERRCODE='ZX002';
 EXCEPTION WHEN SQLSTATE 'ZX002' THEN NULL;
 END;
 RETURN jsonb_build_object('contas',jsonb_array_length(usuarios),'resultados',
 (SELECT jsonb_object_agg(resultado,total) FROM (SELECT value->>'resultado' resultado,count(*) total FROM jsonb_array_elements(relatorio) GROUP BY 1) contagens));
END $verify$;
SELECT pg_temp.validar_concorrencia() AS validacao;
