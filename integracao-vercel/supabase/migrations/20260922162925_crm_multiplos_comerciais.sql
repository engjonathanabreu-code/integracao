begin;
-- Keep the original owner for existing integrations; extra owners share the same card/history.
alter table public.integracao_crm_cards add column comerciais_adicionais uuid[] not null default '{}';
-- UPDATE grants are column-scoped; ownership can only change through the checked RPCs.
create or replace function integracao_crm_privado.card_permitido(card uuid) returns boolean language sql stable security definer set search_path='' as $$
 select integracao_crm_privado.permite('crm') and exists(select 1 from public.integracao_crm_cards c where c.id=card and (c.responsavel_id=auth.uid() or auth.uid()=any(c.comerciais_adicionais) or integracao_crm_privado.permite('admin')))
$$;
alter policy cards_ler on public.integracao_crm_cards using((select integracao_crm_privado.permite('crm')) and (responsavel_id=(select auth.uid()) or (select auth.uid())=any(comerciais_adicionais) or (select integracao_crm_privado.permite('admin'))));

create function integracao_crm_privado.validar_comerciais(ids uuid[]) returns uuid[] language plpgsql stable security definer set search_path='' as $$
declare limpos uuid[];begin
 if not integracao_crm_privado.permite('crm') then raise exception 'Sem permissão';end if;
 select array_agg(distinct u order by u) into limpos from unnest(ids) u;
 if coalesce(cardinality(limpos),0)=0 or array_position(limpos,null) is not null then raise exception 'Marque pelo menos um comercial responsável';end if;
 if exists(select 1 from unnest(limpos) u where not exists(select 1 from public.profiles p where p.id=u and p.ativo and p.tipo='Comercial')) then raise exception 'Selecione apenas comerciais ativos';end if;
 return limpos;
end $$;

create function integracao_crm_privado.definir_comerciais(p_card uuid,p_responsaveis uuid[],p_anteriores uuid[]) returns void language plpgsql security definer set search_path='' as $$
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
end $$;
create function public.integracao_crm_definir_comerciais(p_card uuid,p_responsaveis uuid[],p_anteriores uuid[]) returns void language sql security invoker set search_path='' as $$select integracao_crm_privado.definir_comerciais(p_card,p_responsaveis,p_anteriores)$$;

