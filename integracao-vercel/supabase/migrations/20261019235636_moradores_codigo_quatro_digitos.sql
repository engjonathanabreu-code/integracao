begin;
-- Reserve each historic code once, without changing or removing duplicate residents.
-- The private registry's PK serializes concurrent claims even when RLS hides a resident.
-- Also equates numeric suffixes such as _001 and _0001 without integer casts.
lock table public.fin_receb_clientes in share row exclusive mode;
create table if not exists integracao_crm_privado.codigos_moradores_reservados (
  codigo text primary key,
  morador_id uuid not null
);
alter table integracao_crm_privado.codigos_moradores_reservados enable row level security;
insert into integracao_crm_privado.codigos_moradores_reservados(codigo,morador_id)
select distinct on (chave) chave,id from (
  select id,regexp_replace(upper(btrim(codigo)), '_0*([0-9]+)$', E'_\\1') chave
  from public.fin_receb_clientes where codigo is not null and btrim(codigo)<>''
) c order by chave,id on conflict (codigo) do nothing;

create or replace function integracao_crm_privado.reservar_codigo_morador()
returns trigger language plpgsql security definer set search_path='' as $guard$
declare chave text; dono uuid;
begin
  if new.codigo is null or btrim(new.codigo)='' then return new; end if;
  chave:=regexp_replace(upper(btrim(new.codigo)), '_0*([0-9]+)$', E'_\\1');
  if tg_op='UPDATE' and chave=regexp_replace(upper(btrim(old.codigo)), '_0*([0-9]+)$', E'_\\1') then return new; end if;
  insert into integracao_crm_privado.codigos_moradores_reservados as r(codigo,morador_id)
  values(chave,new.id) on conflict(codigo) do update set morador_id=r.morador_id
  where r.morador_id=excluded.morador_id returning morador_id into dono;
  if dono is null then raise exception 'Este código já pertence a outro morador. Atualize os dados e tente novamente.' using errcode='23505'; end if;
  return new;
end $guard$;
-- No changes to existing app grants/policies. The new private objects are not an API.
revoke all on integracao_crm_privado.codigos_moradores_reservados from public,anon,authenticated;
revoke all on function integracao_crm_privado.reservar_codigo_morador() from public,anon,authenticated;
drop trigger if exists integracao_reservar_codigo_morador on public.fin_receb_clientes;
create trigger integracao_reservar_codigo_morador before insert or update of codigo on public.fin_receb_clientes
for each row execute function integracao_crm_privado.reservar_codigo_morador();
-- Patch only the formatter in the CURRENT function, preserving concurrent CRM work,
-- permissions, advisory locking, validation and financial rules. No resident UPDATE.
do $migration$
declare
  target regprocedure := to_regprocedure('integracao_crm_privado.converter_lead(uuid,uuid,uuid,jsonb,jsonb)');
  definition text;
  previous text := 'lpad(proximo::text,greatest(3,length(proximo::text)),''0'')';
  replacement text := 'lpad(proximo::text,greatest(4,length(proximo::text)),''0'')';
begin
  if target is null then raise exception 'Conversão de leads não encontrada; confira as migrações anteriores'; end if;
  definition := pg_get_functiondef(target);
  if position(previous in definition) > 0 then
    execute replace(definition, previous, replacement);
  elsif position(replacement in definition) = 0 then
    raise exception 'Gerador de código mudou; revisar migração antes de aplicar';
  end if;
end $migration$;
commit;
