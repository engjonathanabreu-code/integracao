-- EDI-C1 — PREPARADA, NÃO APLICADA. Aplicar somente com autorização explícita.
-- A política geral de edição de moradores (20260928125709) vale para qualquer perfil ativo.
-- Passa a excluir o setor de consulta do Integração: todo tipo do ERP sem setor próprio
-- (hoje Marketing, Administrativo, Consulta e tipos desconhecidos), a mesma regra de
-- src/permissoes.js (setorDoPerfilERP) e de integracao_mailing_privado.setor.
-- Não altera leitura (SELECT), criação (INSERT), municípios, remessas nem as demais políticas.
-- ATENÇÃO antes de aplicar: políticas permissivas se somam. Confira no banco de destino as
-- outras políticas de UPDATE de fin_receb_clientes (no retrato de 23/09/2026 havia
-- integracao_crm_clientes_editar, que libera a linha quando existe cartão do CRM para o cliente);
-- esta migration não as altera.
-- Reversão: supabase/operacoes/clientes-edicao-sem-perfil-consulta-reversao.sql

begin;

alter policy integracao_setores_cadastro_editar on public.fin_receb_clientes
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
