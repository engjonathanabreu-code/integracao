begin;
-- Additive: legacy percentages remain untouched and readable.
alter table public.integracao_crm_cards add column entrada_valor numeric(14,2);
grant update(entrada_valor) on public.integracao_crm_cards to authenticated;
alter table public.integracao_crm_cards drop constraint crm_negociacao_valida;
alter table public.integracao_crm_cards add constraint crm_negociacao_valida check ((
 (valor_total is null and forma_negociacao is null and parcelas is null and desconto_percentual is null and entrada_percentual is null and entrada_valor is null)
 or (valor_total>0 and valor_total<=999999999999.99 and (
 (forma_negociacao='avista' and desconto_percentual between 0 and 100 and parcelas is null and entrada_percentual is null and entrada_valor is null)
 or (forma_negociacao='parcelado' and parcelas between 1 and 999 and desconto_percentual is null and entrada_percentual is null and entrada_valor is null)
 or (forma_negociacao='entrada_parcelas' and parcelas between 1 and 999 and desconto_percentual is null and (
 (entrada_valor>0 and entrada_valor<valor_total and entrada_percentual is null)
 or (entrada_valor is null and entrada_percentual>0 and entrada_percentual<100)))
 ))) is true);
-- An older open client must clear the new amount when writing legacy conditions.
create function integracao_crm_privado.compatibilizar_entrada() returns trigger language plpgsql set search_path='' as $$
begin
 if new.entrada_valor is not distinct from old.entrada_valor and new.entrada_percentual is distinct from old.entrada_percentual and new.entrada_percentual is not null then new.entrada_valor:=null;end if;
 return new;
end $$;
revoke all on function integracao_crm_privado.compatibilizar_entrada() from public,anon,authenticated;
create trigger crm_entrada_compatibilidade before update on public.integracao_crm_cards for each row execute function integracao_crm_privado.compatibilizar_entrada();
create or replace view public.integracao_crm_funil with (security_invoker=true) as
 SELECT c.id,c.cliente_id,c.responsavel_id,c.status,c.lead_nome,c.lead_telefone,c.lead_cidade,c.origem,c.origem_id,c.created_at,c.updated_at,
    f.nome,
    CASE WHEN c.cliente_id IS NULL THEN c.lead_cpf ELSE f.cpf_cnpj END AS cpf_cnpj,
    f.codigo,
    COALESCE(f.municipio_id, c.lead_municipio_id) AS municipio_id,
    f.remessa_id,
    m.nome AS municipio,
    r.nome AS remessa,
    (e.dados -> 'requerente'::text) ->> 'telefone'::text AS telefone,
    c.origem_dados,c.valor_total,c.forma_negociacao,c.parcelas,c.desconto_percentual,c.entrada_percentual,c.lead_municipio_id,
    CASE WHEN c.cliente_id IS NULL THEN c.lead_nucleo_id::text ELSE e.dados ->> 'nucleoId'::text END AS nucleo_id,
    array_remove(ARRAY[c.responsavel_id], NULL::uuid) || c.comerciais_adicionais AS responsaveis_ids,c.entrada_valor
   FROM public.integracao_crm_cards c
     LEFT JOIN public.fin_receb_clientes f ON f.id = c.cliente_id
     LEFT JOIN public.fin_receb_municipios m ON m.id = COALESCE(f.municipio_id, c.lead_municipio_id)
     LEFT JOIN public.fin_receb_remessas r ON r.id = f.remessa_id
     LEFT JOIN public.integracao_moradores e ON e.referencia_id = f.id AND e.colecao = 'processos'::text
  WHERE c.arquivado_em IS NULL;

