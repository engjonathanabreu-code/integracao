-- Projeção somente leitura. Não altera eventos, reservas, aprovações ou RLS existentes.
-- Requer Financeiro Central de Solicitações já instalado. Aplicar separadamente do frontend.
begin;
set local lock_timeout = '5s';
create schema if not exists integracao_viagens_privado;
revoke all on schema integracao_viagens_privado from public,anon,authenticated;
grant usage on schema integracao_viagens_privado to authenticated;

create or replace function integracao_viagens_privado.data_civil(valor text)
returns date language plpgsql immutable security invoker set search_path='' as $$
declare resultado date;
begin
 if valor is null or valor !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
 begin resultado:=valor::date; exception when datetime_field_overflow or invalid_datetime_format then return null; end;
 if to_char(resultado,'YYYY-MM-DD')<>valor then return null; end if;
 return resultado;
end $$;
revoke all on function integracao_viagens_privado.data_civil(text) from public,anon,authenticated;

-- SECURITY DEFINER é deliberado: usuários do calendário não recebem acesso ao JSON
-- financeiro completo. Somente os campos de disponibilidade da agenda compartilhada
-- saem desta função, após validar conta ativa, nunca descrições, valores ou destinos.
create or replace function integracao_viagens_privado.listar()
returns table(id text,solicitacao_id text,veiculo_id text,solicitante_id uuid,
 solicitante_nome text,inicio date,fim date,status text)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(erp_collab_private.active_user(),false) then
  raise exception using errcode='42501',message='Sessão ativa obrigatória.';
 end if;
 return query
 with pedidos as materialized (
  select r,count(*) over(partition by r->>'id') quantidade,
   count(*) over(partition by r->>'convertedId') conversoes
  from public.financeiro_estado_modulos m
  cross join lateral jsonb_array_elements(case when jsonb_typeof(m.dados)='array' then m.dados else '[]'::jsonb end) r
  where m.chave='invoiceRequests'
 ), viagens as materialized (
  select t,count(*) over(partition by t->>'id') quantidade,
   count(*) over(partition by t->>'invoiceRequestId') solicitacoes
  from public.financeiro_estado_modulos m
  cross join lateral jsonb_array_elements(case when jsonb_typeof(m.dados)='array' then m.dados else '[]'::jsonb end) t
  where m.chave='trips'
 ), elegiveis as (
  select p.r,v.t,perfil.id perfil_id,perfil.nome perfil_nome,
   integracao_viagens_privado.data_civil(case when nullif(v.t->>'start','') is null and nullif(v.t->>'end','') is null then p.r->>'neededAt' else v.t->>'start' end) inicio_dia,
   integracao_viagens_privado.data_civil(case when nullif(v.t->>'start','') is null and nullif(v.t->>'end','') is null then p.r->>'neededAt' else v.t->>'end' end) fim_dia
  from pedidos p
  join viagens v on v.t->>'id'=p.r->>'convertedId' and v.t->>'invoiceRequestId'=p.r->>'id'
  join public.profiles perfil on perfil.id::text=p.r->>'requesterId'
  join public.financeiro_veiculos carro on carro.id=p.r->>'vehicleId'
  left join financeiro_solicitacoes_privado.estado e on e.solicitacao_id=p.r->>'id'
  where p.quantidade=1 and p.conversoes=1 and v.quantidade=1 and v.solicitacoes=1
   and nullif(p.r->>'id','') is not null and p.r->>'category'='trip'
   and p.r->>'status'='Aprovada' and coalesce(e.situacao,p.r->>'status')='Aprovada'
   and nullif(p.r->>'reviewedAt','') is not null and e.excluida_em is null
   and p.r->>'vehicleId' in ('gol','hb20')
   and (nullif(v.t->>'vehicleId','') is null or v.t->>'vehicleId'=p.r->>'vehicleId')
   and v.t->>'status' in ('Planejada','Em andamento','Aguardando prestação','Aprovada','Divergência','Concluída')
 )
 select 'financeiro:viagem:'||(e.r->>'id'),e.r->>'id',e.r->>'vehicleId',e.perfil_id,
  e.perfil_nome,e.inicio_dia,e.fim_dia,
  case when e.t->>'status'='Concluída' then 'concluido' else 'ativo' end
 from elegiveis e where e.inicio_dia is not null and e.fim_dia>=e.inicio_dia
 order by e.inicio_dia,e.r->>'id';
end $$;
revoke all on function integracao_viagens_privado.listar() from public,anon,authenticated;
grant execute on function integracao_viagens_privado.listar() to authenticated;

create or replace function public.integracao_viagens_financeiro()
returns table(id text,solicitacao_id text,veiculo_id text,solicitante_id uuid,
 solicitante_nome text,inicio date,fim date,status text)
language sql stable security invoker set search_path='' as $$
 select * from integracao_viagens_privado.listar();
$$;
revoke all on function public.integracao_viagens_financeiro() from public,anon,authenticated;
grant execute on function public.integracao_viagens_financeiro() to authenticated;
comment on function public.integracao_viagens_financeiro() is
 'Disponibilidade compartilhada dos veículos: datas civis inclusivas, vínculo canônico ao solicitante. Somente leitura; não é bloqueio de reservas. Financeiro é a fonte de alterações/cancelamentos.';
commit;
