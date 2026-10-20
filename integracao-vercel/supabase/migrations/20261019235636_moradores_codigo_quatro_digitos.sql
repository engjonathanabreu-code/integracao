begin;
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
