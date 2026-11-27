-- EDI-C1. AND all existing edit policies with the canonical non-consultation profile.
-- SELECT, INSERT, DELETE and existing grants remain unchanged.
-- Reversal: supabase/operacoes/clientes-edicao-sem-perfil-consulta-reversao.sql.

begin;

create policy integracao_clientes_edicao_perfil_operacional on public.fin_receb_clientes
  as restrictive for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo
      and (p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Comercial','Atendimentos','Topografia','Projetos','Pós-protocolo','Jurídico')
        or lower(trim(coalesce(p.tipo,''))) = 'financeiro'
        or lower(trim(coalesce(p.setor,''))) = 'financeiro')))
  with check (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo
      and (p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Comercial','Atendimentos','Topografia','Projetos','Pós-protocolo','Jurídico')
        or lower(trim(coalesce(p.tipo,''))) = 'financeiro'
        or lower(trim(coalesce(p.setor,''))) = 'financeiro')));

commit;
