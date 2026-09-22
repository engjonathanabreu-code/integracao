begin;
create table public.integracao_financeiro_lembretes(
 id uuid primary key default gen_random_uuid(),parcela_id uuid not null references public.fin_receb_parcelas(id),vencimento date not null,
 status text not null default 'pendente' check(status in ('pendente','enviando','enviado','erro','incerto','cancelado')),
 tentativa uuid,mensagem_id text,observacao text,criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now(),unique(parcela_id,vencimento));
alter table public.integracao_financeiro_lembretes enable row level security;
revoke all on public.integracao_financeiro_lembretes from public,anon,authenticated;
grant select on public.integracao_financeiro_lembretes to authenticated;
create policy financeiro_lembretes_consulta on public.integracao_financeiro_lembretes for select to authenticated using((select integracao_financeiro_privado.operar()));
create function public.integracao_financeiro_lembretes_preparar() returns void language plpgsql security definer set search_path='' as $$begin
 insert into public.integracao_financeiro_lembretes(parcela_id,vencimento)
 select p.id,p.vencimento from public.fin_receb_parcelas p join public.fin_receb_clientes c on c.id=p.cliente_id where p.ativo and c.ativo and p.status in ('Pendente','Inadimplente') and p.vencimento=(now() at time zone 'America/Sao_Paulo')::date+1 on conflict do nothing;
 update public.integracao_financeiro_lembretes set status='incerto',observacao='Execução interrompida: conferir no Chatwoot antes de qualquer reenvio.',atualizado_em=now() where status='enviando' and atualizado_em<now()-interval '10 minutes';
 update public.integracao_financeiro_lembretes set status='cancelado',observacao='Vencimento ou situação alterada.',atualizado_em=now() where status='pendente' and not exists(select 1 from public.fin_receb_parcelas p where p.id=parcela_id and p.ativo and p.status in ('Pendente','Inadimplente') and p.vencimento=integracao_financeiro_lembretes.vencimento and p.vencimento=(now() at time zone 'America/Sao_Paulo')::date+1);
end$$;
create function public.integracao_financeiro_lembrete_reservar() returns setof public.integracao_financeiro_lembretes language sql security definer set search_path='' as $$
 update public.integracao_financeiro_lembretes set status='enviando',tentativa=gen_random_uuid(),atualizado_em=now() where id in(select id from public.integracao_financeiro_lembretes where status='pendente' and vencimento=(now() at time zone 'America/Sao_Paulo')::date+1 order by criado_em,id limit 1 for update skip locked) returning *$$;
create function public.integracao_financeiro_lembrete_finalizar(p_id uuid,p_tentativa uuid,p_status text,p_mensagem text,p_observacao text) returns void language plpgsql security definer set search_path='' as $$begin
 if p_status not in ('enviado','erro','incerto','cancelado') then raise exception 'Situação inválida';end if;
 update public.integracao_financeiro_lembretes set status=p_status,mensagem_id=p_mensagem,observacao=left(p_observacao,300),atualizado_em=now() where id=p_id and tentativa=p_tentativa and status='enviando';
end$$;
revoke all on function public.integracao_financeiro_lembretes_preparar(),public.integracao_financeiro_lembrete_reservar(),public.integracao_financeiro_lembrete_finalizar(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.integracao_financeiro_lembretes_preparar(),public.integracao_financeiro_lembrete_reservar(),public.integracao_financeiro_lembrete_finalizar(uuid,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';commit;
