-- Corrige a leitura automática das metas: toda transição comprovada para Cliente ativo conta.
-- Preserva os eventos, o responsável no momento da ativação e o período em São Paulo.
-- Não recompõe eventos sem evidência nem altera clientes, metas, políticas ou permissões.
begin;
create or replace function erp_collab_private.metas_vendas_painel() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare diretor boolean; resultado jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and ativo) then raise exception 'Entre com uma conta ativa' using errcode='42501';end if;
 diretor=erp_collab_private.integracao_diretoria();
 select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object(
 'realizado',coalesce(a.total,0),'sem_valor',coalesce(a.sem_valor,0),
 'por_usuario',case when diretor then coalesce(a.usuarios,'[]'::jsonb) else '[]'::jsonb end
 ) order by m.fim,m.titulo),'[]'::jsonb) into resultado
 from public.integracao_crm_metas m
 left join lateral (
 select sum(r.total) total,sum(r.sem_valor) sem_valor,jsonb_agg(jsonb_build_object('id',r.id,'nome',r.nome,'realizado',r.total) order by r.nome) usuarios
 from (select p.id,p.nome,case when m.unidade='quantidade' then count(a.card_id)::numeric else coalesce(sum(a.valor),0) end total,
 count(a.card_id) filter(where a.valor is null) sem_valor
 from unnest(m.participantes) u(id) join public.profiles p on p.id=u.id
 left join public.integracao_crm_ativacoes a on a.responsavel_id=p.id and a.desfeito_em is null and a.etapa_anterior in ('Cliente novo','Negociação','Contrato','Perdido')
 and a.ativado_em>=(m.inicio::timestamp at time zone 'America/Sao_Paulo')
 and a.ativado_em<((m.fim+1)::timestamp at time zone 'America/Sao_Paulo') and a.ativado_em<=now()
 group by p.id,p.nome) r
 ) a on true
 where diretor or auth.uid()=any(m.participantes);
 return resultado;
end $$;
notify pgrst,'reload schema';
commit;
