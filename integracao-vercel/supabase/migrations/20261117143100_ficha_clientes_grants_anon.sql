begin;

-- Public access has no legitimate caller. Keep the deployed authenticated
-- contract for cadastro, CPF/CNPJ, financial fields and existing integrations.
revoke select on public.fin_receb_clientes from anon;

commit;
