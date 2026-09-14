-- Calendar-specific authorization; existing ERP business records are not modified.
CREATE FUNCTION erp_collab_private.integracao_gestor_calendario() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND ativo
 AND tipo IN ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto'));
$$;
REVOKE ALL ON FUNCTION erp_collab_private.integracao_gestor_calendario() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_collab_private.integracao_gestor_calendario() TO authenticated;

-- The existing ERP event policies serve other ERP screens. This dedicated reader
-- enforces Integração's calendar scope without changing those ERP policies.
CREATE FUNCTION erp_collab_private.integracao_eventos() RETURNS SETOF public.erp_eventos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND ativo) THEN
  RAISE EXCEPTION 'Sessão inválida' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT e.* FROM public.erp_eventos e
 WHERE erp_collab_private.integracao_gestor_calendario() OR e.agenda_id IS NOT NULL
 OR e.created_by=auth.uid() OR auth.uid()=ANY(e.participantes);
END $$;
REVOKE ALL ON FUNCTION erp_collab_private.integracao_eventos() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_collab_private.integracao_eventos() TO authenticated;
CREATE FUNCTION public.integracao_eventos() RETURNS SETOF public.erp_eventos
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM erp_collab_private.integracao_eventos();
$$;
REVOKE ALL ON FUNCTION public.integracao_eventos() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_eventos() TO authenticated;

-- Only these two columns can be edited directly. The existing name/color checks
-- remain in force, and integracao_gravar supplies atomic optimistic concurrency.
GRANT UPDATE(nome,cor) ON public.erp_agendas TO authenticated;
CREATE POLICY integracao_gestores_editar_agenda ON public.erp_agendas FOR UPDATE TO authenticated
USING(erp_collab_private.integracao_gestor_calendario())
WITH CHECK(erp_collab_private.integracao_gestor_calendario());
