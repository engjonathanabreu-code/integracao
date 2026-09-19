begin;
create table public.integracao_marketing_grupos (
 id uuid primary key default gen_random_uuid(), municipio_id uuid not null references public.fin_receb_municipios(id),
 nome text not null check(length(trim(nome)) between 1 and 160), link text,
 descricao text not null default '', status text not null default 'Em preparação' check(status in ('Em preparação','Ativo','Pausado')),
 ativo boolean not null default true, created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 check(link is null or link ~ '^https://chat[.]whatsapp[.]com/[A-Za-z0-9/?=&_-]+$')
);
create index on public.integracao_marketing_grupos(municipio_id);
create table public.integracao_marketing_atualizacoes (
 id uuid primary key default gen_random_uuid(), grupo_id uuid not null references public.integracao_marketing_grupos(id),
 texto text not null check(length(trim(texto)) between 1 and 10000), enviar_ao_grupo boolean not null default false,
 enviado_em timestamptz, mensagem_externa_id text unique,
 created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now()
);
create index on public.integracao_marketing_atualizacoes(grupo_id,created_at desc);
create index on public.integracao_marketing_atualizacoes(created_at) where enviar_ao_grupo and enviado_em is null;
create table public.integracao_marketing_rotina (
 id uuid primary key default gen_random_uuid(), ano integer not null check(ano between 2000 and 2200),
 mes integer not null check(mes between 1 and 12), semana integer not null check(semana between 1 and 4),
 titulo text not null check(length(trim(titulo)) between 1 and 180), descricao text not null default '',
 municipio_id uuid references public.fin_receb_municipios(id), responsavel_id uuid references public.profiles(id), prazo date,
 prioridade text not null default 'Normal' check(prioridade in ('Baixa','Normal','Alta')),
 status text not null default 'A fazer' check(status in ('A fazer','Em andamento','Concluído')),
 checklist jsonb not null default '[]' check(jsonb_typeof(checklist)='array'),
 ativo boolean not null default true, created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now()
);
create index on public.integracao_marketing_rotina(ano,mes,semana);
create index on public.integracao_marketing_rotina(responsavel_id);
create index on public.integracao_marketing_rotina(municipio_id);
do $$ declare t text; begin
 foreach t in array array['integracao_marketing_grupos','integracao_marketing_atualizacoes','integracao_marketing_rotina'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy marketing_ler on public.%I for select to authenticated using((select integracao_crm_privado.permite(''marketing'')))',t);
 execute format('create policy marketing_criar on public.%I for insert to authenticated with check((select integracao_crm_privado.permite(''marketing'')) and created_by=(select auth.uid()))',t);
 end loop;
 foreach t in array array['integracao_marketing_grupos','integracao_marketing_rotina'] loop
 execute format('create policy marketing_editar on public.%I for update to authenticated using((select integracao_crm_privado.permite(''marketing''))) with check((select integracao_crm_privado.permite(''marketing'')))',t);
 end loop;
end $$;
grant insert(municipio_id,nome,link,descricao,status), update(municipio_id,nome,link,descricao,status,ativo) on public.integracao_marketing_grupos to authenticated;
grant insert(grupo_id,texto,enviar_ao_grupo) on public.integracao_marketing_atualizacoes to authenticated;
grant insert(ano,mes,semana,titulo,descricao,municipio_id,responsavel_id,prazo,prioridade,status,checklist), update(ano,mes,semana,titulo,descricao,municipio_id,responsavel_id,prazo,prioridade,status,checklist,ativo) on public.integracao_marketing_rotina to authenticated;
create function integracao_crm_privado.validar_marketing() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='integracao_marketing_rotina' then
  if exists(select 1 from jsonb_array_elements(new.checklist) x where jsonb_typeof(x)<>'object' or nullif(trim(x->>'texto'),'') is null or jsonb_typeof(x->'concluido') is distinct from 'boolean') then raise exception 'Checklist inválido';end if;
  if new.status='Concluído' and exists(select 1 from jsonb_array_elements(new.checklist) x where (x->>'concluido')::boolean is not true) then raise exception 'Conclua todos os itens do checklist';end if;
 elsif tg_table_name='integracao_marketing_atualizacoes' then
  if not exists(select 1 from public.integracao_marketing_grupos where id=new.grupo_id and ativo) then raise exception 'Grupo removido ou indisponível';end if;
 end if;
 return new;
end $$;
revoke all on function integracao_crm_privado.validar_marketing() from public;
create trigger validar_marketing before insert or update on public.integracao_marketing_rotina for each row execute function integracao_crm_privado.validar_marketing();
create trigger validar_marketing before insert on public.integracao_marketing_atualizacoes for each row execute function integracao_crm_privado.validar_marketing();
commit;
