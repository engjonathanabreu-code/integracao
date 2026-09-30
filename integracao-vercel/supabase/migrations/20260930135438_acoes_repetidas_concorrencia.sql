-- Preserve existing authorization/validation and change only concurrency handling.
DO $patch$
DECLARE original text; atualizado text;
BEGIN
 SELECT pg_get_functiondef('public.reorder_plan_steps(uuid,uuid[],uuid[])'::regprocedure) INTO original;
 IF md5(original)<>'c992633e84b9f4c8210e5771cd500d57' THEN RAISE EXCEPTION 'Review current step ordering function'; END IF;
 atualizado:=replace(original,'  if current_ids is distinct from p_expected_ids then',
 '  if p_step_ids is not null and current_ids is not distinct from p_step_ids then return; end if;
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