create or replace function integracao_crm_privado.converter_lead(p_card uuid, p_municipio uuid, p_remessa uuid, p_dados jsonb, p_anterior jsonb) returns uuid language plpgsql security definer set search_path to '' as $function$
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
 if p_dados ? 'entrada_valor' and (not coalesce(p_anterior ? 'entrada_valor',false) or to_jsonb(c)->'entrada_valor' is distinct from p_anterior->'entrada_valor') then raise exception 'A negociação mudou. Reabra a ficha antes de confirmar';end if;
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
 update public.integracao_crm_cards set status=p_dados->>'status',valor_total=(p_dados->>'valor_total')::numeric,forma_negociacao=p_dados->>'forma_negociacao',parcelas=(p_dados->>'parcelas')::integer,desconto_percentual=(p_dados->>'desconto_percentual')::numeric,entrada_percentual=(p_dados->>'entrada_percentual')::numeric,entrada_valor=case when p_dados ? 'entrada_valor' then (p_dados->>'entrada_valor')::numeric else null end,lead_municipio_id=p_municipio,updated_at=clock_timestamp() where id=p_card;
 return cliente;
end $function$;
create or replace function integracao_crm_privado.vincular(card uuid,cliente uuid) returns void language plpgsql security definer set search_path='' as $$
declare existente uuid; begin
 perform 1 from public.integracao_crm_cards where id=card for update;
 if not integracao_crm_privado.card_permitido(card) then raise exception 'Sem permissão'; end if;
 if exists(select 1 from public.integracao_crm_cards where id=card and cliente_id is not null and cliente_id<>cliente) then raise exception 'Contato já vinculado a outro cliente'; end if;
 select id into existente from public.integracao_crm_cards where cliente_id=cliente for update;
 if existente is not null and existente<>card then
   if not integracao_crm_privado.card_permitido(existente) then raise exception 'Cliente pertence a outro comercial; solicite revisão administrativa'; end if;
   if exists(select 1 from public.integracao_crm_cards origem join public.integracao_crm_cards destino on destino.id=existente
      where origem.id=card and origem.forma_negociacao is not null and destino.forma_negociacao is not null
      and row(origem.valor_total,origem.forma_negociacao,origem.parcelas,origem.desconto_percentual,coalesce(origem.entrada_valor,round(origem.valor_total*origem.entrada_percentual/100,2)))
      is distinct from row(destino.valor_total,destino.forma_negociacao,destino.parcelas,destino.desconto_percentual,coalesce(destino.entrada_valor,round(destino.valor_total*destino.entrada_percentual/100,2)))) then
     raise exception 'Os contatos têm negociações diferentes. Revise as condições no CRM antes de vincular.';
   end if;
   update public.integracao_crm_cards destino set valor_total=origem.valor_total,forma_negociacao=origem.forma_negociacao,
     parcelas=origem.parcelas,desconto_percentual=origem.desconto_percentual,entrada_percentual=origem.entrada_percentual,entrada_valor=origem.entrada_valor,updated_at=now()
   from public.integracao_crm_cards origem where destino.id=existente and origem.id=card
     and destino.forma_negociacao is null and origem.forma_negociacao is not null;
   update public.integracao_crm_conversas set card_id=existente,identidade_confirmada=true where card_id=card;
   update public.integracao_crm_atendimentos set card_id=existente where card_id=card;
   update public.integracao_crm_tarefas set card_id=existente where card_id=card;
   -- O lead original permanece no histórico, sem apagar registros.
   update public.integracao_crm_cards destino set comerciais_adicionais=array(select distinct u from unnest(destino.comerciais_adicionais||origem.comerciais_adicionais||array[origem.responsavel_id]) u where u is not null and u is distinct from destino.responsavel_id),updated_at=now() from public.integracao_crm_cards origem where destino.id=existente and origem.id=card;
   update public.integracao_crm_cards set origem='vinculado',responsavel_id=null,comerciais_adicionais='{}' where id=card;
 else
   update public.integracao_crm_cards set cliente_id=cliente,updated_at=now() where id=card;
   update public.integracao_crm_conversas set identidade_confirmada=true where card_id=card;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
