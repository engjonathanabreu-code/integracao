-- Additive module persistence. No existing business row is copied, updated or removed.
CREATE TEMP TABLE integracao_antes(tabela text, total bigint, assinatura text) ON COMMIT DROP;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('INSERT INTO pg_temp.integracao_antes SELECT %L,count(*),md5(coalesce(string_agg((to_jsonb(r))::text,'''' ORDER BY (to_jsonb(r))::text),'''')) FROM public.%I r',t.tablename,t.tablename);
 END LOOP;
END $$;

CREATE TABLE public.integracao_moradores (
 colecao text NOT NULL CHECK(colecao IN ('processos')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_moradores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_moradores FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_moradores_referencia_idx ON public.integracao_moradores(referencia_tabela,referencia_id);
CREATE INDEX integracao_moradores_autor_idx ON public.integracao_moradores(criado_por);
COMMENT ON TABLE public.integracao_moradores IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
GRANT SELECT,INSERT,DELETE ON public.integracao_moradores TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_moradores TO authenticated;
CREATE POLICY ler ON public.integracao_moradores FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_moradores FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY editar ON public.integracao_moradores FOR UPDATE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())) WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY remover ON public.integracao_moradores FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE TABLE public.integracao_nucleos (
 colecao text NOT NULL CHECK(colecao IN ('nucleos')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_nucleos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_nucleos FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_nucleos_referencia_idx ON public.integracao_nucleos(referencia_tabela,referencia_id);
CREATE INDEX integracao_nucleos_autor_idx ON public.integracao_nucleos(criado_por);
COMMENT ON TABLE public.integracao_nucleos IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
GRANT SELECT,INSERT,DELETE ON public.integracao_nucleos TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_nucleos TO authenticated;
CREATE POLICY ler ON public.integracao_nucleos FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_nucleos FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY editar ON public.integracao_nucleos FOR UPDATE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())) WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY remover ON public.integracao_nucleos FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE TABLE public.integracao_municipios (
 colecao text NOT NULL CHECK(colecao IN ('municipios')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_municipios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_municipios FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_municipios_referencia_idx ON public.integracao_municipios(referencia_tabela,referencia_id);
CREATE INDEX integracao_municipios_autor_idx ON public.integracao_municipios(criado_por);
COMMENT ON TABLE public.integracao_municipios IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
GRANT SELECT,INSERT,DELETE ON public.integracao_municipios TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_municipios TO authenticated;
CREATE POLICY ler ON public.integracao_municipios FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_municipios FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY editar ON public.integracao_municipios FOR UPDATE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())) WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY remover ON public.integracao_municipios FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE TABLE public.integracao_remessas (
 colecao text NOT NULL CHECK(colecao IN ('remessas')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_remessas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_remessas FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_remessas_referencia_idx ON public.integracao_remessas(referencia_tabela,referencia_id);
CREATE INDEX integracao_remessas_autor_idx ON public.integracao_remessas(criado_por);
COMMENT ON TABLE public.integracao_remessas IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
GRANT SELECT,INSERT,DELETE ON public.integracao_remessas TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_remessas TO authenticated;
CREATE POLICY ler ON public.integracao_remessas FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_remessas FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY editar ON public.integracao_remessas FOR UPDATE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())) WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY remover ON public.integracao_remessas FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE TABLE public.integracao_metas (
 colecao text NOT NULL CHECK(colecao IN ('metas','checklist','arquivos')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_metas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_metas FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_metas_referencia_idx ON public.integracao_metas(referencia_tabela,referencia_id);
CREATE INDEX integracao_metas_autor_idx ON public.integracao_metas(criado_por);
COMMENT ON TABLE public.integracao_metas IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
GRANT SELECT,INSERT,DELETE ON public.integracao_metas TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_metas TO authenticated;
CREATE POLICY ler ON public.integracao_metas FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_metas FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY editar ON public.integracao_metas FOR UPDATE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())) WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY remover ON public.integracao_metas FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE TABLE public.integracao_planos (
 colecao text NOT NULL CHECK(colecao IN ('planos','etapas','entregaveis')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_planos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_planos FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_planos_referencia_idx ON public.integracao_planos(referencia_tabela,referencia_id);
CREATE INDEX integracao_planos_autor_idx ON public.integracao_planos(criado_por);
COMMENT ON TABLE public.integracao_planos IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
GRANT SELECT,INSERT,DELETE ON public.integracao_planos TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_planos TO authenticated;
CREATE POLICY ler ON public.integracao_planos FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_planos FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY editar ON public.integracao_planos FOR UPDATE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())) WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY remover ON public.integracao_planos FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE TABLE public.integracao_ordens_servico (
 colecao text NOT NULL CHECK(colecao IN ('ordensServico')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_ordens_servico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_ordens_servico FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_ordens_servico_referencia_idx ON public.integracao_ordens_servico(referencia_tabela,referencia_id);
CREATE INDEX integracao_ordens_servico_autor_idx ON public.integracao_ordens_servico(criado_por);
COMMENT ON TABLE public.integracao_ordens_servico IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
GRANT SELECT,INSERT,DELETE ON public.integracao_ordens_servico TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_ordens_servico TO authenticated;
CREATE POLICY ler ON public.integracao_ordens_servico FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_ordens_servico FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY editar ON public.integracao_ordens_servico FOR UPDATE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())) WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY remover ON public.integracao_ordens_servico FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE TABLE public.integracao_chat (
 colecao text NOT NULL CHECK(colecao IN ('conversas','mensagens')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_chat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_chat FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_chat_referencia_idx ON public.integracao_chat(referencia_tabela,referencia_id);
CREATE INDEX integracao_chat_autor_idx ON public.integracao_chat(criado_por);
COMMENT ON TABLE public.integracao_chat IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
GRANT SELECT,INSERT,DELETE ON public.integracao_chat TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_chat TO authenticated;
CREATE POLICY ler ON public.integracao_chat FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_chat FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY editar ON public.integracao_chat FOR UPDATE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())) WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY remover ON public.integracao_chat FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE TABLE public.integracao_usuarios (
 colecao text NOT NULL CHECK(colecao IN ('usuarios')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_usuarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_usuarios FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_usuarios_referencia_idx ON public.integracao_usuarios(referencia_tabela,referencia_id);
CREATE INDEX integracao_usuarios_autor_idx ON public.integracao_usuarios(criado_por);
COMMENT ON TABLE public.integracao_usuarios IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
GRANT SELECT,INSERT,DELETE ON public.integracao_usuarios TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_usuarios TO authenticated;
CREATE POLICY ler ON public.integracao_usuarios FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_usuarios FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY editar ON public.integracao_usuarios FOR UPDATE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())) WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY remover ON public.integracao_usuarios FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE TABLE public.integracao_calendario (
 colecao text NOT NULL CHECK(colecao IN ('eventos','agendas')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_calendario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_calendario FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_calendario_referencia_idx ON public.integracao_calendario(referencia_tabela,referencia_id);
CREATE INDEX integracao_calendario_autor_idx ON public.integracao_calendario(criado_por);
COMMENT ON TABLE public.integracao_calendario IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
GRANT SELECT,INSERT,DELETE ON public.integracao_calendario TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_calendario TO authenticated;
CREATE POLICY ler ON public.integracao_calendario FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_calendario FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY editar ON public.integracao_calendario FOR UPDATE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())) WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY remover ON public.integracao_calendario FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE TABLE public.integracao_notificacoes (
 colecao text NOT NULL CHECK(colecao IN ('notificacoes')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_notificacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_notificacoes FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_notificacoes_referencia_idx ON public.integracao_notificacoes(referencia_tabela,referencia_id);
CREATE INDEX integracao_notificacoes_autor_idx ON public.integracao_notificacoes(criado_por);
COMMENT ON TABLE public.integracao_notificacoes IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
CREATE TABLE public.integracao_auditoria (
 colecao text NOT NULL CHECK(colecao IN ('auditoria')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_auditoria FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_auditoria_referencia_idx ON public.integracao_auditoria(referencia_tabela,referencia_id);
CREATE INDEX integracao_auditoria_autor_idx ON public.integracao_auditoria(criado_por);
COMMENT ON TABLE public.integracao_auditoria IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
CREATE TABLE public.integracao_configuracoes (
 colecao text NOT NULL CHECK(colecao IN ('config','regrasIA','tiposDocumento','advogados','camposComercial')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id), CHECK(referencia_tabela IS NOT DISTINCT FROM 'integracao_config')
);
ALTER TABLE public.integracao_configuracoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_configuracoes FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_configuracoes_referencia_idx ON public.integracao_configuracoes(referencia_tabela,referencia_id);
CREATE INDEX integracao_configuracoes_autor_idx ON public.integracao_configuracoes(criado_por);
COMMENT ON TABLE public.integracao_configuracoes IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
GRANT SELECT,INSERT,DELETE ON public.integracao_configuracoes TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_configuracoes TO authenticated;
CREATE POLICY ler ON public.integracao_configuracoes FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_configuracoes FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY editar ON public.integracao_configuracoes FOR UPDATE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())) WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY remover ON public.integracao_configuracoes FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE TABLE public.integracao_arquivos (
 colecao text NOT NULL CHECK(colecao IN ('arquivos')), registro_id text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 referencia_tabela text, referencia_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(colecao,registro_id)
);
ALTER TABLE public.integracao_arquivos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_arquivos FROM PUBLIC,anon,authenticated;
CREATE INDEX integracao_arquivos_referencia_idx ON public.integracao_arquivos(referencia_tabela,referencia_id);
CREATE INDEX integracao_arquivos_autor_idx ON public.integracao_arquivos(criado_por);
COMMENT ON TABLE public.integracao_arquivos IS 'Campos exclusivos do Integração em JSONB; referencia_tabela e referencia_id apontam para o registro compartilhado do ERP. Não contém cópias das colunas canônicas.';
GRANT SELECT,INSERT,DELETE ON public.integracao_arquivos TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_arquivos TO authenticated;
CREATE POLICY ler ON public.integracao_arquivos FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_arquivos FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY editar ON public.integracao_arquivos FOR UPDATE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core())) WITH CHECK(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));
CREATE POLICY remover ON public.integracao_arquivos FOR DELETE TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()));

