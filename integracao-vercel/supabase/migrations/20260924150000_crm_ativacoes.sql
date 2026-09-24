-- Clientes ativados: registro permanente de quem levou cada cliente à etapa "Cliente ativo".
-- O funil deixa de exibir clientes ativos; o desempenho comercial passa a ser consultado por este registro.
begin;
create table public.integracao_crm_ativacoes (
 card_id uuid primary key references public.integracao_crm_cards(id),
 cliente_id uuid references public.fin_receb_clientes(id),
 nome text not null,
 cidade text,
 valor numeric(14,2),
 responsavel_id uuid references public.profiles(id),
 comerciais_adicionais uuid[] not null default '{}',
 ativado_em timestamptz not null,
 ativado_por uuid references public.profiles(id),
 desfeito_em timestamptz,
 origem text not null default 'registro' check(origem in ('registro','historico','estimado'))
);
create index crm_ativacoes_periodo on public.integracao_crm_ativacoes(ativado_em) where desfeito_em is null;
create index crm_ativacoes_responsavel on public.integracao_crm_ativacoes(responsavel_id,ativado_em);
alter table public.integracao_crm_ativacoes enable row level security;
revoke all on public.integracao_crm_ativacoes from public,anon,authenticated;
grant select on public.integracao_crm_ativacoes to authenticated;
grant all on public.integracao_crm_ativacoes to service_role;
-- Diretoria vê todos; cada comercial vê os clientes que ativou ou compartilhava.
create policy ativacoes_ler on public.integracao_crm_ativacoes for select to authenticated using(
 (select integracao_crm_privado.permite('admin')) or ((select integracao_crm_privado.permite('crm')) and (responsavel_id=(select auth.uid()) or (select auth.uid())=any(comerciais_adicionais))));

create function integracao_crm_privado.registrar_ativacao() returns trigger language plpgsql security definer set search_path='' as $$
declare v_nome text; v_cidade text;begin
 if new.status='Cliente ativo' and (tg_op='INSERT' or old.status is distinct from 'Cliente ativo') then
  select f.nome,m.nome||coalesce(' / '||m.uf,'') into v_nome,v_cidade from public.fin_receb_clientes f left join public.fin_receb_municipios m on m.id=f.municipio_id where f.id=new.cliente_id;
  if v_cidade is null then select m.nome||coalesce(' / '||m.uf,'') into v_cidade from public.fin_receb_municipios m where m.id=new.lead_municipio_id;end if;
  insert into public.integracao_crm_ativacoes(card_id,cliente_id,nome,cidade,valor,responsavel_id,comerciais_adicionais,ativado_em,ativado_por,desfeito_em,origem)
  values(new.id,new.cliente_id,coalesce(nullif(trim(v_nome),''),nullif(trim(new.lead_nome),''),'Cliente'),coalesce(v_cidade,new.lead_cidade),new.valor_total,new.responsavel_id,new.comerciais_adicionais,clock_timestamp(),auth.uid(),null,'registro')
  on conflict(card_id) do update set cliente_id=excluded.cliente_id,nome=excluded.nome,cidade=excluded.cidade,valor=excluded.valor,responsavel_id=excluded.responsavel_id,comerciais_adicionais=excluded.comerciais_adicionais,ativado_em=excluded.ativado_em,ativado_por=excluded.ativado_por,desfeito_em=null,origem='registro';
 elsif tg_op='UPDATE' and old.status='Cliente ativo' and new.status is distinct from 'Cliente ativo' then
  -- Ativação desfeita: o registro permanece para consulta, mas deixa de contar no desempenho.
  update public.integracao_crm_ativacoes set desfeito_em=clock_timestamp() where card_id=new.id and desfeito_em is null;
 elsif tg_op='UPDATE' and new.status='Cliente ativo' and new.valor_total is distinct from old.valor_total then
  update public.integracao_crm_ativacoes set valor=new.valor_total where card_id=new.id;
 end if;
 return null;
end $$;
revoke all on function integracao_crm_privado.registrar_ativacao() from public,anon,authenticated;
create trigger registrar_ativacao after insert or update of status,valor_total on public.integracao_crm_cards for each row execute function integracao_crm_privado.registrar_ativacao();

-- Histórico anterior: usa a última entrada em "Cliente ativo" registrada na auditoria; sem auditoria, a data da última alteração do card.
insert into public.integracao_crm_ativacoes(card_id,cliente_id,nome,cidade,valor,responsavel_id,comerciais_adicionais,ativado_em,ativado_por,desfeito_em,origem)
select c.id,c.cliente_id,coalesce(nullif(trim(f.nome),''),nullif(trim(c.lead_nome),''),'Cliente'),coalesce(m.nome||coalesce(' / '||m.uf,''),c.lead_cidade),
 coalesce((a.atual->>'valor_total')::numeric,c.valor_total),coalesce((a.atual->>'responsavel_id')::uuid,c.responsavel_id),
 case when a.id is null or a.atual->'comerciais_adicionais' is null then c.comerciais_adicionais else array(select jsonb_array_elements_text(a.atual->'comerciais_adicionais'))::uuid[] end,
 coalesce(a.created_at,c.updated_at),a.autor_id,case when c.status<>'Cliente ativo' then clock_timestamp() end,case when a.id is null then 'estimado' else 'historico' end
from public.integracao_crm_cards c
left join lateral(select * from public.integracao_crm_auditoria x where x.tabela='integracao_crm_cards' and x.registro_id=c.id and x.atual->>'status'='Cliente ativo' and (x.acao='INSERT' or x.anterior->>'status' is distinct from 'Cliente ativo') order by x.created_at desc limit 1) a on true
left join public.fin_receb_clientes f on f.id=c.cliente_id
left join public.fin_receb_municipios m on m.id=coalesce(f.municipio_id,c.lead_municipio_id)
where c.status='Cliente ativo' or a.id is not null
on conflict(card_id) do nothing;

-- Relatório por período (datas no fuso de São Paulo). O nome e a cidade atuais do cadastro têm prioridade sobre o registro da ativação.
create function public.integracao_crm_relatorio_ativacoes(p_inicio date,p_fim date) returns table(card_id uuid,cliente_id uuid,nome text,cidade text,valor numeric,responsavel_id uuid,comerciais_adicionais uuid[],ativado_em timestamptz,origem text)
language plpgsql stable security invoker set search_path='' as $$begin
 if not integracao_crm_privado.permite('crm') then raise exception 'Sem permissão';end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>366 then raise exception 'Selecione um período de até 366 dias';end if;
 return query select a.card_id,a.cliente_id,coalesce(nullif(trim(f.nome),''),a.nome),coalesce(m.nome||coalesce(' / '||m.uf,''),a.cidade),a.valor,a.responsavel_id,a.comerciais_adicionais,a.ativado_em,a.origem
 from public.integracao_crm_ativacoes a left join public.fin_receb_clientes f on f.id=a.cliente_id left join public.fin_receb_municipios m on m.id=f.municipio_id
 where a.desfeito_em is null and a.ativado_em>=(p_inicio::timestamp at time zone 'America/Sao_Paulo') and a.ativado_em<((p_fim+1)::timestamp at time zone 'America/Sao_Paulo')
 order by a.ativado_em;
end $$;
revoke all on function public.integracao_crm_relatorio_ativacoes(date,date) from public,anon;
grant execute on function public.integracao_crm_relatorio_ativacoes(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
