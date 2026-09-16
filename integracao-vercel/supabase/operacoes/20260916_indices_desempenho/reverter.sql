-- Executar com autocommit, fora de BEGIN/COMMIT.
DROP INDEX CONCURRENTLY IF EXISTS public.integracao_moradores_nucleo_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.integracao_nucleos_codigo_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.integracao_nucleos_remessa_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.integracao_moradores_atualizado_idx;
