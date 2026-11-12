-- Reviewed rollback: disable the new channel, never delete its evidence or local queues.
begin;
update integracao_suporte_privado.config set habilitado=false;
with encerradas as (
 update integracao_suporte_privado.solicitacoes set estado=case when estado='iniciada' then 'resultado_incerto' else 'cancelada' end,concluido_em=clock_timestamp()
 where estado in ('criada','recebida','iniciada') returning id,estado
)
insert into integracao_suporte_privado.auditoria(solicitacao_id,ator,evento,motivo)
 select id,auth.uid(),estado,'SUPORTE_DESATIVADO' from encerradas;
revoke execute on function public.integracao_suporte_operar(text,jsonb) from authenticated,anon,public,service_role;
revoke execute on function integracao_suporte_privado.operar(text,jsonb) from authenticated,anon,public,service_role;
commit;
