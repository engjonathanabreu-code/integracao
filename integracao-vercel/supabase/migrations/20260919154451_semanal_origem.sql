begin;
alter table public.integracao_semanal_municipios add column origem_dados jsonb;
alter table public.integracao_semanal_semanas add column origem_dados jsonb;
alter table public.integracao_semanal_registros add column origem_dados jsonb;
-- Registros importados ambíguos permanecem em revisão, sem criar município canônico.
alter table public.integracao_semanal_municipios alter column municipio_id drop not null;
alter table public.integracao_semanal_municipios add constraint semanal_municipio_ou_revisao check (
 municipio_id is not null or (origem_id is not null and nullif(trim(origem_dados->>'nome'),'') is not null and nullif(trim(origem_dados->>'estado'),'') is not null)
);
commit;
