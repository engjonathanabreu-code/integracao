begin;
alter table public.fin_receb_parcelas add column if not exists juros numeric(14,2) not null default 0 check(juros>=0), add column if not exists multa numeric(14,2) not null default 0 check(multa>=0), add column if not exists linha_digitavel text, add column if not exists tipo text not null default 'Parcela' check(tipo in ('Parcela','Entrada')), add column if not exists versao bigint not null default 1;
create schema if not exists integracao_financeiro_privado;
revoke all on schema integracao_financeiro_privado from public,anon;
grant usage on schema integracao_financeiro_privado to authenticated;
create function integracao_financeiro_privado.operar() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=(select auth.uid()) and ativo and (tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Financeiro') or lower(trim(setor))='financeiro'))$$;
revoke all on function integracao_financeiro_privado.operar() from public,anon;
grant execute on function integracao_financeiro_privado.operar() to authenticated;
create table integracao_financeiro_privado.auditoria(id bigint generated always as identity primary key,parcela_id uuid not null,autor uuid,antes jsonb,depois jsonb,criado_em timestamptz not null default now());
create function integracao_financeiro_privado.versionar() returns trigger language plpgsql security definer set search_path='' as $$begin new.versao=old.versao+1;insert into integracao_financeiro_privado.auditoria(parcela_id,autor,antes,depois) values(new.id,auth.uid(),to_jsonb(old),to_jsonb(new));return new;end$$;
revoke all on function integracao_financeiro_privado.versionar() from public,anon,authenticated;
create trigger integracao_financeiro_versao before update on public.fin_receb_parcelas for each row execute function integracao_financeiro_privado.versionar();
-- Read-only financial consultation for every active Integração profile.
do $$declare t text;begin foreach t in array array['fin_receb_municipios','fin_receb_remessas','fin_receb_clientes','fin_receb_parcelas'] loop execute format('create policy integracao_financeiro_consulta on public.%I for select to authenticated using (exists(select 1 from public.profiles where id=(select auth.uid()) and ativo))',t);end loop;end$$;
create policy integracao_financeiro_operar on public.fin_receb_parcelas for all to authenticated using((select integracao_financeiro_privado.operar())) with check((select integracao_financeiro_privado.operar()));
create policy integracao_financeiro_importar on public.fin_receb_importacoes for all to authenticated using((select integracao_financeiro_privado.operar())) with check((select integracao_financeiro_privado.operar()));
create function public.integracao_financeiro_editar(p_id uuid,p_versao bigint,p_dados jsonb) returns public.fin_receb_parcelas language plpgsql security invoker set search_path='' as $$
declare atual public.fin_receb_parcelas; novo public.fin_receb_parcelas;k text;begin
if not integracao_financeiro_privado.operar() then raise exception 'Acesso financeiro somente para consulta';end if;
select * into atual from public.fin_receb_parcelas where id=p_id for update;
if not found or p_versao is null or atual.versao<>p_versao then raise exception 'Esta parcela mudou em outro sistema. Atualize e confira antes de salvar';end if;
for k in select jsonb_object_keys(p_dados) loop if k not in ('vencimento','valor_previsto','juros','multa','linha_digitavel','nosso_numero','documento','status','pago_em','valor_liquidado','tipo') then raise exception 'Campo financeiro inválido';end if;end loop;
novo=jsonb_populate_record(atual,p_dados);
if novo.valor_previsto is null or novo.valor_previsto<0 or novo.juros is null or novo.multa is null or novo.juros<0 or novo.multa<0 or novo.vencimento is null or coalesce(novo.valor_liquidado,0)<0 then raise exception 'Confira vencimento e valores';end if;
if novo.status in ('Pago','Parcial') and (novo.pago_em is null or novo.valor_liquidado is null) then raise exception 'Informe a data e o valor pago';end if;
if novo.status not in ('Pago','Parcial') then novo.pago_em=null;novo.valor_liquidado=0;end if;
update public.fin_receb_parcelas set vencimento=novo.vencimento,valor_previsto=novo.valor_previsto,juros=novo.juros,multa=novo.multa,linha_digitavel=nullif(novo.linha_digitavel,''),nosso_numero=novo.nosso_numero,documento=novo.documento,status=novo.status,pago_em=novo.pago_em,valor_liquidado=novo.valor_liquidado,diferenca=case when novo.status in ('Pago','Parcial') then novo.valor_liquidado-(novo.valor_previsto+novo.juros+novo.multa) else 0 end,tipo=novo.tipo where id=p_id returning * into atual;return atual;
end$$;
revoke all on function public.integracao_financeiro_editar(uuid,bigint,jsonb) from public,anon;
grant execute on function public.integracao_financeiro_editar(uuid,bigint,jsonb) to authenticated;
create function public.integracao_financeiro_importar(p_itens jsonb,p_arquivo text) returns integer language plpgsql security invoker set search_path='' as $$declare item jsonb;n integer:=0;begin
if not integracao_financeiro_privado.operar() then raise exception 'Sem permissão financeira';end if;
if p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 500 then raise exception 'Selecione de 1 a 500 parcelas';end if;
for item in select value from jsonb_array_elements(p_itens) order by value->>'id' loop perform public.integracao_financeiro_editar((item->>'id')::uuid,(item->>'versao')::bigint,item->'dados');n=n+1;end loop;
insert into public.fin_receb_importacoes(arquivo_nome,total_registros,conciliados,pendentes,created_by) values(left(p_arquivo,240),n,n,0,auth.uid());return n;
end$$;
revoke all on function public.integracao_financeiro_importar(jsonb,text) from public,anon;
grant execute on function public.integracao_financeiro_importar(jsonb,text) to authenticated;
insert into public.integracao_revisoes(modulo,versao) values('financeiro',1) on conflict do nothing;
create trigger integracao_financeiro_revisao after insert or update or delete on public.fin_receb_parcelas for each statement execute function integracao_crm_privado.sinalizar_revisao('financeiro');
create function public.integracao_contagens_clientes() returns table(municipio_id uuid,remessa_id uuid,total bigint,ativos bigint) language sql stable security invoker set search_path='' as $$select c.municipio_id,c.remessa_id,count(*),count(*) filter(where c.ativo) from public.fin_receb_clientes c group by c.municipio_id,c.remessa_id$$;
revoke all on function public.integracao_contagens_clientes() from public,anon;grant execute on function public.integracao_contagens_clientes() to authenticated;
create function public.integracao_financeiro_resumo(p_inicio date,p_fim date) returns table(municipio_id uuid,remessa_id uuid,nucleo_id text,clientes bigint,parcelas bigint,pagas bigint,previsto numeric,recebido numeric) language sql stable security invoker set search_path='' as $$
with pagos as (select cliente_id,count(*) parcelas,count(*) filter(where status='Pago') pagas,sum(valor_previsto+juros+multa) previsto,sum(coalesce(valor_liquidado,0)) recebido from public.fin_receb_parcelas where ativo and status<>'Cancelado' and vencimento>=p_inicio and vencimento<p_fim group by cliente_id)
select c.municipio_id,c.remessa_id,coalesce(e.nucleo_id,''),count(*),coalesce(sum(p.parcelas),0)::bigint,coalesce(sum(p.pagas),0)::bigint,coalesce(sum(p.previsto),0),coalesce(sum(p.recebido),0)
from public.fin_receb_clientes c left join pagos p on p.cliente_id=c.id left join lateral(select dados->>'nucleoId' nucleo_id from public.integracao_moradores where referencia_id=c.id and colecao='processos' order by registro_id limit 1)e on true where c.ativo group by c.municipio_id,c.remessa_id,coalesce(e.nucleo_id,'')$$;
revoke all on function public.integracao_financeiro_resumo(date,date) from public,anon;grant execute on function public.integracao_financeiro_resumo(date,date) to authenticated;
create index if not exists integracao_financeiro_cliente_idx on public.integracao_moradores(referencia_id,registro_id) where colecao='processos';
create table integracao_financeiro_privado.leituras(usuario_id uuid not null,dia date not null,quantidade integer not null,primary key(usuario_id,dia));
create function public.integracao_financeiro_reservar_ia() returns boolean language plpgsql security definer set search_path='' as $$declare n integer;begin
 if not integracao_financeiro_privado.operar() then raise exception 'Sem permissão';end if;
 insert into integracao_financeiro_privado.leituras values(auth.uid(),current_date,1) on conflict(usuario_id,dia) do update set quantidade=integracao_financeiro_privado.leituras.quantidade+1 where integracao_financeiro_privado.leituras.quantidade<20 returning quantidade into n;
 if n is null then raise exception 'Limite diário atingido';end if;return true;
end$$;
revoke all on function public.integracao_financeiro_reservar_ia() from public,anon;grant execute on function public.integracao_financeiro_reservar_ia() to authenticated;
revoke all on all tables in schema integracao_financeiro_privado from public,anon,authenticated;
alter table integracao_financeiro_privado.auditoria enable row level security;
alter table integracao_financeiro_privado.leituras enable row level security;
notify pgrst,'reload schema';
commit;
