begin;
create or replace function integracao_crm_privado.permite(modulo text) returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo and
 (p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos') or
 (modulo='crm' and p.tipo='Comercial') or (modulo='semanal' and p.tipo='Pós-protocolo') or
 (modulo='marketing' and p.tipo in ('Marketing','Pós-protocolo'))))
$$;
revoke all on function integracao_crm_privado.permite(text) from public;
grant execute on function integracao_crm_privado.permite(text) to authenticated,service_role;
commit;
