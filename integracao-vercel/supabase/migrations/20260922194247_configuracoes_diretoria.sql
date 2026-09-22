-- Alinha os perfis da Diretoria com a tela, sem alterar permissões de outras tabelas.
ALTER POLICY criar ON public.integracao_configuracoes WITH CHECK (
 criado_por=(select auth.uid()) AND public.integracao_acesso(referencia_tabela,referencia_id,criado_por)
 AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()
 OR EXISTS(SELECT 1 FROM public.profiles WHERE id=(select auth.uid()) AND ativo AND tipo IN ('Diretor Técnico','Diretor de Projetos')))
);
ALTER POLICY editar ON public.integracao_configuracoes USING (
 public.integracao_acesso(referencia_tabela,referencia_id,criado_por)
 AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()
 OR EXISTS(SELECT 1 FROM public.profiles WHERE id=(select auth.uid()) AND ativo AND tipo IN ('Diretor Técnico','Diretor de Projetos')))
) WITH CHECK (
 public.integracao_acesso(referencia_tabela,referencia_id,criado_por)
 AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()
 OR EXISTS(SELECT 1 FROM public.profiles WHERE id=(select auth.uid()) AND ativo AND tipo IN ('Diretor Técnico','Diretor de Projetos')))
);
ALTER POLICY remover ON public.integracao_configuracoes USING (
 public.integracao_acesso(referencia_tabela,referencia_id,criado_por)
 AND (referencia_tabela IS DISTINCT FROM 'integracao_config' OR public.can_manage_core()
 OR EXISTS(SELECT 1 FROM public.profiles WHERE id=(select auth.uid()) AND ativo AND tipo IN ('Diretor Técnico','Diretor de Projetos')))
);
