-- Uses existing identities without disclosing them. Every test write is rolled back.
BEGIN;
SELECT set_config('test.integracao_owner',(SELECT id::text FROM public.profiles WHERE ativo AND tipo='Administrador' LIMIT 1),true);
SELECT set_config('test.integracao_reader',(SELECT id::text FROM public.profiles WHERE ativo AND tipo='Topografia' LIMIT 1),true);
SELECT set_config('request.jwt.claim.sub',current_setting('test.integracao_owner'),true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE t text; c text; operacoes jsonb; pedido uuid:=gen_random_uuid(); resultado jsonb;
BEGIN
 FOR t,c IN SELECT * FROM (VALUES
 ('integracao_moradores','processos'),('integracao_nucleos','nucleos'),('integracao_municipios','municipios'),
 ('integracao_remessas','remessas'),('integracao_metas','metas'),('integracao_planos','planos'),
 ('integracao_ordens_servico','ordensServico'),('integracao_chat','conversas'),('integracao_usuarios','usuarios'),
 ('integracao_calendario','eventos'),('integracao_configuracoes','config'),('integracao_arquivos','arquivos')) v(t,c)
 LOOP
 operacoes:=jsonb_build_array(jsonb_build_object('table',t,'key',jsonb_build_object('colecao',c,'registro_id','codex-verify'),'insert',true,
 'changes',jsonb_build_object('dados',jsonb_build_object('teste',true),'criado_por',auth.uid(),'referencia_tabela',CASE WHEN t='integracao_configuracoes' THEN 'integracao_config' END)));
 pedido:=gen_random_uuid();resultado:=public.integracao_gravar(operacoes,pedido);
 IF public.integracao_gravar(operacoes,pedido) IS DISTINCT FROM resultado THEN RAISE EXCEPTION 'Falha de idempotência'; END IF;
 BEGIN
 PERFORM public.integracao_gravar(jsonb_build_array(jsonb_build_object('table',t,'key',jsonb_build_object('colecao',c,'registro_id','codex-verify'),'expected',jsonb_build_object('dados','{}'::jsonb),'changes',jsonb_build_object('dados','{"teste":false}'::jsonb))));
 RAISE EXCEPTION 'Conflito não detectado';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 END LOOP;
 INSERT INTO public.integracao_auditoria(colecao,registro_id,dados) VALUES('auditoria','codex-verify',jsonb_build_object('usuarioId','erp_'||auth.uid()::text,'acao','Teste isolado'));
 INSERT INTO public.integracao_notificacoes(colecao,registro_id,dados) VALUES('notificacoes','codex-verify',jsonb_build_object('titulo','Teste isolado','usuarios',jsonb_build_array('erp_'||current_setting('test.integracao_reader')),'lidaPor','[]'::jsonb));
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('test.integracao_reader'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.integracao_notificacoes WHERE registro_id='codex-verify') THEN RAISE EXCEPTION 'Destinatário não recebeu notificação'; END IF;
 IF EXISTS(SELECT 1 FROM public.integracao_moradores WHERE registro_id='codex-verify') THEN RAISE EXCEPTION 'Cadastro privado exposto'; END IF;
 UPDATE public.integracao_notificacoes SET dados=jsonb_set(dados,'{lidaPor}',jsonb_build_array('erp_'||auth.uid()::text)) WHERE registro_id='codex-verify';
 BEGIN
 UPDATE public.integracao_notificacoes SET dados=jsonb_set(dados,'{titulo}','"Alterado"') WHERE registro_id='codex-verify';
 RAISE EXCEPTION 'Texto da notificação ficou editável' USING ERRCODE='ZZ001';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
 INSERT INTO public.integracao_configuracoes(colecao,registro_id,dados,referencia_tabela) VALUES('config','codex-verify-forbidden','{}','integracao_config');
 RAISE EXCEPTION 'Configuração editável sem permissão' USING ERRCODE='ZZ001';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
 DELETE FROM public.integracao_auditoria WHERE registro_id='codex-verify';
 RAISE EXCEPTION 'Histórico removível' USING ERRCODE='ZZ001';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: module writes, idempotency, conflicts, notification recipients, private records, immutable audit and restricted settings' AS result;
ROLLBACK;
