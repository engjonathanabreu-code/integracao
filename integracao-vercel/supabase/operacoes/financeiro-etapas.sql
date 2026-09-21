CREATE OR REPLACE FUNCTION public.proteger_atualizacao_etapa_plano()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  if public.can_manage_core() or exists (
    select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo
    and (lower(trim(p.tipo))='financeiro' or lower(trim(coalesce(p.setor,'')))='financeiro')
  ) then return new; end if;
  if not public.is_stage_assignee(old.id) then
    raise exception 'Usuário não possui acesso a esta etapa';
  end if;
  if (to_jsonb(new) - array['status', 'observacoes', 'updated_at'])
     <> (to_jsonb(old) - array['status', 'observacoes', 'updated_at']) then
    raise exception 'Usuário comum pode alterar apenas status e observações';
  end if;
  return new;
end;
$function$;
