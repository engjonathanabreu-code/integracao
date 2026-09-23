begin;
create table public.integracao_crm_followups (
 id uuid primary key default gen_random_uuid(), card_id uuid not null references public.integracao_crm_cards(id),
 pedido_id uuid not null unique, criado_por uuid not null references public.profiles(id),
 criado_em timestamptz not null default clock_timestamp(), prazo_dias integer not null check(prazo_dias in (1,2,4)),
 previsto_em timestamptz not null, status text not null default 'pendente' check(status in ('pendente','feito','unificado')),
 concluido_em timestamptz, concluido_por uuid references public.profiles(id), resumo text,
 check(status<>'feito' or (concluido_em is not null and concluido_por is not null and resumo is not null and length(trim(resumo)) between 5 and 2000)),
 check(status<>'pendente' or (concluido_em is null and concluido_por is null and resumo is null))
);
create unique index crm_followup_pendente on public.integracao_crm_followups(card_id) where status='pendente';
create index crm_followup_historico on public.integracao_crm_followups(card_id,criado_em desc);
create index crm_followup_conclusao on public.integracao_crm_followups(concluido_por,concluido_em) where status='feito';
alter table public.integracao_crm_followups enable row level security;
revoke all on public.integracao_crm_followups from public,anon,authenticated;
grant select on public.integracao_crm_followups to authenticated;
grant all on public.integracao_crm_followups to service_role;
create policy followups_ler on public.integracao_crm_followups for select to authenticated using(integracao_crm_privado.card_permitido(card_id));

-- One locked operation completes the old follow-up and schedules its successor.
-- Browser clients cannot fabricate an author, deadline or completion timestamp.
create function integracao_crm_privado.followup(p_card uuid,p_pedido uuid,p_anterior uuid,p_dias integer,p_resumo text) returns uuid
language plpgsql security definer set search_path='' as $$
declare atual public.integracao_crm_followups; repetido public.integracao_crm_followups; novo uuid; instante timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or not integracao_crm_privado.card_permitido(p_card) then raise exception 'Sem permissão para este cliente';end if;
 perform 1 from public.integracao_crm_cards where id=p_card and origem<>'vinculado' for update;
 if not found or not integracao_crm_privado.card_permitido(p_card) then raise exception 'Cliente indisponível ou transferido';end if;
 if p_dias is null or p_dias not in (1,2,4) or p_pedido is null then raise exception 'Selecione um prazo de 1, 2 ou 4 dias';end if;
 select * into repetido from public.integracao_crm_followups where pedido_id=p_pedido;
 if found then
  if repetido.card_id<>p_card or repetido.criado_por<>auth.uid() then raise exception 'Pedido inválido';end if;
  return repetido.id;
 end if;
 select * into atual from public.integracao_crm_followups where card_id=p_card and status='pendente' for update;
 if atual.id is distinct from p_anterior then raise exception 'O FollowUp mudou. Atualize a ficha antes de registrar';end if;
 if atual.id is not null then
  if p_resumo is null or length(trim(p_resumo)) not between 5 and 2000 then raise exception 'Escreva um breve resumo, de 5 a 2000 caracteres, do que foi feito ou descoberto';end if;
  update public.integracao_crm_followups set status='feito',concluido_em=instante,concluido_por=auth.uid(),resumo=trim(p_resumo) where id=atual.id;
 elsif nullif(trim(p_resumo),'') is not null then raise exception 'Agende o primeiro FollowUp antes de registrar a conclusão';
 end if;
 insert into public.integracao_crm_followups(card_id,pedido_id,criado_por,criado_em,prazo_dias,previsto_em)
 values(p_card,p_pedido,auth.uid(),instante,p_dias,instante+make_interval(days=>p_dias)) returning id into novo;
 return novo;
