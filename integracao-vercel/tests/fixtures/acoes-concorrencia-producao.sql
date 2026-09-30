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
