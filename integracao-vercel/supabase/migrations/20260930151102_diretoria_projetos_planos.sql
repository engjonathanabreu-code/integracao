begin;
-- The UI already treats the Projects Director as management. Preserve all
-- existing policies and recognize that same active role for plans and stages.
do $migration$
declare assinatura text; definicao text; hash_esperado text;
begin
 foreach assinatura in array array['public.can_access_plan(uuid)','public.is_stage_assignee(uuid)'] loop
  hash_esperado:=case assinatura when 'public.can_access_plan(uuid)' then 'a2e8a7e75d0c864efc84e7648aba993f' else '0a9b464983c9deb94fa1b4453150e2f8' end;
  definicao:=pg_get_functiondef(assinatura::regprocedure);
  if md5(definicao)<>hash_esperado then raise exception 'Regra de planos mudou: %; revisar a migração',assinatura;end if;
  execute replace(definicao,'public.is_admin() or public.is_tech_director()','public.is_admin() or public.is_tech_director() or public.is_projects_director()');
 end loop;
end $migration$;
create policy integracao_diretoria_projetos on public.planos_trabalho for all to authenticated
 using ((select public.is_projects_director())) with check ((select public.is_projects_director()));
create policy integracao_diretoria_projetos on public.etapas_plano for all to authenticated
 using ((select public.is_projects_director())) with check ((select public.is_projects_director()));
create policy integracao_diretoria_projetos on public.etapa_responsaveis for all to authenticated
 using ((select public.is_projects_director())) with check ((select public.is_projects_director()));
notify pgrst,'reload schema';
commit;
