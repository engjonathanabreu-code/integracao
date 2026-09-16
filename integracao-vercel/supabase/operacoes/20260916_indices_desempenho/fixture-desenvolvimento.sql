-- SOMENTE em banco descartavel de desenvolvimento, nunca em producao.
CREATE TABLE public.integracao_moradores (colecao text NOT NULL, registro_id text NOT NULL, dados jsonb NOT NULL DEFAULT '{}'::jsonb, criado_por uuid NOT NULL, referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (colecao,registro_id));
CREATE TABLE public.integracao_nucleos (LIKE public.integracao_moradores INCLUDING ALL);
CREATE INDEX integracao_moradores_autor_idx ON public.integracao_moradores(criado_por);
CREATE INDEX integracao_moradores_referencia_idx ON public.integracao_moradores(referencia_tabela,referencia_id);
CREATE INDEX integracao_nucleos_autor_idx ON public.integracao_nucleos(criado_por);
CREATE INDEX integracao_nucleos_referencia_idx ON public.integracao_nucleos(referencia_tabela,referencia_id);
INSERT INTO public.integracao_moradores(colecao,registro_id,dados,criado_por)
SELECT 'processos', g::text, jsonb_build_object('nucleoId',CASE WHEN g<=24 THEN 'nucleo-alvo' ELSE 'nucleo-'||(1+g%708)::text END,'requerente',jsonb_build_object('nome','Morador sintetico '||g),'qualificacao',jsonb_build_object('textos',jsonb_build_object('completa',(SELECT string_agg(md5(g::text||':'||s::text),'') FROM generate_series(1,219) s)))),'00000000-0000-0000-0000-000000000001'::uuid
FROM generate_series(1,11063) g;
INSERT INTO public.integracao_nucleos(colecao,registro_id,dados,criado_por)
SELECT 'nucleos',g::text,jsonb_build_object('codigo','NUC-'||g,'remessaId','remessa-'||g),'00000000-0000-0000-0000-000000000001'::uuid FROM generate_series(1,709) g;
ANALYZE public.integracao_moradores;
ANALYZE public.integracao_nucleos;
