-- Undo EDI-C1 without changing any pre-existing policies.
begin;
drop policy if exists integracao_clientes_edicao_perfil_operacional on public.fin_receb_clientes;
commit;
