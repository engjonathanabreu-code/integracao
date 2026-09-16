-- Executar com autocommit, fora de BEGIN/COMMIT. Ver README.md.
CREATE INDEX CONCURRENTLY IF NOT EXISTS integracao_moradores_nucleo_idx
ON public.integracao_moradores ((dados->>'nucleoId'));

CREATE INDEX CONCURRENTLY IF NOT EXISTS integracao_nucleos_codigo_idx
ON public.integracao_nucleos ((dados->>'codigo'));

CREATE INDEX CONCURRENTLY IF NOT EXISTS integracao_nucleos_remessa_idx
ON public.integracao_nucleos ((dados->>'remessaId'));

CREATE INDEX CONCURRENTLY IF NOT EXISTS integracao_moradores_atualizado_idx
ON public.integracao_moradores (updated_at desc);

ANALYZE public.integracao_moradores;
ANALYZE public.integracao_nucleos;
