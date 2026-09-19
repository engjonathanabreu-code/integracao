begin;
alter table public.integracao_crm_cards add column origem_dados jsonb;
alter table public.integracao_crm_cards drop constraint integracao_crm_cards_status_check;
alter table public.integracao_crm_cards add constraint integracao_crm_cards_status_check check(status in ('Cliente novo','Negociação','Contrato','Cliente ativo','Perdido'));
create or replace view public.integracao_crm_funil with(security_invoker=true) as
 select c.id,c.cliente_id,c.responsavel_id,c.status,c.lead_nome,c.lead_telefone,c.lead_cidade,c.origem,c.origem_id,c.created_at,c.updated_at,
 f.nome,f.cpf_cnpj,f.codigo,f.municipio_id,f.remessa_id,m.nome municipio,r.nome remessa,e.dados->'requerente'->>'telefone' telefone,c.origem_dados
 from public.integracao_crm_cards c left join public.fin_receb_clientes f on f.id=c.cliente_id
 left join public.fin_receb_municipios m on m.id=f.municipio_id left join public.fin_receb_remessas r on r.id=f.remessa_id
 left join public.integracao_moradores e on e.referencia_id=f.id and e.colecao='processos';
commit;
