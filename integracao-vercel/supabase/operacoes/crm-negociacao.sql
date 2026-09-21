begin;
alter table public.integracao_crm_cards
 add column valor_total numeric(14,2),
 add column forma_negociacao text,
 add column parcelas integer,
 add column desconto_percentual numeric(5,2),
 add column entrada_percentual numeric(5,2),
 add constraint crm_negociacao_valida check ((
 (valor_total is null and forma_negociacao is null and parcelas is null and desconto_percentual is null and entrada_percentual is null)
 or (valor_total>0 and valor_total<=999999999999.99 and
 ((forma_negociacao='avista' and desconto_percentual between 0 and 100 and parcelas is null and entrada_percentual is null)
 or (forma_negociacao='parcelado' and parcelas between 1 and 999 and desconto_percentual is null and entrada_percentual is null)
 or (forma_negociacao='entrada_parcelas' and parcelas between 1 and 999 and entrada_percentual>0 and entrada_percentual<100 and desconto_percentual is null)))
 ) is true);
grant update(valor_total,forma_negociacao,parcelas,desconto_percentual,entrada_percentual) on public.integracao_crm_cards to authenticated;
comment on column public.integracao_crm_cards.valor_total is 'Valor comercial base em BRL, antes do desconto à vista; exclusivo do CRM, sem gerar cobranças.';
create or replace view public.integracao_crm_funil with(security_invoker=true) as
 select c.id,c.cliente_id,c.responsavel_id,c.status,c.lead_nome,c.lead_telefone,c.lead_cidade,c.origem,c.origem_id,c.created_at,c.updated_at,
 f.nome,f.cpf_cnpj,f.codigo,f.municipio_id,f.remessa_id,m.nome municipio,r.nome remessa,e.dados->'requerente'->>'telefone' telefone,c.origem_dados,c.valor_total,c.forma_negociacao,c.parcelas,c.desconto_percentual,c.entrada_percentual
 from public.integracao_crm_cards c left join public.fin_receb_clientes f on f.id=c.cliente_id
 left join public.fin_receb_municipios m on m.id=f.municipio_id left join public.fin_receb_remessas r on r.id=f.remessa_id
 left join public.integracao_moradores e on e.referencia_id=f.id and e.colecao='processos';
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
      and row(origem.valor_total,origem.forma_negociacao,origem.parcelas,origem.desconto_percentual,origem.entrada_percentual)
      is distinct from row(destino.valor_total,destino.forma_negociacao,destino.parcelas,destino.desconto_percentual,destino.entrada_percentual)) then
     raise exception 'Os contatos têm negociações diferentes. Revise as condições no CRM antes de vincular.';
   end if;
   update public.integracao_crm_cards destino set valor_total=origem.valor_total,forma_negociacao=origem.forma_negociacao,
     parcelas=origem.parcelas,desconto_percentual=origem.desconto_percentual,entrada_percentual=origem.entrada_percentual,updated_at=now()
   from public.integracao_crm_cards origem where destino.id=existente and origem.id=card
     and destino.forma_negociacao is null and origem.forma_negociacao is not null;
   update public.integracao_crm_conversas set card_id=existente,identidade_confirmada=true where card_id=card;
   update public.integracao_crm_atendimentos set card_id=existente where card_id=card;
   update public.integracao_crm_tarefas set card_id=existente where card_id=card;
   -- O lead original permanece no histórico, sem apagar registros.
   update public.integracao_crm_cards set origem='vinculado',responsavel_id=null where id=card;
 else
   update public.integracao_crm_cards set cliente_id=cliente,updated_at=now() where id=card;
   update public.integracao_crm_conversas set identidade_confirmada=true where card_id=card;
 end if;
end $$;

notify pgrst, 'reload schema';
commit;
