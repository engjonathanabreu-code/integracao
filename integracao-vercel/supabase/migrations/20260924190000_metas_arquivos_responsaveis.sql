-- Arquivos de metas (inclusive devolutivas): o técnico responsável, quem criou a meta e a diretoria podem abri-los.
-- Antes, o arquivo ficava na pasta de quem enviou e só o próprio autor e o Administrador conseguiam baixá-lo.
begin;
create or replace function public.can_access_document_path(p_path text)
 returns boolean language sql stable security definer set search_path to '' as $function$
  select public.is_admin() or exists (
    select 1
    from public.documentos d
    left join public.etapas_plano ep on ep.id = d.etapa_plano_id
    where d.caminho_storage = p_path
      and (
        d.enviado_por = (select auth.uid())
        or (
          ep.plano_id is not null
          and public.can_access_plan(ep.plano_id)
        )
      )
  ) or exists (
    select 1
    from public.meta_arquivos a
    join public.metas m on m.id = a.meta_id
    join public.profiles eu on eu.id = (select auth.uid()) and eu.ativo
    where a.caminho_storage = p_path
      and (
        a.enviado_por = eu.id
        or m.created_by = eu.id
        or eu.tipo in ('Diretor Técnico','Diretor de Projetos')
        or exists (select 1 from public.meta_responsaveis r where r.meta_id = m.id and r.usuario_id = eu.id)
      )
  );
$function$;
commit;
