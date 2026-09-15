-- Sem novas tabelas/colunas: protege referências no histórico JSON já existente.
CREATE OR REPLACE FUNCTION public.integracao_proc_usou(documento jsonb, representante jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT documento->>'tipo' = 'procuracao' AND (
   EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(documento->'representantes','[]')) r WHERE r->>'id'=representante->>'id' OR lower(r->>'nome')=lower(representante->>'nome'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(documento->'procuradores','[]')) r WHERE lower(coalesce(r->>'nome',r#>>'{}'))=lower(representante->>'nome'))
   OR EXISTS(SELECT 1 FROM regexp_split_to_table(regexp_replace(coalesce(documento->>'condicoes',''),'^para\s+','','i'),'[,;]\s*') nome WHERE lower(trim(nome))=lower(trim(representante->>'nome')) AND nullif(representante->>'nome','') IS NOT NULL)
 );
$$;
CREATE OR REPLACE FUNCTION public.integracao_contar_procuracoes(representante jsonb)
RETURNS bigint LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
 SELECT count(*) FROM (
   SELECT DISTINCT ON (registro_id) registro_id,dados FROM (
     SELECT registro_id,dados,1 prioridade FROM public.integracao_moradores WHERE colecao='processos'
     UNION ALL SELECT registro_id,dados,2 FROM public.integracao_complementos WHERE colecao='processos'
   ) fontes ORDER BY registro_id,prioridade
 ) moradores CROSS JOIN LATERAL jsonb_array_elements(coalesce(dados->'documentosGerados','[]')) documento
 WHERE public.integracao_proc_usou(documento,representante);
$$;
REVOKE ALL ON FUNCTION public.integracao_contar_procuracoes(jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.integracao_uso_representantes()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE resultado jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND ativo AND tipo IN ('Administrador','Diretor Técnico','Diretor de Projetos')) THEN RAISE EXCEPTION 'Somente a Diretoria consulta o uso dos representantes'; END IF;
 SELECT coalesce(jsonb_object_agg(r->>'id',public.integracao_contar_procuracoes(r)),'{}') INTO resultado
 FROM public.integracao_configuracoes c CROSS JOIN LATERAL jsonb_array_elements(c.dados->'valor') r
 WHERE c.colecao='config' AND c.registro_id='advogados';
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.integracao_uso_representantes() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_uso_representantes() TO authenticated;
CREATE OR REPLACE FUNCTION public.integracao_proteger_representantes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE anterior jsonb; atual jsonb; r jsonb; g jsonb; quantidade bigint; cadastro jsonb; nome_legado text;
BEGIN
 IF TG_OP='DELETE' THEN atual:='{}'; ELSE atual:=NEW.dados; END IF;
 IF TG_OP='INSERT' THEN anterior:='{}'; ELSE anterior:=OLD.dados; END IF;
 IF coalesce(NEW.colecao,OLD.colecao)='config' AND coalesce(NEW.registro_id,OLD.registro_id)='advogados' THEN
   IF atual IS NOT DISTINCT FROM anterior THEN RETURN NEW; END IF;
   PERFORM pg_advisory_xact_lock(73150473);
   FOR r IN SELECT value FROM jsonb_array_elements(coalesce(anterior->'valor','[]')) LOOP
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(atual->'valor','[]')) a WHERE a->>'id'=r->>'id') THEN
       IF auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND ativo AND tipo IN ('Administrador','Diretor Técnico','Diretor de Projetos')) THEN RAISE EXCEPTION 'Somente a Diretoria exclui representantes'; END IF;
       quantidade:=public.integracao_contar_procuracoes(r);
       IF quantidade>0 THEN RAISE EXCEPTION '% consta em % procurações emitidas. Marque como indisponível.',r->>'nome',quantidade; END IF;
     ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(atual->'valor','[]')) a WHERE a->>'id'=r->>'id' AND a->>'nome' IS DISTINCT FROM r->>'nome') AND public.integracao_contar_procuracoes(r)>0 THEN
       RAISE EXCEPTION 'O nome de % deve ser preservado porque consta em procurações emitidas.',r->>'nome';
     END IF;
   END LOOP;
 ELSIF coalesce(NEW.colecao,OLD.colecao)='processos' AND atual->'documentosGerados' IS DISTINCT FROM anterior->'documentosGerados' THEN
   PERFORM pg_advisory_xact_lock(73150473);
   SELECT dados->'valor' INTO cadastro FROM public.integracao_configuracoes WHERE colecao='config' AND registro_id='advogados';
   FOR g IN SELECT value FROM jsonb_array_elements(coalesce(atual->'documentosGerados','[]')) LOOP
     IF g->>'tipo'='procuracao' AND NOT coalesce(anterior->'documentosGerados','[]') @> jsonb_build_array(g) THEN
       IF jsonb_array_length(coalesce(g->'representantes','[]'))=0 THEN
         IF nullif(g->>'condicoes','') IS NULL THEN RAISE EXCEPTION 'Informe os representantes da procuração'; END IF;
         FOR nome_legado IN SELECT regexp_split_to_table(regexp_replace(g->>'condicoes','^para ','','i'),',\s*') LOOP
           IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(cadastro,'[]')) a WHERE lower(a->>'nome')=lower(trim(nome_legado)) AND coalesce((a->>'ativo')::boolean,true)) THEN
             RAISE EXCEPTION 'Representante indisponível: %. Atualize o cadastro e gere uma nova prévia.',nome_legado;
           END IF;
         END LOOP;
       END IF;
       FOR r IN SELECT value FROM jsonb_array_elements(coalesce(g->'representantes','[]')) LOOP
         IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(cadastro,'[]')) a WHERE a->>'id'=r->>'id' AND coalesce((a->>'ativo')::boolean,true)) THEN
           RAISE EXCEPTION 'Representante indisponível: %. Atualize o cadastro e gere uma nova prévia.',r->>'nome';
         END IF;
       END LOOP;
     END IF;
   END LOOP;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.integracao_proteger_representantes() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS proteger_representantes ON public.integracao_configuracoes;
CREATE TRIGGER proteger_representantes BEFORE INSERT OR UPDATE OR DELETE ON public.integracao_configuracoes FOR EACH ROW EXECUTE FUNCTION public.integracao_proteger_representantes();
DROP TRIGGER IF EXISTS proteger_representantes ON public.integracao_moradores;
CREATE TRIGGER proteger_representantes BEFORE INSERT OR UPDATE OR DELETE ON public.integracao_moradores FOR EACH ROW EXECUTE FUNCTION public.integracao_proteger_representantes();
DROP TRIGGER IF EXISTS proteger_representantes ON public.integracao_complementos;
CREATE TRIGGER proteger_representantes BEFORE INSERT OR UPDATE OR DELETE ON public.integracao_complementos FOR EACH ROW EXECUTE FUNCTION public.integracao_proteger_representantes();
