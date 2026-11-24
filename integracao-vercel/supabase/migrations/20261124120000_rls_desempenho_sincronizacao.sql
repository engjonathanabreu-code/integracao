-- Desempenho das políticas de LEITURA de Metas e Notificações (sincronização).
-- A visibilidade é a mesma de antes: papel/gerência/usuário são avaliados uma vez por
-- consulta e a visibilidade da meta vem de um conjunto calculado uma vez, em vez de
-- funções chamadas linha a linha. Aplicada em produção em 24/11/2026.
-- Idempotente. Reversão: supabase/operacoes/rls-desempenho-sincronizacao-reversao.sql

begin;

-- Conjunto de metas que visivel(id, false) aceitaria para a identidade atual.
-- Mesma regra de integracao_metas_privado.visivel(p_meta, false):
--   papel() is not null and (gerencia() or created_by = uid or uid é responsável).
create or replace function integracao_metas_privado.metas_visiveis()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.metas m
  where (select integracao_metas_privado.papel()) is not null and (
    (select integracao_metas_privado.gerencia())
    or m.created_by = (select auth.uid())
    or exists (select 1 from public.meta_responsaveis r
      where r.meta_id = m.id and r.usuario_id = (select auth.uid()))
  );
$$;
revoke execute on function integracao_metas_privado.metas_visiveis() from public, anon;
grant execute on function integracao_metas_privado.metas_visiveis() to authenticated;

alter policy integracao_metas_ler on public.metas
  using ((select integracao_metas_privado.gerencia())
    or ((select integracao_metas_privado.papel()) is not null and created_by = (select auth.uid()))
    or id in (select integracao_metas_privado.metas_visiveis()));

alter policy integracao_setores_ler on public.meta_setores
  using ((select integracao_metas_privado.papel()) is not null);

alter policy integracao_responsaveis_ler on public.meta_responsaveis
  using (meta_id in (select integracao_metas_privado.metas_visiveis()));

alter policy integracao_projetos_ler on public.meta_projetos
  using (meta_id in (select integracao_metas_privado.metas_visiveis()));

alter policy integracao_checklist_ler on public.meta_checklist
  using (meta_id in (select integracao_metas_privado.metas_visiveis()));

alter policy integracao_comentarios_ler on public.meta_comentarios
  using (meta_id in (select integracao_metas_privado.metas_visiveis()));

alter policy integracao_historico_ler on public.meta_historico
  using (meta_id in (select integracao_metas_privado.metas_visiveis())
    or (meta_id is null and (select integracao_metas_privado.papel()) is not null
      and (autor_id = (select auth.uid()) or (select integracao_metas_privado.gerencia()))));

alter policy integracao_anexos_ler on public.meta_arquivos
  using (meta_id in (select integracao_metas_privado.metas_visiveis()));

-- Mesma regra de public.integracao_notificacao_visivel(dados, criado_por), com o perfil
-- lido uma vez (InitPlan) sob a mesma RLS de profiles do chamador. A função original é
-- mantida (ainda usada pela política UPDATE `marcar`).
alter policy ler on public.integracao_notificacoes
  using ((select case p.tipo when 'Administrador' then 'diretoria' when 'Diretor Técnico' then 'diretoria'
        when 'Diretor de Projetos' then 'diretoria' when 'Comercial' then 'comercial' when 'Atendimentos' then 'comercial'
        when 'Topografia' then 'topografia' when 'Projetos' then 'projeto' when 'Pós-protocolo' then 'posprotocolo'
        when 'Jurídico' then 'juridico' else 'consulta' end
      from public.profiles p where p.id = (select auth.uid()) and p.ativo) is not null
    and (criado_por = (select auth.uid())
      or (select public.is_erp_admin())
      or dados->'usuarios' ? ('erp_' || (select auth.uid())::text)
      or dados->'setores' ? (select case p.tipo when 'Administrador' then 'diretoria' when 'Diretor Técnico' then 'diretoria'
          when 'Diretor de Projetos' then 'diretoria' when 'Comercial' then 'comercial' when 'Atendimentos' then 'comercial'
          when 'Topografia' then 'topografia' when 'Projetos' then 'projeto' when 'Pós-protocolo' then 'posprotocolo'
          when 'Jurídico' then 'juridico' else 'consulta' end
        from public.profiles p where p.id = (select auth.uid()) and p.ativo)));

-- Índices de chave estrangeira apontados pelo advisor (unindexed_foreign_keys). Não são a
-- causa do custo de leitura (tabelas com 85–1.438 linhas); evitam varreduras completas em
-- exclusões/cascatas de metas e em consultas por meta. Tabelas pequenas: lock de ms.
create index if not exists meta_historico_meta_id_idx on public.meta_historico (meta_id);
create index if not exists meta_arquivos_meta_id_idx on public.meta_arquivos (meta_id);
create index if not exists metas_created_by_idx on public.metas (created_by);

commit;