end $$;
create function public.integracao_crm_followup(p_card uuid,p_pedido uuid,p_anterior uuid,p_dias integer,p_resumo text default '') returns uuid
language sql security invoker set search_path='' as $$select integracao_crm_privado.followup(p_card,p_pedido,p_anterior,p_dias,p_resumo)$$;
revoke all on function integracao_crm_privado.followup(uuid,uuid,uuid,integer,text),public.integracao_crm_followup(uuid,uuid,uuid,integer,text) from public,anon;
grant execute on function integracao_crm_privado.followup(uuid,uuid,uuid,integer,text),public.integracao_crm_followup(uuid,uuid,uuid,integer,text) to authenticated;
create trigger auditoria after insert or update on public.integracao_crm_followups for each row execute function integracao_crm_privado.auditar();
do $$begin if to_regprocedure('integracao_crm_privado.sinalizar_revisao()') is not null then
 create trigger integracao_revisao after insert or update or delete on public.integracao_crm_followups for each statement execute function integracao_crm_privado.sinalizar_revisao('crm');
end if;end $$;

-- Merge histories together with the existing identity reconciliation. Keep the
-- earliest open deadline; the other schedule is retained as explicitly unified.
create function integracao_crm_privado.unir_followups(origem uuid,destino uuid) returns void language plpgsql security invoker set search_path='' as $$
declare manter uuid;begin
 if origem=destino then return;end if;
 select id into manter from public.integracao_crm_followups where card_id in (origem,destino) and status='pendente' order by previsto_em,id limit 1;
 update public.integracao_crm_followups set status='unificado' where card_id in (origem,destino) and status='pendente' and id<>manter;
 update public.integracao_crm_followups set card_id=destino where card_id=origem;
end $$;
revoke all on function integracao_crm_privado.unir_followups(uuid,uuid) from public,anon,authenticated;
grant execute on function integracao_crm_privado.unir_followups(uuid,uuid) to service_role;
do $$declare definicao text; trecho text;begin
 definicao:=pg_get_functiondef('integracao_crm_privado.vincular(uuid,uuid)'::regprocedure);
 trecho:='update public.integracao_crm_tarefas set card_id=existente where card_id=card;';
 if position(trecho in definicao)=0 then raise exception 'Revisar integração do vínculo de FollowUp';end if;
 execute replace(definicao,trecho,trecho||' perform integracao_crm_privado.unir_followups(card,existente);');
 if to_regprocedure('public.integracao_crm_identificar(text,bigint,bigint,text,text,text)') is not null then
  definicao:=pg_get_functiondef('public.integracao_crm_identificar(text,bigint,bigint,text,text,text)'::regprocedure);
  trecho:='update public.integracao_crm_tarefas set card_id=existente where card_id=lead.id;';
  if position(trecho in definicao)=0 then raise exception 'Revisar reconciliação automática de FollowUp';end if;
  execute replace(definicao,trecho,trecho||' perform integracao_crm_privado.unir_followups(lead.id,existente);');
 end if;
end $$;

-- Preserve the actual Chatwoot sender, never the conversation assignee as author.
alter table public.integracao_crm_mensagens add column autor_chatwoot_id bigint,add column autor_tipo text,
 add column autor_usuario_id uuid references public.profiles(id),add column recebido_em timestamptz not null default clock_timestamp();