CREATE FUNCTION public.integracao_notificacao_visivel(dados jsonb,dono uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.ativo AND (
 dono=p.id OR public.is_erp_admin() OR dados->'usuarios' ? ('erp_'||p.id::text) OR
 dados->'setores' ? CASE p.tipo WHEN 'Administrador' THEN 'diretoria' WHEN 'Diretor Técnico' THEN 'diretoria' WHEN 'Diretor de Projetos' THEN 'diretoria' WHEN 'Comercial' THEN 'comercial' WHEN 'Atendimentos' THEN 'comercial' WHEN 'Topografia' THEN 'topografia' WHEN 'Projetos' THEN 'projeto' WHEN 'Pós-protocolo' THEN 'posprotocolo' WHEN 'Jurídico' THEN 'juridico' ELSE 'consulta' END));
$$;
REVOKE ALL ON FUNCTION public.integracao_notificacao_visivel(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_notificacao_visivel(jsonb,uuid) TO authenticated;
GRANT SELECT,INSERT ON public.integracao_notificacoes,public.integracao_auditoria TO authenticated;
GRANT UPDATE(dados,updated_at) ON public.integracao_notificacoes TO authenticated;
CREATE POLICY ler ON public.integracao_notificacoes FOR SELECT TO authenticated USING(public.integracao_notificacao_visivel(dados,criado_por));
CREATE POLICY criar ON public.integracao_notificacoes FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(null,null,criado_por));
CREATE POLICY marcar ON public.integracao_notificacoes FOR UPDATE TO authenticated USING(public.integracao_notificacao_visivel(dados,criado_por)) WITH CHECK(public.integracao_notificacao_visivel(dados,criado_por));
CREATE FUNCTION public.integracao_validar_leitura() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE eu text:='erp_'||auth.uid()::text;
BEGIN
 IF (NEW.dados-'lidaPor') IS DISTINCT FROM (OLD.dados-'lidaPor') OR
 (coalesce(NEW.dados->'lidaPor','[]')-eu) IS DISTINCT FROM (coalesce(OLD.dados->'lidaPor','[]')-eu)
 THEN RAISE EXCEPTION 'Somente a própria confirmação de leitura pode ser alterada'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.integracao_validar_leitura() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER confirmar_leitura BEFORE UPDATE ON public.integracao_notificacoes FOR EACH ROW EXECUTE FUNCTION public.integracao_validar_leitura();