create function integracao_crm_privado.cadastrar_lead_compartilhado(p_id uuid,p_nome text,p_telefone text,p_municipio uuid,p_responsaveis uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare novos uuid[]; existente boolean; resultado uuid;begin
 novos:=integracao_crm_privado.validar_comerciais(p_responsaveis);
 -- Serialize repeated creation and duplicate checks before calling the legacy creator.
 perform pg_advisory_xact_lock(hashtextextended('lead-compartilhado:'||p_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('lead-telefone:'||coalesce(p_municipio::text,'')||regexp_replace(coalesce(p_telefone,''),'\D','','g'),0));
 existente:=exists(select 1 from public.integracao_crm_cards where id=p_id);
 if not existente and exists(select 1 from public.integracao_crm_cards c where c.lead_municipio_id=p_municipio and regexp_replace(c.lead_telefone,'\D','','g')=regexp_replace(p_telefone,'\D','','g') and c.origem<>'vinculado' and c.status<>'Perdido' and (c.responsavel_id=any(novos) or c.comerciais_adicionais&&novos)) then raise exception 'Já existe um lead desse telefone e município para um dos comerciais selecionados';end if;
 resultado:=integracao_crm_privado.cadastrar_lead(p_id,p_nome,p_telefone,p_municipio,novos[1]);
 -- A repeated request never restores memberships removed after the first successful creation.
 if not existente then update public.integracao_crm_cards set comerciais_adicionais=array_remove(novos,novos[1]),updated_at=clock_timestamp() where id=resultado;end if;
 return resultado;
end $$;
create function public.integracao_crm_cadastrar_lead_compartilhado(p_id uuid,p_nome text,p_telefone text,p_municipio uuid,p_responsaveis uuid[]) returns uuid language sql security invoker set search_path='' as $$select integracao_crm_privado.cadastrar_lead_compartilhado(p_id,p_nome,p_telefone,p_municipio,p_responsaveis)$$;

create or replace function integracao_crm_privado.transferir(card uuid,destino uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.integracao_crm_cards where id=card for update;
 if not integracao_crm_privado.card_permitido(card) then raise exception 'Sem permissão';end if;
 if not exists(select 1 from public.profiles where id=destino and ativo and tipo='Comercial') then raise exception 'Escolha um comercial ativo';end if;
 update public.integracao_crm_cards set responsavel_id=destino,comerciais_adicionais='{}',updated_at=now() where id=card;
end $$;

revoke all on function integracao_crm_privado.validar_comerciais(uuid[]),integracao_crm_privado.definir_comerciais(uuid,uuid[],uuid[]),integracao_crm_privado.cadastrar_lead_compartilhado(uuid,text,text,uuid,uuid[]),public.integracao_crm_definir_comerciais(uuid,uuid[],uuid[]),public.integracao_crm_cadastrar_lead_compartilhado(uuid,text,text,uuid,uuid[]) from public,anon;
grant execute on function integracao_crm_privado.definir_comerciais(uuid,uuid[],uuid[]),integracao_crm_privado.cadastrar_lead_compartilhado(uuid,text,text,uuid,uuid[]),public.integracao_crm_definir_comerciais(uuid,uuid[],uuid[]),public.integracao_crm_cadastrar_lead_compartilhado(uuid,text,text,uuid,uuid[]) to authenticated;

create or replace view public.integracao_crm_funil with (security_invoker=true) as
 SELECT c.id,
    c.cliente_id,
    c.responsavel_id,
    c.status,
    c.lead_nome,
    c.lead_telefone,
    c.lead_cidade,
    c.origem,
    c.origem_id,
    c.created_at,
    c.updated_at,
    f.nome,
    f.cpf_cnpj,
    f.codigo,
    COALESCE(f.municipio_id, c.lead_municipio_id) AS municipio_id,
    f.remessa_id,
    m.nome AS municipio,
    r.nome AS remessa,
    (e.dados -> 'requerente'::text) ->> 'telefone'::text AS telefone,
    c.origem_dados,
    c.valor_total,
    c.forma_negociacao,
    c.parcelas,
    c.desconto_percentual,
    c.entrada_percentual,
    c.lead_municipio_id,
    e.dados ->> 'nucleoId'::text AS nucleo_id,
    array_remove(array[c.responsavel_id],null)||c.comerciais_adicionais as responsaveis_ids
   FROM integracao_crm_cards c
     LEFT JOIN fin_receb_clientes f ON f.id = c.cliente_id
     LEFT JOIN fin_receb_municipios m ON m.id = COALESCE(f.municipio_id, c.lead_municipio_id)
     LEFT JOIN fin_receb_remessas r ON r.id = f.remessa_id
     LEFT JOIN integracao_moradores e ON e.referencia_id = f.id AND e.colecao = 'processos'::text;

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
   update public.integracao_crm_cards destino set comerciais_adicionais=array(select distinct u from unnest(destino.comerciais_adicionais||origem.comerciais_adicionais||array[origem.responsavel_id]) u where u is not null and u is distinct from destino.responsavel_id),updated_at=now() from public.integracao_crm_cards origem where destino.id=existente and origem.id=card;
   update public.integracao_crm_cards set origem='vinculado',responsavel_id=null,comerciais_adicionais='{}' where id=card;
 else
   update public.integracao_crm_cards set cliente_id=cliente,updated_at=now() where id=card;
   update public.integracao_crm_conversas set identidade_confirmada=true where card_id=card;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
