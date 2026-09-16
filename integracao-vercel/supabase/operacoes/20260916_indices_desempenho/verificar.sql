-- Devem existir exatamente quatro resultados, todos validos e prontos.
SELECT c.relname, i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid)
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'integracao_moradores_nucleo_idx', 'integracao_nucleos_codigo_idx',
  'integracao_nucleos_remessa_idx', 'integracao_moradores_atualizado_idx')
ORDER BY c.relname;

-- Inventario global: nao remover automaticamente indices de outras tarefas.
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
