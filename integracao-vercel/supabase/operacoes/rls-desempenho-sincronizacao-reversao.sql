-- Reversão de supabase/migrations/20261124120000_rls_desempenho_sincronizacao.sql.
-- Restaura as expressões vivas das políticas de leitura exatamente como lidas de
-- pg_policies em produção (ycdsyilyvaxslkwbkxyo) em 24/11/2026, antes da migration.
-- Não toca em dados. Ordem: políticas primeiro (dependem da função), depois a função.
-- Os índices são removidos por último; manter os índices é inofensivo — se preferir,
-- comente o bloco final.

begin;

alter policy integracao_metas_ler on public.metas
  using (integracao_metas_privado.gerencia()
    or ((integracao_metas_privado.papel() is not null) and (created_by = (select auth.uid())))
    or integracao_metas_privado.visivel(id));

alter policy integracao_setores_ler on public.meta_setores
  using (integracao_metas_privado.papel() is not null);

alter policy integracao_responsaveis_ler on public.meta_responsaveis
  using (integracao_metas_privado.visivel(meta_id));

alter policy integracao_projetos_ler on public.meta_projetos
  using (integracao_metas_privado.visivel(meta_id));

alter policy integracao_checklist_ler on public.meta_checklist
  using (integracao_metas_privado.visivel(meta_id));

alter policy integracao_comentarios_ler on public.meta_comentarios
  using (integracao_metas_privado.visivel(meta_id));

alter policy integracao_historico_ler on public.meta_historico
  using (integracao_metas_privado.visivel(meta_id)
    or ((meta_id is null) and (integracao_metas_privado.papel() is not null)
      and ((autor_id = (select auth.uid())) or integracao_metas_privado.gerencia())));

alter policy integracao_anexos_ler on public.meta_arquivos
  using (integracao_metas_privado.visivel(meta_id));

alter policy ler on public.integracao_notificacoes
  using (public.integracao_notificacao_visivel(dados, criado_por));

drop function if exists integracao_metas_privado.metas_visiveis();

drop index if exists public.meta_historico_meta_id_idx;
drop index if exists public.meta_arquivos_meta_id_idx;
drop index if exists public.metas_created_by_idx;

commit;
