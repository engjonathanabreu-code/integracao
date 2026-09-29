begin;
-- Preserve the current permission, archival, locking and idempotency checks.
alter table public.integracao_crm_followups drop constraint integracao_crm_followups_prazo_dias_check;
alter table public.integracao_crm_followups add constraint integracao_crm_followups_prazo_dias_check check(prazo_dias between 1 and 3650);
alter table public.integracao_crm_institucionais_followups drop constraint integracao_crm_institucionais_followups_prazo_dias_check;
alter table public.integracao_crm_institucionais_followups add constraint integracao_crm_institucionais_followups_prazo_dias_check check(prazo_dias between 1 and 3650);
do $$declare assinatura text; definicao text; nova text;begin
 foreach assinatura in array array[
  'integracao_crm_privado.followup(uuid,uuid,uuid,integer,text)',
  'integracao_crm_privado.institucional_followup(uuid,uuid,uuid,integer,text)',
  'integracao_crm_privado.salvar_institucional(uuid,integer,text,text,text,numeric,uuid,text,text,integer)'
 ] loop
  definicao:=pg_get_functiondef(assinatura::regprocedure);
  nova:=replace(replace(definicao,'p_dias not in (1,2,4)','p_dias not between 1 and 3650'),'p_dias not in(1,2,4)','p_dias not between 1 and 3650');
  if nova=definicao then raise exception 'Regra de prazo inesperada em %',assinatura;end if;
  nova:=replace(nova,'1, 2 ou 4 dias','1 a 3650 dias');
  execute nova;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
