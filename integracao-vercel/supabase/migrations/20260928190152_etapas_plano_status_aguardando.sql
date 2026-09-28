SET lock_timeout='5s';
ALTER TABLE public.etapas_plano DROP CONSTRAINT etapas_plano_status_check, ADD CONSTRAINT etapas_plano_status_check CHECK (status = ANY (ARRAY['Pendente'::text,'Aguardando'::text,'Em andamento'::text,'Em revisão'::text,'Concluída'::text,'Bloqueada'::text]));
