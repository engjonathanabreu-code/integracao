-- Reversão conservadora após voltar a aplicação à versão anterior.
-- Mantém todos os modelos, revisões e documentos emitidos, inclusive os novos.
-- Não executar DROP/TRUNCATE/DELETE das tabelas desta evolução.
begin;
revoke execute on function public.integracao_termos_operar(text,jsonb),public.integracao_qualificacoes_nucleo(text,text,text[],integer,integer) from authenticated;
revoke insert on public.integracao_termos_modelos,public.integracao_termos_emissoes from authenticated;
notify pgrst,'reload schema';
commit;
