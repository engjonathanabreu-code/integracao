begin;
-- Institutional deals are independent from residents, individual leads and client registrations.
create table public.integracao_crm_institucionais (
 id uuid primary key default gen_random_uuid(), nome text not null check(length(trim(nome)) between 2 and 200),
 contato text not null check(length(trim(contato)) between 2 and 500), produto text not null check(length(trim(produto)) between 2 and 500),
 valor numeric(14,2) not null check(valor>=0), responsavel_id uuid not null references public.profiles(id),
 status text not null default 'Em negociação' check(status in ('Em negociação','Ganho','Perdido')),
 motivo_perda text not null default '' check(length(motivo_perda)<=2000),
 versao integer not null default 1, criado_por uuid not null references public.profiles(id),
 criado_em timestamptz not null default clock_timestamp(), atualizado_em timestamptz not null default clock_timestamp(),
 check(status<>'Perdido' or length(trim(motivo_perda))>=5)
);
create index crm_institucionais_responsavel on public.integracao_crm_institucionais(responsavel_id,status);
alter table public.integracao_crm_institucionais enable row level security;
revoke all on public.integracao_crm_institucionais from public,anon,authenticated;
grant select on public.integracao_crm_institucionais to authenticated;
grant all on public.integracao_crm_institucionais to service_role;
create policy institucionais_ler on public.integracao_crm_institucionais for select to authenticated using(integracao_crm_privado.permite('crm') and (responsavel_id=(select auth.uid()) or integracao_crm_privado.permite('admin')));
create function integracao_crm_privado.institucional_permitido(card uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and integracao_crm_privado.permite('crm') and exists(select 1 from public.integracao_crm_institucionais where id=card and (responsavel_id=auth.uid() or integracao_crm_privado.permite('admin')))
$$;
revoke all on function integracao_crm_privado.institucional_permitido(uuid) from public,anon;
grant execute on function integracao_crm_privado.institucional_permitido(uuid) to authenticated;
create table public.integracao_crm_institucionais_followups (
 id uuid primary key default gen_random_uuid(), card_id uuid not null references public.integracao_crm_institucionais(id),
 pedido_id uuid not null unique, criado_por uuid not null references public.profiles(id),
 criado_em timestamptz not null default clock_timestamp(), prazo_dias integer not null check(prazo_dias in(1,2,4)),
 previsto_em timestamptz not null, status text not null default 'pendente' check(status in('pendente','feito','cancelado')),
 concluido_em timestamptz, concluido_por uuid references public.profiles(id), resumo text,
 check(status<>'feito' or (concluido_em is not null and concluido_por is not null and resumo is not null and length(trim(resumo)) between 5 and 2000)),
 check(status<>'pendente' or (concluido_em is null and concluido_por is null and resumo is null))
);
create unique index institucional_followup_pendente on public.integracao_crm_institucionais_followups(card_id) where status='pendente';
create index institucional_followup_historico on public.integracao_crm_institucionais_followups(card_id,criado_em desc);
alter table public.integracao_crm_institucionais_followups enable row level security;
revoke all on public.integracao_crm_institucionais_followups from public,anon,authenticated;
grant select on public.integracao_crm_institucionais_followups to authenticated;
grant all on public.integracao_crm_institucionais_followups to service_role;
create policy institucional_followups_ler on public.integracao_crm_institucionais_followups for select to authenticated using(integracao_crm_privado.institucional_permitido(card_id));

create function integracao_crm_privado.salvar_institucional(p_id uuid,p_versao integer,p_nome text,p_contato text,p_produto text,p_valor numeric,p_responsavel uuid,p_status text,p_motivo text,p_dias integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare atual public.integracao_crm_institucionais; instante timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or not integracao_crm_privado.permite('crm') then raise exception 'Sem permissão para clientes institucionais';end if;
 if p_id is null or p_versao is null or p_versao<0 then raise exception 'Registro inválido';end if;
 select * into atual from public.integracao_crm_institucionais where id=p_id for update;
 if p_versao=0 and atual.id is not null then raise exception 'Registro já salvo. Atualize a lista';end if;
 if p_versao>0 and (atual.id is null or not integracao_crm_privado.institucional_permitido(p_id)) then raise exception 'Registro indisponível ou sem permissão';end if;
 if p_versao>0 and atual.versao<>p_versao then raise exception 'O negócio foi alterado. Reabra a ficha antes de salvar';end if;
 if not integracao_crm_privado.permite('admin') and p_responsavel is distinct from auth.uid() then raise exception 'Somente a diretoria pode escolher outro responsável';end if;
 if not exists(select 1 from public.profiles where id=p_responsavel and ativo and tipo in('Comercial','Administrador','Diretor Técnico','Diretor de Projetos')) then raise exception 'Selecione um responsável ativo';end if;
 if p_nome is null or length(trim(p_nome)) not between 2 and 200 or p_contato is null or length(trim(p_contato)) not between 2 and 500 or p_produto is null or length(trim(p_produto)) not between 2 and 500 then raise exception 'Preencha nome, contato e produto';end if;
 if p_valor is null or p_valor<0 or p_valor>=1000000000000 or p_valor::text in('NaN','Infinity','-Infinity') then raise exception 'Informe um valor válido';end if;
 if p_status is null or p_status not in('Em negociação','Ganho','Perdido') then raise exception 'Selecione o status do negócio';end if;
 if p_motivo is null or length(trim(p_motivo))>2000 or (p_status='Perdido' and length(trim(p_motivo))<5) then raise exception 'Informe um breve motivo da perda, de 5 a 2000 caracteres';end if;
 if p_versao=0 then
  if p_status<>'Em negociação' or p_dias is null or p_dias not in(1,2,4) then raise exception 'Cadastre em negociação e selecione FollowUp de 1, 2 ou 4 dias';end if;
  insert into public.integracao_crm_institucionais(id,nome,contato,produto,valor,responsavel_id,status,motivo_perda,criado_por) values(p_id,trim(p_nome),trim(p_contato),trim(p_produto),p_valor,p_responsavel,p_status,trim(p_motivo),auth.uid());
  insert into public.integracao_crm_institucionais_followups(card_id,pedido_id,criado_por,criado_em,prazo_dias,previsto_em) values(p_id,gen_random_uuid(),auth.uid(),instante,p_dias,instante+make_interval(days=>p_dias));
 else
  update public.integracao_crm_institucionais set nome=trim(p_nome),contato=trim(p_contato),produto=trim(p_produto),valor=p_valor,responsavel_id=p_responsavel,status=p_status,motivo_perda=trim(p_motivo),versao=versao+1,atualizado_em=instante where id=p_id;
  if p_status<>'Em negociação' then update public.integracao_crm_institucionais_followups set status='cancelado' where card_id=p_id and status='pendente';end if;
 end if;
 return p_id;
end $$;
create function public.integracao_crm_salvar_institucional(p_id uuid,p_versao integer,p_nome text,p_contato text,p_produto text,p_valor numeric,p_responsavel uuid,p_status text,p_motivo text,p_dias integer default null) returns uuid language sql security invoker set search_path='' as $$select integracao_crm_privado.salvar_institucional(p_id,p_versao,p_nome,p_contato,p_produto,p_valor,p_responsavel,p_status,p_motivo,p_dias)$$;
revoke all on function integracao_crm_privado.salvar_institucional(uuid,integer,text,text,text,numeric,uuid,text,text,integer),public.integracao_crm_salvar_institucional(uuid,integer,text,text,text,numeric,uuid,text,text,integer) from public,anon;
grant execute on function integracao_crm_privado.salvar_institucional(uuid,integer,text,text,text,numeric,uuid,text,text,integer),public.integracao_crm_salvar_institucional(uuid,integer,text,text,text,numeric,uuid,text,text,integer) to authenticated;

create function integracao_crm_privado.institucional_followup(p_card uuid,p_pedido uuid,p_anterior uuid,p_dias integer,p_resumo text) returns uuid
language plpgsql security definer set search_path='' as $$
declare atual public.integracao_crm_institucionais_followups; repetido public.integracao_crm_institucionais_followups; novo uuid; instante timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or not integracao_crm_privado.institucional_permitido(p_card) then raise exception 'Sem permissão para este cliente';end if;
 perform 1 from public.integracao_crm_institucionais where id=p_card and status='Em negociação' for update;
 if not found or not integracao_crm_privado.institucional_permitido(p_card) then raise exception 'Cliente indisponível ou transferido';end if;
 if p_dias is null or p_dias not in (1,2,4) or p_pedido is null then raise exception 'Selecione um prazo de 1, 2 ou 4 dias';end if;
 select * into repetido from public.integracao_crm_institucionais_followups where pedido_id=p_pedido;
 if found then
  if repetido.card_id<>p_card or repetido.criado_por<>auth.uid() then raise exception 'Pedido inválido';end if;
  return repetido.id;
 end if;
 select * into atual from public.integracao_crm_institucionais_followups where card_id=p_card and status='pendente' for update;
 if atual.id is distinct from p_anterior then raise exception 'O FollowUp mudou. Atualize a ficha antes de registrar';end if;
 if atual.id is not null then
  if p_resumo is null or length(trim(p_resumo)) not between 5 and 2000 then raise exception 'Escreva um breve resumo, de 5 a 2000 caracteres, do que foi feito ou descoberto';end if;
  update public.integracao_crm_institucionais_followups set status='feito',concluido_em=instante,concluido_por=auth.uid(),resumo=trim(p_resumo) where id=atual.id;
 elsif nullif(trim(p_resumo),'') is not null then raise exception 'Agende o primeiro FollowUp antes de registrar a conclusão';
 end if;
 insert into public.integracao_crm_institucionais_followups(card_id,pedido_id,criado_por,criado_em,prazo_dias,previsto_em)
 values(p_card,p_pedido,auth.uid(),instante,p_dias,instante+make_interval(days=>p_dias)) returning id into novo;
 return novo;
end $$;
create function public.integracao_crm_institucional_followup(p_card uuid,p_pedido uuid,p_anterior uuid,p_dias integer,p_resumo text default '') returns uuid
language sql security invoker set search_path='' as $$select integracao_crm_privado.institucional_followup(p_card,p_pedido,p_anterior,p_dias,p_resumo)$$;
revoke all on function integracao_crm_privado.institucional_followup(uuid,uuid,uuid,integer,text),public.integracao_crm_institucional_followup(uuid,uuid,uuid,integer,text) from public,anon;
grant execute on function integracao_crm_privado.institucional_followup(uuid,uuid,uuid,integer,text),public.integracao_crm_institucional_followup(uuid,uuid,uuid,integer,text) to authenticated;

do $$declare t text;begin
 foreach t in array array['integracao_crm_institucionais','integracao_crm_institucionais_followups'] loop
  execute format('create trigger auditoria after insert or update on public.%I for each row execute function integracao_crm_privado.auditar()',t);
  if to_regprocedure('integracao_crm_privado.sinalizar_revisao()') is not null then
   execute format('create trigger integracao_revisao after insert or update or delete on public.%I for each statement execute function integracao_crm_privado.sinalizar_revisao(''crm'')',t);
  end if;
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
