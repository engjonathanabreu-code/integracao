-- Record the stage preceding the latest activation without changing existing reports.
alter table public.integracao_crm_ativacoes add column etapa_anterior text;
update public.integracao_crm_ativacoes a set etapa_anterior=(select x.anterior->>'status' from public.integracao_crm_auditoria x where x.tabela='integracao_crm_cards' and x.registro_id=a.card_id and x.atual->>'status'='Cliente ativo' and x.anterior->>'status' is distinct from 'Cliente ativo' order by x.created_at desc,x.id desc limit 1);
create function integracao_crm_privado.meta_venda_origem() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='Cliente ativo' and (tg_op='INSERT' or old.status is distinct from new.status) then
 update public.integracao_crm_ativacoes set etapa_anterior=case when tg_op='UPDATE' then old.status else null end where card_id=new.id;
 end if;return null;
end $$;
revoke all on function integracao_crm_privado.meta_venda_origem() from public,anon,authenticated;
create trigger z_meta_venda_origem after insert or update of status on public.integracao_crm_cards for each row execute function integracao_crm_privado.meta_venda_origem();
create table public.integracao_crm_metas (
 id uuid primary key default gen_random_uuid(), titulo text not null check(length(trim(titulo)) between 3 and 120),
 escopo text not null check(escopo in ('usuario','setor')), setor text not null check(length(trim(setor)) between 1 and 100),
 participantes uuid[] not null check(cardinality(participantes)>0), unidade text not null check(unidade in ('quantidade','valor')),
 alvo numeric(16,2) not null check(alvo>0), inicio date not null, fim date not null check(fim>=inicio),
 status text not null default 'ativa' check(status in ('ativa','cancelada')),
 criado_por uuid not null default auth.uid() references public.profiles(id), criado_em timestamptz not null default now(),
 atualizado_em timestamptz not null default now(), versao integer not null default 1,
 check(escopo<>'usuario' or cardinality(participantes)=1), check(unidade<>'quantidade' or alvo=trunc(alvo))
);
create table public.integracao_agente_estrategias (
 agente text primary key check(agente in ('tecnico','comercial')),
 prompt text not null default '' check(length(prompt)<=6000), ativa boolean not null default true,
 atualizado_por uuid not null default auth.uid() references public.profiles(id), atualizado_em timestamptz not null default now(), versao integer not null default 1
);
alter table public.integracao_crm_metas enable row level security;
alter table public.integracao_agente_estrategias enable row level security;
revoke all on public.integracao_crm_metas,public.integracao_agente_estrategias from public,anon,authenticated;
grant select,insert,update on public.integracao_crm_metas,public.integracao_agente_estrategias to authenticated;
grant all on public.integracao_crm_metas,public.integracao_agente_estrategias to service_role;
create policy metas_vendas_ler on public.integracao_crm_metas for select to authenticated using (
 exists(select 1 from public.profiles where id=auth.uid() and ativo) and (erp_collab_private.integracao_diretoria() or auth.uid()=any(participantes))
);
create policy metas_vendas_criar on public.integracao_crm_metas for insert to authenticated with check(erp_collab_private.integracao_diretoria());
create policy metas_vendas_editar on public.integracao_crm_metas for update to authenticated using(erp_collab_private.integracao_diretoria()) with check(erp_collab_private.integracao_diretoria());
create policy estrategias_diretoria on public.integracao_agente_estrategias for all to authenticated using(erp_collab_private.integracao_diretoria()) with check(erp_collab_private.integracao_diretoria());
create function erp_collab_private.validar_meta_vendas() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not erp_collab_private.integracao_diretoria() then raise exception 'Somente a Diretoria pode definir metas' using errcode='42501'; end if;
 if exists(select 1 from unnest(new.participantes) x where not exists(select 1 from public.profiles p where p.id=x and (p.ativo or (tg_op='UPDATE' and x=any(old.participantes))))) then raise exception 'Escolha participantes ativos'; end if;
 if cardinality(new.participantes)<>(select count(distinct x) from unnest(new.participantes) x) then raise exception 'Participantes repetidos'; end if;
 if tg_op='UPDATE' then new.criado_por=old.criado_por;new.criado_em=old.criado_em;new.versao=old.versao+1;else new.criado_por=auth.uid();new.versao=1;end if;
 new.atualizado_em=clock_timestamp();return new;
