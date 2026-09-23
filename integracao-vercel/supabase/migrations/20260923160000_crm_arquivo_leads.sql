begin;
alter table public.integracao_crm_cards add column arquivado_em timestamptz;
create table public.integracao_crm_arquivo (
 id uuid primary key default gen_random_uuid(),card_id uuid not null references public.integracao_crm_cards(id),
 dados jsonb not null, motivo text not null check(length(trim(motivo)) between 3 and 2000),
 arquivado_em timestamptz not null default clock_timestamp(),arquivado_por uuid not null references public.profiles(id),
 restaurado_em timestamptz,restaurado_por uuid references public.profiles(id)
);
create unique index crm_arquivo_atual on public.integracao_crm_arquivo(card_id) where restaurado_em is null;
create index crm_arquivo_data on public.integracao_crm_arquivo(arquivado_em desc);
alter table public.integracao_crm_arquivo enable row level security;
revoke all on public.integracao_crm_arquivo from public,anon,authenticated;
grant select on public.integracao_crm_arquivo to authenticated;
grant all on public.integracao_crm_arquivo to service_role;
create policy arquivo_diretoria on public.integracao_crm_arquivo for select to authenticated using((select integracao_crm_privado.permite('admin')));
create trigger auditoria after insert or update on public.integracao_crm_arquivo for each row execute function integracao_crm_privado.auditar();

create or replace function integracao_crm_privado.card_permitido(card uuid) returns boolean language sql stable security definer set search_path='' as $$
 select integracao_crm_privado.permite('crm') and exists(select 1 from public.integracao_crm_cards c where c.id=card and (integracao_crm_privado.permite('admin') or (c.arquivado_em is null and (c.responsavel_id=auth.uid() or auth.uid()=any(c.comerciais_adicionais)))))
$$;
alter policy cards_ler on public.integracao_crm_cards using((select integracao_crm_privado.permite('crm')) and ((select integracao_crm_privado.permite('admin')) or (arquivado_em is null and (responsavel_id=(select auth.uid()) or (select auth.uid())=any(comerciais_adicionais)))));
-- An archived lead's tasks remain stored, but do not appear as open work.
create policy tarefas_arquivo on public.integracao_crm_tarefas as restrictive for all to authenticated
 using(exists(select 1 from public.integracao_crm_cards c where c.id=card_id and c.arquivado_em is null))
 with check(exists(select 1 from public.integracao_crm_cards c where c.id=card_id and c.arquivado_em is null));
alter table public.integracao_crm_followups drop constraint integracao_crm_followups_status_check;
alter table public.integracao_crm_followups add constraint integracao_crm_followups_status_check check(status in('pendente','feito','unificado','arquivado'));

create function integracao_crm_privado.proteger_arquivado() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if old.arquivado_em is not null and new.arquivado_em is not null and auth.uid() is not null then raise exception 'Restaure o lead no Arquivo do CRM antes de alterá-lo';end if;
 return new;
end $$;
revoke all on function integracao_crm_privado.proteger_arquivado() from public,anon,authenticated;
create trigger proteger_arquivado before update on public.integracao_crm_cards for each row execute function integracao_crm_privado.proteger_arquivado();

create function integracao_crm_privado.arquivar_lead(p_card uuid,p_arquivar boolean,p_motivo text,p_responsavel uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.integracao_crm_cards; instante timestamptz:=clock_timestamp();begin
 if auth.uid() is null or not integracao_crm_privado.permite('crm') or p_arquivar is null then raise exception 'Sem permissão';end if;
 select * into c from public.integracao_crm_cards where id=p_card for update;
 if not found or not integracao_crm_privado.card_permitido(p_card) then raise exception 'Lead indisponível ou sem permissão';end if;
 if c.cliente_id is not null or c.origem='vinculado' then raise exception 'Esta ação é exclusiva para leads ainda não vinculados a clientes';end if;
 if p_arquivar then
  if c.arquivado_em is not null then return;end if;
  if p_motivo is null or length(trim(p_motivo)) not between 3 and 2000 then raise exception 'Informe brevemente o motivo do arquivamento';end if;
  insert into public.integracao_crm_arquivo(card_id,dados,motivo,arquivado_por,arquivado_em)
  values(p_card,to_jsonb(c)||jsonb_build_object('municipio',(select nome from public.fin_receb_municipios where id=c.lead_municipio_id),'followups',coalesce((select jsonb_agg(to_jsonb(f) order by f.criado_em) from public.integracao_crm_followups f where f.card_id=p_card),'[]'::jsonb),'tarefas',coalesce((select jsonb_agg(to_jsonb(t)) from public.integracao_crm_tarefas t where t.card_id=p_card),'[]'::jsonb)),trim(p_motivo),auth.uid(),instante);
  update public.integracao_crm_followups set status='arquivado' where card_id=p_card and status='pendente';
  update public.integracao_crm_cards set arquivado_em=instante,updated_at=instante where id=p_card;
 else
  if not integracao_crm_privado.permite('admin') then raise exception 'Somente a diretoria pode restaurar leads';end if;
  if c.arquivado_em is null then raise exception 'O lead já foi restaurado';end if;
  perform integracao_crm_privado.validar_comerciais(array[p_responsavel]);
  update public.integracao_crm_cards set arquivado_em=null,responsavel_id=p_responsavel,comerciais_adicionais='{}',status='Cliente novo',updated_at=instante where id=p_card;
  update public.integracao_crm_arquivo set restaurado_em=instante,restaurado_por=auth.uid() where card_id=p_card and restaurado_em is null;
 end if;
end $$;
create function public.integracao_crm_arquivar_lead(p_card uuid,p_arquivar boolean,p_motivo text default '',p_responsavel uuid default null) returns void language sql security invoker set search_path='' as $$select integracao_crm_privado.arquivar_lead(p_card,p_arquivar,p_motivo,p_responsavel)$$;
revoke all on function integracao_crm_privado.arquivar_lead(uuid,boolean,text,uuid),public.integracao_crm_arquivar_lead(uuid,boolean,text,uuid) from public,anon;
grant execute on function integracao_crm_privado.arquivar_lead(uuid,boolean,text,uuid),public.integracao_crm_arquivar_lead(uuid,boolean,text,uuid) to authenticated;

do $$declare definicao text;begin
 definicao:=pg_get_viewdef('public.integracao_crm_funil'::regclass,true);
 -- The existing funnel is a SELECT with joins and no WHERE. Preserve its column order.
 if definicao ~* '\mwhere\M' then raise exception 'Revisar filtro do funil antes da migração';end if;
 execute 'create or replace view public.integracao_crm_funil with(security_invoker=true) as '||regexp_replace(definicao,';\s*$','')||' where c.arquivado_em is null';
 definicao:=pg_get_functiondef('integracao_crm_privado.followup(uuid,uuid,uuid,integer,text)'::regprocedure);
 if position('origem<>''vinculado''' in definicao)=0 then raise exception 'Revisar proteção do FollowUp';end if;
 execute replace(definicao,'origem<>''vinculado''','origem<>''vinculado'' and arquivado_em is null');
 -- Archived leads do not count in current portfolios or pending work. Historical metrics remain historical.
 definicao:=pg_get_functiondef('public.integracao_crm_dashboard(date,date)'::regprocedure);
 definicao:=replace(definicao,'c.origem<>''vinculado''','c.origem<>''vinculado'' and c.arquivado_em is null');
 execute definicao;
end $$;
notify pgrst,'reload schema';
commit;
