-- Reversão conservadora do módulo Observações dos documentos.
-- Retornar também o frontend à versão anterior. Manter tabelas, histórico e IDs:
-- as observações geradas após a publicação continuam disponíveis para recuperação.
begin;
revoke execute on function public.integracao_documentos_observacoes_operar(text,text,jsonb) from public,anon,authenticated;
revoke insert(id,processo_id,conteudo),update(conteudo,versao,excluido_em) on public.integracao_documentos_observacoes from authenticated;
notify pgrst,'reload schema';
commit;