end $$;
create trigger validar_meta_vendas before insert or update on public.integracao_crm_metas for each row execute function erp_collab_private.validar_meta_vendas();
create function erp_collab_private.validar_estrategia() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not erp_collab_private.integracao_diretoria() then raise exception 'Somente a Diretoria pode definir estratégias' using errcode='42501'; end if;
 new.atualizado_por=auth.uid();new.atualizado_em=clock_timestamp();
 if tg_op='UPDATE' then new.versao=old.versao+1;else new.versao=1;end if;
 return new;
end $$;
create trigger validar_estrategia before insert or update on public.integracao_agente_estrategias for each row execute function erp_collab_private.validar_estrategia();
revoke all on function erp_collab_private.validar_meta_vendas(),erp_collab_private.validar_estrategia() from public,anon,authenticated;
-- Aggregate only the authorized goal's participants; no client names or transactions are exposed.
create function erp_collab_private.metas_vendas_painel() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare diretor boolean; resultado jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and ativo) then raise exception 'Entre com uma conta ativa' using errcode='42501';end if;
 diretor=erp_collab_private.integracao_diretoria();
 select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object(
 'realizado',coalesce(a.total,0),'sem_valor',coalesce(a.sem_valor,0),
 'por_usuario',case when diretor then coalesce(a.usuarios,'[]'::jsonb) else '[]'::jsonb end
 ) order by m.fim,m.titulo),'[]'::jsonb) into resultado
 from public.integracao_crm_metas m
 left join lateral (
 select sum(r.total) total,sum(r.sem_valor) sem_valor,jsonb_agg(jsonb_build_object('id',r.id,'nome',r.nome,'realizado',r.total) order by r.nome) usuarios
 from (select p.id,p.nome,case when m.unidade='quantidade' then count(a.card_id)::numeric else coalesce(sum(a.valor),0) end total,
 count(a.card_id) filter(where a.valor is null) sem_valor
 from unnest(m.participantes) u(id) join public.profiles p on p.id=u.id
 left join public.integracao_crm_ativacoes a on a.responsavel_id=p.id and a.desfeito_em is null and a.etapa_anterior='Contrato'
 and a.ativado_em>=(m.inicio::timestamp at time zone 'America/Sao_Paulo')
 and a.ativado_em<((m.fim+1)::timestamp at time zone 'America/Sao_Paulo') and a.ativado_em<=now()
 group by p.id,p.nome) r
 ) a on true
 where diretor or auth.uid()=any(m.participantes);
 return resultado;
end $$;
revoke all on function erp_collab_private.metas_vendas_painel() from public,anon;
grant execute on function erp_collab_private.metas_vendas_painel() to authenticated;
create function public.integracao_crm_metas_painel() returns jsonb language sql stable security invoker set search_path='' as $$select erp_collab_private.metas_vendas_painel()$$;
revoke all on function public.integracao_crm_metas_painel() from public,anon;
grant execute on function public.integracao_crm_metas_painel() to authenticated;
create function public.integracao_agente_estrategias_ler() returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not erp_collab_private.integracao_diretoria() then raise exception 'Painel disponível apenas para a diretoria' using errcode='42501';end if;
 return coalesce((select jsonb_object_agg(agente,prompt) from public.integracao_agente_estrategias where ativa),'{}'::jsonb);
end $$;
revoke all on function public.integracao_agente_estrategias_ler() from public,anon;
grant execute on function public.integracao_agente_estrategias_ler() to authenticated;
