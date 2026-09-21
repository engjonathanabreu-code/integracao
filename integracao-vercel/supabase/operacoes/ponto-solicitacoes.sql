begin;
create table public.integracao_ponto_solicitacoes (
 id uuid primary key, usuario_id uuid not null references public.profiles(id),dia date not null,
 batidas timestamptz[] not null, motivo text not null check(length(trim(motivo))>=5),
 assinatura text not null, anteriores jsonb not null,
 status text not null default 'pendente' check(status in ('pendente','aprovada','recusada','cancelada')),
 criado_em timestamptz not null default clock_timestamp(),
 decisor uuid references public.profiles(id),decidido_em timestamptz,motivo_decisao text,
 revisao_id uuid references public.integracao_ponto_revisoes(id)
);
create index on public.integracao_ponto_solicitacoes(usuario_id,dia);
create unique index ponto_pedido_pendente on public.integracao_ponto_solicitacoes(usuario_id,dia) where status='pendente';
alter table public.integracao_ponto_solicitacoes enable row level security;
revoke all on public.integracao_ponto_solicitacoes from public,anon,authenticated;
grant select on public.integracao_ponto_solicitacoes to authenticated;
create policy ponto_solicitacao_leitura on public.integracao_ponto_solicitacoes for select to authenticated
 using (integracao_crm_privado.permite('admin') or (usuario_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and ativo)));

create function integracao_crm_privado.ponto_solicitar(p_acao text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.integracao_ponto_solicitacoes; d date; b timestamptz[]; i integer; resumo jsonb; rid uuid; pedido uuid:=(p_dados->>'pedido')::uuid; aprovado boolean;
begin
 if u is null or not exists(select 1 from public.profiles where id=u and ativo) then raise exception 'Sessão ativa obrigatória';end if;
 if pedido is null then raise exception 'Identificador do pedido obrigatório';end if;
 if p_acao='solicitar_correcao' then
 if nullif(p_dados->>'usuario_id','') is not null and (p_dados->>'usuario_id')::uuid<>u then raise exception 'Solicite alterações somente na própria folha';end if;
 perform pg_advisory_xact_lock(hashtextextended('ponto:'||u::text,0));
 select * into r from public.integracao_ponto_solicitacoes where id=pedido;
 if found then if r.usuario_id<>u then raise exception 'Pedido inválido';end if;return to_jsonb(r);end if;
 d:=(p_dados->>'dia')::date;
 if d is null or d>=(clock_timestamp() at time zone 'America/Sao_Paulo')::date then raise exception 'Solicite correções de dias anteriores a hoje';end if;
 if not exists(select 1 from public.integracao_ponto_jornadas where usuario_id=u and vigencia<=d) then raise exception 'Não há jornada cadastrada para este dia';end if;
 b:=array(select jsonb_array_elements_text(p_dados->'batidas')::timestamptz);
 if jsonb_typeof(p_dados->'batidas') is distinct from 'array' or cardinality(b)%2<>0 or cardinality(b)>40 then raise exception 'Informe pares de entrada e saída';end if;
 for i in 1..cardinality(b) loop
 if b[i] is null or not isfinite(b[i]) or (b[i] at time zone 'America/Sao_Paulo')::date<>d or (i>1 and b[i]<=b[i-1]) then raise exception 'Batidas devem estar em ordem e dentro do dia';end if;
 end loop;
 resumo:=integracao_crm_privado.ponto_dia(u,d);
 if resumo->>'assinatura' is distinct from p_dados->>'assinatura' then raise exception 'As batidas mudaram. Atualize sua folha antes de solicitar';end if;
 if exists(select 1 from public.integracao_ponto_solicitacoes where usuario_id=u and dia=d and status='pendente') then raise exception 'Já existe uma solicitação pendente neste dia. Cancele-a antes de enviar outra';end if;
 insert into public.integracao_ponto_solicitacoes(id,usuario_id,dia,batidas,motivo,assinatura,anteriores)
 values(pedido,u,d,b,p_dados->>'motivo',resumo->>'assinatura',resumo->'batidas') returning * into r;
 return to_jsonb(r);
 elsif p_acao in ('decidir_correcao','cancelar_correcao') then
 select * into r from public.integracao_ponto_solicitacoes where id=pedido;
 if not found then raise exception 'Solicitação não encontrada';end if;
 if p_acao='cancelar_correcao' then
 if r.usuario_id<>u then raise exception 'Cancele somente suas solicitações';end if;
 else
 if not integracao_crm_privado.permite('admin') then raise exception 'Somente a Diretoria pode decidir solicitações';end if;
 if r.usuario_id=u then raise exception 'Sua solicitação precisa ser analisada por outro Diretor';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('ponto:'||r.usuario_id::text,0));
 select * into r from public.integracao_ponto_solicitacoes where id=pedido for update;
 if r.status<>'pendente' then return to_jsonb(r);end if;
 if p_acao='cancelar_correcao' then
 update public.integracao_ponto_solicitacoes set status='cancelada',decisor=u,decidido_em=clock_timestamp(),motivo_decisao='Cancelada pelo solicitante' where id=pedido returning * into r;
 return to_jsonb(r);
 end if;
 aprovado:=(p_dados->>'aprovada')::boolean;
 if aprovado is null or length(trim(coalesce(p_dados->>'motivo','')))<5 then raise exception 'Informe a decisão e uma justificativa de pelo menos cinco caracteres';end if;
 if aprovado then
 resumo:=integracao_crm_privado.ponto_dia(r.usuario_id,r.dia);
 if resumo->>'assinatura' is distinct from r.assinatura then raise exception 'As batidas mudaram após o pedido. Recuse esta solicitação e peça uma nova conferência';end if;
 insert into public.integracao_ponto_revisoes(usuario_id,dia,batidas,motivo,autor)
 values(r.usuario_id,r.dia,r.batidas,'Solicitação '||r.id::text||': '||r.motivo||' | Aprovação: '||(p_dados->>'motivo'),u) returning id into rid;
 end if;
 update public.integracao_ponto_solicitacoes set status=case when aprovado then 'aprovada' else 'recusada' end,decisor=u,decidido_em=clock_timestamp(),motivo_decisao=p_dados->>'motivo',revisao_id=rid where id=pedido returning * into r;
 return to_jsonb(r);
 else raise exception 'Ação inválida';end if;
end $$;
revoke all on function integracao_crm_privado.ponto_solicitar(text,jsonb) from public,anon;
grant execute on function integracao_crm_privado.ponto_solicitar(text,jsonb) to authenticated;
create or replace function public.integracao_ponto(p_acao text,p_dados jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$
select case when p_acao in ('solicitar_correcao','decidir_correcao','cancelar_correcao') then integracao_crm_privado.ponto_solicitar(p_acao,p_dados) else integracao_crm_privado.ponto_operar(p_acao,p_dados) end
$$;
do $$begin if to_regprocedure('integracao_crm_privado.sinalizar_revisao()') is not null then
create trigger integracao_revisao after insert or update or delete on public.integracao_ponto_solicitacoes for each statement execute function integracao_crm_privado.sinalizar_revisao('ponto');
end if;end $$;
notify pgrst,'reload schema';
commit;
