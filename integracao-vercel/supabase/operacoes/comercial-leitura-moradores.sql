-- O Comercial do Integração precisa consultar moradores além dos cards do CRM.
-- Mantém regras de escrita, demais perfis e RLS existentes.
CREATE POLICY integracao_comercial_moradores_ler ON public.fin_receb_clientes
FOR SELECT TO authenticated USING ((SELECT public.is_comercial()));
