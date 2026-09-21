CREATE OR REPLACE FUNCTION public.proteger_atualizacao_entregavel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  if public.can_manage_core() or exists (
    select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo
    and (lower(trim(p.tipo))='financeiro' or lower(trim(coalesce(p.setor,'')))='financeiro')
  ) then return new; end if;
  if not public.is_stage_assignee(old.etapa_id) then
    raise exception 'Usuário não possui acesso a este entregável';
  end if;
  if (to_jsonb(new) - array['concluido','concluido_por','concluido_em','updated_at'])
     <> (to_jsonb(old) - array['concluido','concluido_por','concluido_em','updated_at']) then
    raise exception 'Usuário comum pode apenas marcar ou desmarcar o entregável';
  end if;
  if new.concluido then
    new.concluido_por := (select auth.uid());
    new.concluido_em := coalesce(new.concluido_em, now());
  else new.concluido_por := null; new.concluido_em := null; end if;
  return new;
end;
$function$;
