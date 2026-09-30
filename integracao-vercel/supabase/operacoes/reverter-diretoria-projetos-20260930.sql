begin;
drop policy integracao_diretoria_projetos on public.planos_trabalho;
drop policy integracao_diretoria_projetos on public.etapas_plano;
drop policy integracao_diretoria_projetos on public.etapa_responsaveis;
CREATE OR REPLACE FUNCTION public.can_access_plan(p_plano_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.is_admin() or public.is_tech_director() or exists (
    select 1
    from public.etapas_plano ep
    join public.etapa_responsaveis er on er.etapa_id = ep.id
    join public.profiles p on p.id = er.usuario_id
    where ep.plano_id = p_plano_id
      and er.usuario_id = (select auth.uid())
      and p.ativo = true
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_stage_assignee(p_etapa_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.is_admin() or public.is_tech_director() or exists (
    select 1
    from public.etapa_responsaveis er
    join public.profiles p on p.id = er.usuario_id
    where er.etapa_id = p_etapa_id
      and er.usuario_id = (select auth.uid())
      and p.ativo = true
  );
$function$
;
notify pgrst,'reload schema';
commit;
