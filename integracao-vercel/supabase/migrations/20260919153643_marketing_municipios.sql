begin;
alter table public.integracao_marketing_projetos alter column nucleo_id drop not null;
alter table public.integracao_marketing_projetos add column municipio_id uuid references public.fin_receb_municipios(id);
alter table public.integracao_marketing_projetos add constraint marketing_destino_unico check(num_nonnulls(nucleo_id,municipio_id)=1);
create unique index integracao_marketing_por_municipio on public.integracao_marketing_projetos(municipio_id) where municipio_id is not null;
alter table public.integracao_marketing_projetos add column origem_dados jsonb;
alter table public.integracao_marketing_progresso add column origem_dados jsonb;
commit;