create index crm_mensagens_periodo on public.integracao_crm_mensagens(data,autor_usuario_id);
create index crm_auditoria_periodo on public.integracao_crm_auditoria(tabela,created_at);
-- Existing receiver remains responsible for contact identity and idempotent messages.
alter function public.integracao_crm_receber(jsonb) rename to integracao_crm_receber_base;
revoke all on function public.integracao_crm_receber_base(jsonb) from public,anon,authenticated;
create function public.integracao_crm_receber(evento jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare conversa uuid; autor_confirmado uuid;begin
 conversa:=public.integracao_crm_receber_base(evento);
 if nullif(evento->>'mensagem_id','') is not null and evento->>'autor_tipo' in ('user','contact','agent_bot') then
  if evento->>'autor_tipo'='user' then
   select usuario_id into autor_confirmado from public.integracao_crm_agentes where instalacao=evento->>'instalacao'
   and conta_id=(evento->>'conta_id')::bigint and agente_id=nullif(evento->>'autor_chatwoot_id','')::bigint;
  end if;
  update public.integracao_crm_mensagens set autor_chatwoot_id=nullif(evento->>'autor_chatwoot_id','')::bigint,autor_tipo=evento->>'autor_tipo',autor_usuario_id=autor_confirmado
  where conversa_id=conversa and mensagem_id=(evento->>'mensagem_id')::bigint;
 end if;
 return conversa;
end $$;
revoke all on function public.integracao_crm_receber(jsonb) from public,anon,authenticated;
grant execute on function public.integracao_crm_receber(jsonb),public.integracao_crm_receber_base(jsonb) to service_role;

create view public.integracao_crm_chatwoot_resumo with(security_invoker=true) as
select v.card_id,count(distinct v.id) conversas,count(m.id) mensagens,
 count(m.id) filter(where m.direcao in ('incoming','0') and not m.privada) recebidas,
 count(m.id) filter(where m.direcao in ('outgoing','1') and not m.privada) enviadas,
 count(m.id) filter(where m.direcao in ('outgoing','1') and not m.privada and m.autor_tipo='user') humanas,
 count(m.id) filter(where m.direcao in ('outgoing','1') and not m.privada and m.autor_tipo='agent_bot') automaticas,
 count(m.id) filter(where m.direcao in ('outgoing','1') and not m.privada and m.autor_tipo is null) sem_autoria,
 max(m.data) ultima_mensagem
from public.integracao_crm_conversas v left join public.integracao_crm_mensagens m on m.conversa_id=v.id group by v.card_id;
grant select on public.integracao_crm_chatwoot_resumo to authenticated;

create function public.integracao_crm_dashboard(p_inicio date,p_fim date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare inicio timestamptz; fim timestamptz; resultado jsonb;begin
 if not integracao_crm_privado.permite('admin') then raise exception 'Dashboard disponível somente à Diretoria';end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>366 then raise exception 'Selecione um período de até 366 dias';end if;
 inicio:=p_inicio::timestamp at time zone 'America/Sao_Paulo';fim:=(p_fim+1)::timestamp at time zone 'America/Sao_Paulo';
 with movimentos as (
  select a.registro_id,a.autor_id,a.atual->>'responsavel_id' responsavel,a.anterior->>'status' anterior,a.atual->>'status' atual
  from public.integracao_crm_auditoria a where a.tabela='integracao_crm_cards' and a.acao='UPDATE' and a.created_at>=inicio and a.created_at<fim
  and a.anterior->>'status' is distinct from a.atual->>'status'
 ), mensagens as (
  select m.*,v.card_id from public.integracao_crm_mensagens m join public.integracao_crm_conversas v on v.id=m.conversa_id where m.data>=inicio and m.data<fim
 ), agentes as (
 select p.id,p.nome,p.ativo,
 (select count(*) from public.integracao_crm_cards c where c.origem<>'vinculado' and (c.responsavel_id=p.id or p.id=any(c.comerciais_adicionais))) carteira,
 (select count(*) from movimentos x where x.autor_id=p.id) movimentacoes,
 (select count(distinct x.registro_id) from movimentos x where x.responsavel=p.id::text and x.atual in ('Contrato','Cliente ativo') and coalesce(x.anterior,'') not in ('Contrato','Cliente ativo')) conversoes,
 (select count(distinct x.registro_id) from movimentos x where x.responsavel=p.id::text and x.atual='Perdido') perdas,
 (select count(*) from public.integracao_crm_cards c where c.origem<>'vinculado' and (c.responsavel_id=p.id or p.id=any(c.comerciais_adicionais)) and not exists(select 1 from public.integracao_crm_followups f where f.card_id=c.id and f.status='pendente')) sem_followup,
 (select count(*) from public.integracao_crm_followups f join public.integracao_crm_cards c on c.id=f.card_id where f.status='pendente' and (c.responsavel_id=p.id or p.id=any(c.comerciais_adicionais))) pendentes,
 (select count(*) from public.integracao_crm_followups f join public.integracao_crm_cards c on c.id=f.card_id where f.status='pendente' and f.previsto_em<now() and (c.responsavel_id=p.id or p.id=any(c.comerciais_adicionais))) atrasados,
 (select count(*) from public.integracao_crm_followups f where f.status='feito' and f.concluido_por=p.id and f.concluido_em>=inicio and f.concluido_em<fim) followups_feitos,
 (select count(*) from public.integracao_crm_followups f where f.status='feito' and f.concluido_por=p.id and f.concluido_em>=inicio and f.concluido_em<fim and f.concluido_em<=f.previsto_em) no_prazo,
 (select round(avg(extract(epoch from(f.concluido_em-f.criado_em))/3600)::numeric,1) from public.integracao_crm_followups f where f.status='feito' and f.concluido_por=p.id and f.concluido_em>=inicio and f.concluido_em<fim) tempo_medio_horas,
 (select round(avg(greatest(0,extract(epoch from(f.concluido_em-f.previsto_em)))/3600)::numeric,1) from public.integracao_crm_followups f where f.status='feito' and f.concluido_por=p.id and f.concluido_em>=inicio and f.concluido_em<fim) atraso_medio_horas,
 (select count(distinct m.conversa_id) from mensagens m where m.autor_usuario_id=p.id and m.autor_tipo='user' and m.direcao in ('outgoing','1') and not m.privada) atendimentos_chatwoot,
 (select count(*) from mensagens m where m.autor_usuario_id=p.id and m.autor_tipo='user' and m.direcao in ('outgoing','1') and not m.privada) mensagens_enviadas,
 (select count(distinct m.conversa_id) from mensagens m join public.integracao_crm_cards c on c.id=m.card_id where c.responsavel_id=p.id or p.id=any(c.comerciais_adicionais)) conversas_carteira,
 (select count(*) from public.integracao_crm_atendimentos a where a.autor_id=p.id and a.data>=inicio and a.data<fim) atendimentos_manuais
 from public.profiles p where p.tipo='Comercial'
 ) select jsonb_build_object('agentes',coalesce((select jsonb_agg(to_jsonb(a) order by a.ativo desc,a.nome) from agentes a),'[]'::jsonb),
 'cobertura',jsonb_build_object('conversas',(select count(distinct conversa_id) from mensagens),'mensagens',(select count(*) from mensagens),
 'saidas_sem_autoria',(select count(*) from mensagens where direcao in ('outgoing','1') and not privada and autor_tipo is null),
 'humanas_sem_vinculo',(select count(*) from mensagens where direcao in ('outgoing','1') and not privada and autor_tipo='user' and autor_usuario_id is null),
 'automaticas',(select count(*) from mensagens where direcao in ('outgoing','1') and not privada and autor_tipo='agent_bot'),
 'ultima_mensagem',(select max(data) from public.integracao_crm_mensagens)),
 'movimentacoes',coalesce((select jsonb_agg(to_jsonb(t)) from (select a.created_at,a.autor_id,a.registro_id,a.anterior->>'status' anterior,a.atual->>'status' atual,c.lead_nome,f.nome
 from public.integracao_crm_auditoria a left join public.integracao_crm_cards c on c.id=a.registro_id left join public.fin_receb_clientes f on f.id=c.cliente_id
 where a.tabela='integracao_crm_cards' and a.acao='UPDATE' and a.created_at>=inicio and a.created_at<fim and a.anterior->>'status' is distinct from a.atual->>'status' order by a.created_at desc limit 100)t),'[]'::jsonb)) into resultado;
 return resultado;
end $$;
revoke all on function public.integracao_crm_dashboard(date,date) from public,anon;
grant execute on function public.integracao_crm_dashboard(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
