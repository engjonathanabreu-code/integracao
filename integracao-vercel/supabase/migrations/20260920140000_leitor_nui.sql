-- Quota privada, sem documentos ou resultados de IA.
create table if not exists public.integracao_leitura_quota (
 usuario_id uuid primary key references auth.users(id) on delete cascade,
 janela timestamptz not null,
 quantidade integer not null
);
alter table public.integracao_leitura_quota enable row level security;
revoke all on public.integracao_leitura_quota from anon,authenticated;
create or replace function public.integracao_reservar_leitura() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare qtd integer;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo in ('Administrador','Diretor de Projetos','Projetos')) then
  raise exception 'Acesso restrito a Projetos e administradores' using errcode='42501';
 end if;
 insert into public.integracao_leitura_quota values(auth.uid(),now(),1)
 on conflict(usuario_id) do update set
 quantidade=case when integracao_leitura_quota.janela<now()-interval '1 hour' then 1 else integracao_leitura_quota.quantidade+1 end,
 janela=case when integracao_leitura_quota.janela<now()-interval '1 hour' then now() else integracao_leitura_quota.janela end
 returning quantidade into qtd;
 if qtd>20 then raise exception 'Limite de 20 análises por hora atingido'; end if;
end $$;
revoke all on function public.integracao_reservar_leitura() from public,anon;
grant execute on function public.integracao_reservar_leitura() to authenticated;

create or replace function public.integracao_proteger_confirmacao_nui() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare anterior jsonb;
begin
 if new.colecao<>'nucleos' then return new; end if;
 anterior=case when TG_OP='UPDATE' then old.dados->'leiturasMatriculas' else null end;
 if (new.dados->'leiturasMatriculas') is distinct from anterior then
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo in ('Administrador','Diretor de Projetos','Projetos')) then
   raise exception 'Somente Projetos ou administradores confirmam sugestões de matrícula' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists integracao_confirmacao_nui on public.integracao_complementos;
create trigger integracao_confirmacao_nui before insert or update on public.integracao_complementos
for each row execute function public.integracao_proteger_confirmacao_nui();
