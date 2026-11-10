DO $patch$
DECLARE fonte text;
BEGIN
 SELECT pg_get_functiondef('public.integracao_qualificacoes_nucleo(text,text,text[],integer,integer)'::regprocedure) INTO fonte;
 IF md5(fonte)<>'cd85a2bf3c2cbbe3bc9f021f24873df9' THEN
  RAISE EXCEPTION 'Definição de qualificações mudou; revisar antes de aplicar';
 END IF;
 -- Prevent planner expansion from evaluating the full canonical record repeatedly
 -- for filtering, sorting, count and result. No change to RLS or alias validation.
 fonte:=replace(fonte,'vinculados as (select integracao_documentos_privado.morador','vinculados as materialized (select integracao_documentos_privado.morador');
 EXECUTE fonte;
END $patch$;
