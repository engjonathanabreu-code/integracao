-- Rollback operacional conservador: pausa novas versões, preservando leitura e histórico.
-- Executar somente com autorização; não apagar tabelas/arquivos nem restaurar escrita destrutiva.
begin;
create or replace function integracao_crm_privado.oficio_operar(p_acao text,p_dados jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and ativo) then raise exception 'Sessão ativa obrigatória';end if;
 if not integracao_crm_privado.pode_editar_oficios() then raise exception 'Sem permissão para cadastrar ofícios';end if;
 if p_acao='registrar' then return integracao_crm_privado.oficio_registrar_v1(p_acao,p_dados);end if;
 raise exception 'Atualizações de ofícios temporariamente pausadas. O histórico está preservado';
end $$;
notify pgrst,'reload schema';
commit;
