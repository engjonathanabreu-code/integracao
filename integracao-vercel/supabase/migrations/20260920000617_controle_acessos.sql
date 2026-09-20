begin;
create table public.integracao_acessos (
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null,
 usuario_nome text not null,
 sessao_id uuid not null,
 evento text not null check(evento in ('login','logout')),
 motivo text not null check(motivo in ('autenticacao','manual','inatividade')),
 ocorrido_em timestamptz not null default now(),
 unique(sessao_id,evento)
);
create index integracao_acessos_mes_idx on public.integracao_acessos(ocorrido_em,usuario_id);
alter table public.integracao_acessos enable row level security;
revoke all on public.integracao_acessos from public,anon,authenticated;
grant select on public.integracao_acessos to authenticated;
create policy acessos_admin on public.integracao_acessos for select to authenticated using ((select integracao_crm_privado.permite('admin')));

-- Only server-derived identity, session and timestamps are stored. No direct client writes.
create function integracao_crm_privado.registrar_acesso(p_evento text,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare v_uid uuid=auth.uid(); v_sessao uuid=nullif(auth.jwt()->>'session_id','')::uuid; v_nome text;
begin
 if v_uid is null or v_sessao is null then raise exception 'Sessão autenticada obrigatória'; end if;
 select nome into v_nome from public.profiles where id=v_uid and ativo is not false;
 if not found then raise exception 'Usuário inativo ou indisponível'; end if;
 if not exists(select 1 from auth.sessions where id=v_sessao and user_id=v_uid) then raise exception 'Sessão inválida';end if;
 if p_evento is null or p_motivo is null or not ((p_evento='login' and p_motivo='autenticacao') or (p_evento='logout' and p_motivo in ('manual','inatividade'))) then raise exception 'Evento inválido';end if;
 if p_evento='login' and exists(select 1 from public.integracao_acessos where sessao_id=v_sessao and evento='logout') then return;end if;
 insert into public.integracao_acessos(usuario_id,usuario_nome,sessao_id,evento,motivo)
 values(v_uid,coalesce(v_nome,'Usuário'),v_sessao,p_evento,p_motivo) on conflict(sessao_id,evento) do nothing;
end $$;
revoke all on function integracao_crm_privado.registrar_acesso(text,text) from public,anon;
grant execute on function integracao_crm_privado.registrar_acesso(text,text) to authenticated;
create function public.integracao_registrar_acesso(p_evento text,p_motivo text) returns void
language sql security invoker set search_path='' as $$select integracao_crm_privado.registrar_acesso(p_evento,p_motivo)$$;
revoke all on function public.integracao_registrar_acesso(text,text) from public,anon;
grant execute on function public.integracao_registrar_acesso(text,text) to authenticated;
commit;
