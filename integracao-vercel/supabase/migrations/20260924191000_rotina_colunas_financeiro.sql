-- Rotina mensal: colunas (semanas) com nome e tom escolhidos, e a mesma rotina para o Financeiro.
begin;
create schema if not exists integracao_rotina_privado;
revoke all on schema integracao_rotina_privado from public,anon;
grant usage on schema integracao_rotina_privado to authenticated;

-- Marketing usa o acesso de Marketing; Financeiro usa quem opera o Financeiro.
create function integracao_rotina_privado.permite(p_modulo text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 return case p_modulo when 'marketing' then integracao_crm_privado.permite('marketing') when 'financeiro' then integracao_financeiro_privado.operar() else false end;
end $$;
revoke all on function integracao_rotina_privado.permite(text) from public,anon;
grant execute on function integracao_rotina_privado.permite(text) to authenticated;

alter table public.integracao_marketing_rotina add column modulo text not null default 'marketing' check(modulo in ('marketing','financeiro'));
alter table public.integracao_marketing_rotina drop constraint integracao_marketing_rotina_semana_check;
alter table public.integracao_marketing_rotina add constraint integracao_marketing_rotina_semana_check check(semana between 1 and 20);
drop index if exists public.integracao_marketing_rotina_ano_mes_semana_idx;
create index integracao_rotina_modulo_periodo on public.integracao_marketing_rotina(modulo,ano,mes,semana);
drop policy marketing_ler on public.integracao_marketing_rotina;
drop policy marketing_criar on public.integracao_marketing_rotina;
drop policy marketing_editar on public.integracao_marketing_rotina;
create policy rotina_ler on public.integracao_marketing_rotina for select to authenticated using((select integracao_rotina_privado.permite(modulo)));
create policy rotina_criar on public.integracao_marketing_rotina for insert to authenticated with check((select integracao_rotina_privado.permite(modulo)) and created_by=(select auth.uid()));
create policy rotina_editar on public.integracao_marketing_rotina for update to authenticated using((select integracao_rotina_privado.permite(modulo))) with check((select integracao_rotina_privado.permite(modulo)));
-- O módulo é escolhido na criação e não muda depois.
grant insert(modulo) on public.integracao_marketing_rotina to authenticated;

create table public.integracao_rotina_colunas (
 id uuid primary key default gen_random_uuid(),
 modulo text not null check(modulo in ('marketing','financeiro')),
 ano integer not null check(ano between 2000 and 2200),
 mes integer not null check(mes between 1 and 12),
 semana integer not null check(semana between 1 and 20),
 nome text not null check(length(trim(nome)) between 1 and 40),
 tom text not null check(tom in ('verde','azul','areia','lilas','rosa','cinza')),
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(modulo,ano,mes,semana)
);
alter table public.integracao_rotina_colunas enable row level security;
revoke all on public.integracao_rotina_colunas from public,anon,authenticated;
grant select,delete on public.integracao_rotina_colunas to authenticated;
grant insert(modulo,ano,mes,semana,nome,tom), update(nome,tom) on public.integracao_rotina_colunas to authenticated;
grant all on public.integracao_rotina_colunas to service_role;
create policy colunas_ler on public.integracao_rotina_colunas for select to authenticated using((select integracao_rotina_privado.permite(modulo)));
create policy colunas_criar on public.integracao_rotina_colunas for insert to authenticated with check((select integracao_rotina_privado.permite(modulo)) and created_by=(select auth.uid()));
create policy colunas_editar on public.integracao_rotina_colunas for update to authenticated using((select integracao_rotina_privado.permite(modulo))) with check((select integracao_rotina_privado.permite(modulo)));
create policy colunas_excluir on public.integracao_rotina_colunas for delete to authenticated using((select integracao_rotina_privado.permite(modulo)));

-- Semanas 1 a 4 sempre existem (a exclusão só volta nome e tom ao padrão). Colunas extras só saem vazias.
create function integracao_rotina_privado.proteger_coluna() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.semana>4 and exists(select 1 from public.integracao_marketing_rotina r where r.modulo=old.modulo and r.ano=old.ano and r.mes=old.mes and r.semana=old.semana and r.ativo) then
  raise exception 'Mova ou remova as atividades desta coluna antes de excluí-la';
 end if;
 return old;
end $$;
revoke all on function integracao_rotina_privado.proteger_coluna() from public,anon,authenticated;
create trigger proteger_coluna before delete on public.integracao_rotina_colunas for each row execute function integracao_rotina_privado.proteger_coluna();
do $$begin if to_regprocedure('integracao_crm_privado.sinalizar_revisao()') is not null then
 create trigger integracao_revisao after insert or update or delete on public.integracao_rotina_colunas for each statement execute function integracao_crm_privado.sinalizar_revisao('marketing');
end if;end $$;
notify pgrst,'reload schema';
commit;
