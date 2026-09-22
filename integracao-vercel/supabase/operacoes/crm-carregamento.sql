-- Reuse the existing resident join; keep caller RLS and existing columns.
create or replace view public.integracao_crm_funil with (security_invoker=true) as
 SELECT c.id,
    c.cliente_id,
    c.responsavel_id,
    c.status,
    c.lead_nome,
    c.lead_telefone,
    c.lead_cidade,
    c.origem,
    c.origem_id,
    c.created_at,
    c.updated_at,
    f.nome,
    f.cpf_cnpj,
    f.codigo,
    COALESCE(f.municipio_id, c.lead_municipio_id) AS municipio_id,
    f.remessa_id,
    m.nome AS municipio,
    r.nome AS remessa,
    (e.dados -> 'requerente'::text) ->> 'telefone'::text AS telefone,
    c.origem_dados,
    c.valor_total,
    c.forma_negociacao,
    c.parcelas,
    c.desconto_percentual,
    c.entrada_percentual,
    c.lead_municipio_id,
    e.dados ->> 'nucleoId'::text AS nucleo_id
   FROM integracao_crm_cards c
     LEFT JOIN fin_receb_clientes f ON f.id = c.cliente_id
     LEFT JOIN fin_receb_municipios m ON m.id = COALESCE(f.municipio_id, c.lead_municipio_id)
     LEFT JOIN fin_receb_remessas r ON r.id = f.remessa_id
     LEFT JOIN integracao_moradores e ON e.referencia_id = f.id AND e.colecao = 'processos'::text;
