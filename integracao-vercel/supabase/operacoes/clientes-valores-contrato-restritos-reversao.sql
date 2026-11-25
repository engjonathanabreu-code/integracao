-- Reversão de supabase/migrations/20261125190100_clientes_valores_contrato_restritos.sql.
-- Remove o gatilho e a função; as políticas e os dados não foram alterados pela migration.
begin;
drop trigger if exists integracao_clientes_valores_contrato_restritos on public.fin_receb_clientes;
drop function if exists public.integracao_clientes_valores_contrato_restritos();
commit;
