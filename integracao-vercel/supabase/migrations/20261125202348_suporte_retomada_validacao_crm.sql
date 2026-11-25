-- New command is disabled by default. No business data or existing commands are changed.
alter table integracao_suporte_privado.config
 add column retomada_crm boolean not null default false,
 add column retomada_crm_alvo uuid references public.profiles(id);
alter table integracao_suporte_privado.solicitacoes add column revisao text;
alter table integracao_suporte_privado.solicitacoes drop constraint solicitacoes_tipo_check;
alter table integracao_suporte_privado.solicitacoes add constraint solicitacoes_tipo_check
 check(tipo in ('diagnostico','consultar_recibo','retomar_automaticas','reler_confirmacao','solicitar_atualizacao','revisar_bloqueios','retomar_validacao_crm'));
alter table integracao_suporte_privado.solicitacoes add constraint suporte_retomada_crm_escopo
 check(case when tipo='retomar_validacao_crm' then pedido is not null and revisao is not null and revisao ~ '^[a-f0-9]{64}$' else revisao is null end);
create unique index suporte_retomada_crm_uma_tentativa
 on integracao_suporte_privado.solicitacoes(usuario_id,instalacao_id,pedido,revisao)
 where tipo='retomar_validacao_crm';

-- Patch only the exact support protocol anchors and fail on version drift.
do $patch$
declare original text; novo text; anterior text; alvo text; substituto text; r record;
begin
 select pg_get_functiondef('integracao_suporte_privado.operar(text,jsonb)'::regprocedure) into original;
 novo:=original;
 for r in select * from (values
   ($a$pedido_id uuid;consumidor_id uuid;$a$,$b$pedido_id uuid;consumidor_id uuid;revisao_arg text;$b$),
   ($a$'id','atendimento','usuario_id','instalacao_id','tipo','pedido'$a$,$b$'id','atendimento','usuario_id','instalacao_id','tipo','pedido','revisao'$b$),
   ($a$'solicitar_atualizacao','revisar_bloqueios')$a$,$b$'solicitar_atualizacao','revisar_bloqueios','retomar_validacao_crm')$b$),
   ($a$or (tipo_acao in ('consultar_recibo','reler_confirmacao') and pedido_id is null)$a$,$b$or (tipo_acao in ('consultar_recibo','reler_confirmacao','retomar_validacao_crm') and pedido_id is null)$b$),
   ($a$  -- Serializes nonces and rate limits across different support tabs.$a$,$b$  if tipo_acao='retomar_validacao_crm' then
    revisao_arg:=args->>'revisao';
    if not c.retomada_crm or c.retomada_crm_alvo is distinct from alvo then raise exception 'Retomada de validação não autorizada' using errcode='42501';end if;
    if jsonb_typeof(args->'revisao') is distinct from 'string' or revisao_arg !~ '^[a-f0-9]{64}$' then raise exception 'Revisão de retomada inválida' using errcode='22023';end if;
    if not exists (select 1 from integracao_suporte_privado.dispositivos n where n.usuario_id=alvo and n.instalacao_id=instalacao and right(n.versao,5)='-crm1')
     then raise exception 'Aparelho incompatível com retomada de validação' using errcode='22023';end if;
    if exists (select 1 from public.integracao_pedidos p where p.usuario_id=alvo and p.pedido=pedido_id)
     then raise exception 'Pedido já possui recibo' using errcode='22023';end if;
   elsif args ? 'revisao' then raise exception 'Revisão não aceita para esta ação' using errcode='22023';end if;
  -- Serializes nonces and rate limits across different support tabs.$b$),
   ($a$s.pedido is distinct from pedido_id then$a$,$b$s.pedido is distinct from pedido_id or s.revisao is distinct from revisao_arg then$b$),
   ($a$tipo,pedido,expira_em)$a$,$b$tipo,pedido,revisao,expira_em)$b$),
   ($a$instalacao,tipo_acao,pedido_id,agora+$a$,$b$instalacao,tipo_acao,pedido_id,revisao_arg,agora+$b$),
   ($a$  if acao='validar_execucao' then$a$,$b$  if s.tipo='retomar_validacao_crm' and acao in ('validar_execucao','autorizar')
   and (not c.retomada_crm or c.retomada_crm_alvo is distinct from usuario
     or exists(select 1 from public.integracao_pedidos p where p.usuario_id=usuario and p.pedido=s.pedido))
    then return jsonb_build_object('autorizado',false);end if;
  if acao='validar_execucao' then$b$),
   ($a$to_jsonb(c)-array['id','operador']$a$,$b$to_jsonb(c)-array['id','operador','retomada_crm_alvo']$b$)
 ) v(a,b) loop
  anterior:=novo;alvo:=r.a;substituto:=r.b;
  if (length(anterior)-length(replace(anterior,alvo,'')))/length(alvo)<>1 then
   raise exception 'Versão incompatível do protocolo de suporte';
  end if;
  novo:=replace(anterior,alvo,substituto);
 end loop;
 execute novo;
end $patch$;