CREATE POLICY ler ON public.integracao_auditoria FOR SELECT TO authenticated USING(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));
CREATE POLICY criar ON public.integracao_auditoria FOR INSERT TO authenticated WITH CHECK(criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por) AND dados->>'usuarioId'=('erp_'||auth.uid()::text));

INSERT INTO storage.buckets(id,name,public) VALUES('integracao','integracao',false) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='integracao' AND public) THEN RAISE EXCEPTION 'O armazenamento do Integração deve ser privado'; END IF; END $$;
CREATE INDEX integracao_arquivos_caminho_idx ON public.integracao_arquivos((dados->>'path'));
CREATE POLICY integracao_arquivo_inserir ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='integracao' AND (storage.foldername(name))[1]=(select auth.uid())::text AND public.integracao_acesso(null,null,(select auth.uid())));
CREATE POLICY integracao_arquivo_ler ON storage.objects FOR SELECT TO authenticated USING(bucket_id='integracao' AND public.integracao_acesso(null,null,(select auth.uid())) AND ((storage.foldername(name))[1]=(select auth.uid())::text OR EXISTS(SELECT 1 FROM public.integracao_arquivos a WHERE a.dados->>'path'=name)));
CREATE OR REPLACE FUNCTION public.integracao_gravar(operacoes jsonb,pedido uuid DEFAULT gen_random_uuid())
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE op jsonb; tabela text; chave jsonb; anterior jsonb; mudancas jsonb;
 atual jsonb; colunas text; valores text; atribuicoes text; resultado jsonb; filtro text; pk text[];
 aliases jsonb:='{}'; a record; consulta text; quantidade integer; recibo public.integracao_pedidos;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND ativo) THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
 IF jsonb_typeof(operacoes)<>'array' OR jsonb_array_length(operacoes)>1000 THEN RAISE EXCEPTION 'Lote inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||pedido::text,0));
 SELECT * INTO recibo FROM public.integracao_pedidos r WHERE r.usuario_id=auth.uid() AND r.pedido=integracao_gravar.pedido;
 IF FOUND THEN
  IF recibo.resumo<>md5(operacoes::text) THEN RAISE EXCEPTION 'Pedido já utilizado para outra alteração'; END IF;
  RETURN recibo.resultado;
 END IF;
 FOR op IN SELECT value FROM jsonb_array_elements(operacoes) LOOP
  FOR a IN SELECT * FROM jsonb_each_text(aliases) LOOP
   op:=replace(op::text,to_jsonb(a.key)::text,to_jsonb(a.value)::text)::jsonb;
  END LOOP;
  tabela:=op->>'table'; chave:=op->'key'; anterior:=op->'expected'; mudancas:=op->'changes';
  IF tabela IS NOT NULL THEN
   IF tabela NOT IN ('profiles','fin_receb_municipios','fin_receb_remessas','fin_receb_clientes','processos_kanban','processos_kanban_andamentos','processos_kanban_observacoes','processos_kanban_historico','meta_setores','metas','meta_responsaveis','meta_checklist','meta_comentarios','meta_historico','meta_arquivos','ordens_servico','ordem_servico_comentarios','planos_trabalho','etapas_plano','etapa_responsaveis','entregaveis','comentarios_plano','erp_agendas','erp_eventos','erp_conversas','integracao_complementos','integracao_moradores','integracao_nucleos','integracao_municipios','integracao_remessas','integracao_metas','integracao_planos','integracao_ordens_servico','integracao_chat','integracao_usuarios','integracao_calendario','integracao_notificacoes','integracao_auditoria','integracao_configuracoes','integracao_arquivos') THEN RAISE EXCEPTION 'Tabela não permitida'; END IF;
   IF chave IS NULL OR chave='{}' OR jsonb_typeof(chave)<>'object' THEN RAISE EXCEPTION 'Identificador obrigatório'; END IF;
   SELECT array_agg(attr.attname::text ORDER BY attr.attname) INTO pk FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute attr ON attr.attrelid=i.indrelid AND attr.attnum=ANY(i.indkey)
   WHERE i.indrelid=format('public.%I',tabela)::regclass AND i.indisprimary;
   IF pk IS DISTINCT FROM ARRAY(SELECT jsonb_object_keys(chave) ORDER BY 1) THEN RAISE EXCEPTION 'Informe exatamente a chave primária do registro'; END IF;
   SELECT string_agg(format('t.%I=k.%I',key,key),' AND ') INTO filtro FROM jsonb_each(chave);
   IF NOT coalesce((op->>'insert')::boolean,false) THEN
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t, jsonb_populate_record(NULL::public.%I,$1) k WHERE %s FOR UPDATE OF t',tabela,tabela,filtro) INTO atual USING chave;
    IF atual IS NULL THEN RAISE EXCEPTION 'Registro indisponível ou sem permissão: %',tabela; END IF;
    FOR a IN SELECT * FROM jsonb_each(coalesce(anterior,'{}')) LOOP
     IF (atual->a.key) IS DISTINCT FROM a.value THEN RAISE EXCEPTION 'Conflito em %. Outro usuário alterou o registro. Sua edição foi preservada para revisão.',tabela USING ERRCODE='40001'; END IF;
    END LOOP;
   END IF;
  END IF;
  IF coalesce((op->>'remove')::boolean,false) THEN
   IF tabela='profiles' THEN RAISE EXCEPTION 'Exclusão não permitida nesta tabela'; END IF;
   EXECUTE format('DELETE FROM public.%I t USING jsonb_populate_record(NULL::public.%I,$1) k WHERE %s',tabela,tabela,filtro) USING chave;
   GET DIAGNOSTICS quantidade=ROW_COUNT;
   IF quantidade<>1 THEN RAISE EXCEPTION 'Exclusão não autorizada'; END IF;
  ELSIF op ? 'action' THEN
   IF op->>'action' NOT IN ('agenda','agenda_atualizar','evento','evento_status','evento_cor','evento_mover','resposta','conversa','mensagem','exclusao','decidir_exclusao','lida','pessoal') THEN RAISE EXCEPTION 'Ação não permitida'; END IF;
   resultado:=public.erp_collab_action(op->>'action',op->'payload');
   IF op ? 'tempId' THEN aliases:=aliases||jsonb_build_object(op->>'tempId',resultado->>'id'); END IF;
  ELSE
   IF tabela IS NULL OR mudancas IS NULL OR jsonb_typeof(mudancas)<>'object' OR mudancas='{}' THEN RAISE EXCEPTION 'Alteração inválida'; END IF;
   IF NOT coalesce((op->>'insert')::boolean,false) AND (mudancas ? 'id' OR mudancas ? 'created_by' OR mudancas ? 'criado_por' OR mudancas ? 'referencia_tabela' OR mudancas ? 'referencia_id') THEN RAISE EXCEPTION 'Identidade do registro não pode ser alterada'; END IF;
   IF coalesce((op->>'insert')::boolean,false) THEN
    mudancas:=mudancas||chave;
    SELECT string_agg(format('%I',key),','), string_agg(format('r.%I',key),',') INTO colunas,valores FROM jsonb_each(mudancas);
    consulta:=format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r',tabela,colunas,valores,tabela);
    EXECUTE consulta USING mudancas;
   ELSE
    SELECT string_agg(format('%I=r.%I',key,key),',') INTO atribuicoes FROM jsonb_each(mudancas);
    EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r, jsonb_populate_record(NULL::public.%I,$2) k WHERE %s',tabela,atribuicoes,tabela,tabela,filtro) USING mudancas,chave;
    GET DIAGNOSTICS quantidade=ROW_COUNT;
    IF quantidade<>1 THEN RAISE EXCEPTION 'Gravação não autorizada ou registro ambíguo'; END IF;
   END IF;
  END IF;
 END LOOP;
 resultado:=jsonb_build_object('aliases',aliases);
 INSERT INTO public.integracao_pedidos(usuario_id,pedido,resumo,resultado) VALUES(auth.uid(),pedido,md5(operacoes::text),resultado);
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.integracao_gravar(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_gravar(jsonb,uuid) TO authenticated;


DO $$ DECLARE t record; total_depois bigint; assinatura_depois text; BEGIN
 FOR t IN SELECT * FROM pg_temp.integracao_antes LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg((to_jsonb(r))::text,'''' ORDER BY (to_jsonb(r))::text),'''')) FROM public.%I r',t.tabela) INTO total_depois,assinatura_depois;
  IF total_depois<>t.total OR assinatura_depois<>t.assinatura THEN RAISE EXCEPTION 'Os dados de % mudaram durante a preparação. A operação foi cancelada para preservar os registros.',t.tabela; END IF;
 END LOOP;
END $$;
