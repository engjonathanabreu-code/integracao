-- Additive permissions: Commercial may manage only municipal candidates in this
-- one configuration row. Other configuration and nucleus permissions stay intact.
CREATE POLICY funil_comercial_criar ON public.integracao_configuracoes
FOR INSERT TO authenticated WITH CHECK (
 colecao='config' AND registro_id='funilInstitucional' AND referencia_tabela='integracao_config'
 AND referencia_id IS NULL AND criado_por=(SELECT auth.uid())
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND ativo AND tipo='Comercial'));
CREATE POLICY funil_comercial_editar ON public.integracao_configuracoes
FOR UPDATE TO authenticated USING (
 colecao='config' AND registro_id='funilInstitucional' AND referencia_tabela='integracao_config'
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND ativo AND tipo='Comercial'))
WITH CHECK (colecao='config' AND registro_id='funilInstitucional' AND referencia_tabela='integracao_config'
 AND referencia_id IS NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND ativo AND tipo='Comercial'));

CREATE FUNCTION public.integracao_proteger_funil_comercial() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE anterior jsonb; atual jsonb; cidade jsonb; antiga jsonb;
BEGIN
 IF NEW.colecao<>'config' OR NEW.registro_id<>'funilInstitucional'
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND ativo AND tipo='Comercial') THEN RETURN NEW; END IF;
 anterior:=CASE WHEN TG_OP='INSERT' THEN '{"versao":1,"cidades":[],"nucleos":[],"historico":[]}'::jsonb ELSE OLD.dados->'valor' END;
 atual:=NEW.dados->'valor';
 IF jsonb_typeof(atual->'cidades') IS DISTINCT FROM 'array' OR jsonb_typeof(atual->'historico') IS DISTINCT FROM 'array'
 OR (atual-'cidades'-'historico') IS DISTINCT FROM (anterior-'cidades'-'historico')
 OR (NEW.dados-'valor') IS DISTINCT FROM (CASE WHEN TG_OP='INSERT' THEN '{"id":"funilInstitucional"}'::jsonb ELSE OLD.dados-'valor' END) THEN
 RAISE EXCEPTION 'O Comercial pode cadastrar e mover municípios, preservando os demais dados do fluxo' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.colecao,NEW.registro_id,NEW.criado_por,NEW.referencia_tabela,NEW.referencia_id) IS DISTINCT FROM (OLD.colecao,OLD.registro_id,OLD.criado_por,OLD.referencia_tabela,OLD.referencia_id) THEN
 RAISE EXCEPTION 'Preserve a identidade do fluxo' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(atual->'cidades') c WHERE c->>'etapa'='prospeccao')>4 THEN RAISE EXCEPTION 'Prospecção já acompanha quatro municípios'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(atual->'cidades') c GROUP BY c->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Município repetido no fluxo'; END IF;
 FOR antiga IN SELECT value FROM jsonb_array_elements(anterior->'cidades') LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(atual->'cidades') c WHERE c->>'id'=antiga->>'id') THEN RAISE EXCEPTION 'Preserve os municípios existentes' USING ERRCODE='42501'; END IF;
 END LOOP;
 FOR cidade IN SELECT value FROM jsonb_array_elements(atual->'cidades') LOOP
  SELECT value INTO antiga FROM jsonb_array_elements(anterior->'cidades') c WHERE c->>'id'=cidade->>'id';
  IF antiga IS NOT NULL THEN
   IF (cidade-'etapa') IS DISTINCT FROM (antiga-'etapa') THEN RAISE EXCEPTION 'Preserve os dados do município ao mover' USING ERRCODE='42501'; END IF;
  ELSIF nullif(cidade->>'id','') IS NULL OR length(trim(cidade->>'nome'))<2 OR coalesce(cidade->>'uf','')!~'^[A-Z]{2}$'
    OR (cidade-'id'-'nome'-'uf'-'etapa')<>'{}' THEN RAISE EXCEPTION 'Informe município e UF sem vínculos externos'; END IF;
  IF coalesce(cidade->>'etapa','') NOT IN ('nuvens','prospeccao','carteiras') THEN RAISE EXCEPTION 'Etapa municipal inválida'; END IF;
 END LOOP;
 IF NOT (atual->'historico') @> (anterior->'historico') THEN RAISE EXCEPTION 'Preserve o histórico do fluxo' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.integracao_proteger_funil_comercial() FROM PUBLIC,anon;
CREATE TRIGGER proteger_funil_comercial BEFORE INSERT OR UPDATE ON public.integracao_configuracoes
FOR EACH ROW EXECUTE FUNCTION public.integracao_proteger_funil_comercial();

-- The calendar reader already exposes the full calendar to these managers.
-- Align the direct optimistic-lock read/update with that existing permission.
CREATE POLICY integracao_gestores_ler_evento ON public.erp_eventos FOR SELECT TO authenticated
USING(erp_collab_private.integracao_gestor_calendario());
CREATE POLICY integracao_gestores_editar_evento ON public.erp_eventos FOR UPDATE TO authenticated
USING(erp_collab_private.integracao_gestor_calendario()) WITH CHECK(erp_collab_private.integracao_gestor_calendario());
DO $patch$
DECLARE original text; atualizado text;
BEGIN
 SELECT pg_get_functiondef('erp_collab_private.mutate(text,jsonb)'::regprocedure) INTO original;
 atualizado:=replace(original, 'if op=''evento_cor'' and not public.is_admin()', 'if op=''evento_cor'' and not erp_collab_private.integracao_gestor_calendario()');
 atualizado:=replace(atualizado, 'if op=''evento_status'' and ev.created_by<>me and not public.is_admin()', 'if op=''evento_status'' and ev.created_by<>me and not erp_collab_private.integracao_gestor_calendario()');
 IF atualizado=original THEN RAISE EXCEPTION 'Revisar autorização de eventos antes de aplicar'; END IF;
 EXECUTE atualizado;
 SELECT pg_get_functiondef('erp_collab_private.move_event(uuid,date)'::regprocedure) INTO original;
 atualizado:=replace(original,'if ev.created_by<>auth.uid() and not public.is_admin()', 'if ev.created_by<>auth.uid() and not erp_collab_private.integracao_gestor_calendario()');
 IF atualizado=original THEN RAISE EXCEPTION 'Revisar movimentação de eventos antes de aplicar'; END IF;
 EXECUTE atualizado;
 SELECT pg_get_functiondef('public.integracao_validar_evento()'::regprocedure) INTO original;
 atualizado:=replace(original,'AND NOT public.is_admin()', 'AND NOT erp_collab_private.integracao_gestor_calendario()');
 IF atualizado=original THEN RAISE EXCEPTION 'Revisar validação de eventos antes de aplicar'; END IF;
 EXECUTE atualizado;
END $patch$;
