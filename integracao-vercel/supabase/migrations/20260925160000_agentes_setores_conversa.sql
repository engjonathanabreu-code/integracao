-- Two more director-only readers for the AI agents screen: the per-sector
-- dashboard shown on its home tab, and the andamentos the chat looks up when a
-- question names a núcleo or a município. Same rules as the first two: every
-- number is counted here, the director check runs against the caller's own
-- session, and nothing is written.

-- Which núcleos, metas and andamentos belong to each sector. The stage names
-- are the ERP kanban's; meta sectors are the names in meta_setores.
CREATE FUNCTION erp_collab_private.integracao_setor_mapa(p_setor text, OUT etapas text[], OUT setores_meta text[], OUT status_andamento text[])
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT
  CASE p_setor WHEN 'comercial' THEN ARRAY['Comercial','Coleta Documental','Análise Documental']
   WHEN 'topografia' THEN ARRAY['Topografia'] WHEN 'projeto' THEN ARRAY['Projetos']
   WHEN 'posprotocolo' THEN ARRAY['Protocolo','Andamento'] WHEN 'juridico' THEN ARRAY[]::text[] END,
  CASE p_setor WHEN 'comercial' THEN ARRAY['atendimentos','comercial'] WHEN 'topografia' THEN ARRAY['topografia']
   WHEN 'projeto' THEN ARRAY['projetos','projeto'] WHEN 'posprotocolo' THEN ARRAY['pós-protocolo','pos-protocolo']
   WHEN 'juridico' THEN ARRAY['jurídico','juridico'] END,
  CASE p_setor WHEN 'comercial' THEN ARRAY['Comercial','Documental'] WHEN 'topografia' THEN ARRAY['Topografia']
   WHEN 'projeto' THEN ARRAY['Projeto'] WHEN 'posprotocolo' THEN ARRAY['Protocolado','Correções para Prefeitura','Registro de Imóveis']
   WHEN 'juridico' THEN ARRAY[]::text[] END;
$$;
REVOKE ALL ON FUNCTION erp_collab_private.integracao_setor_mapa(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_collab_private.integracao_setor_mapa(text) TO authenticated;

-- Per-sector dashboard. 'geral' reads the whole operation (NULL arrays mean
-- "no filter") and adds one row per sector for the comparison chart. The metas
-- split into vencidas / vencem em 7 / no prazo / sem prazo adds up to the open
-- total, so the stacked bar on the screen never shows more than exists.
CREATE FUNCTION public.integracao_agente_setor(p_setor text DEFAULT 'geral', p_parado_dias integer DEFAULT 45, p_limite integer DEFAULT 12)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 setor text := CASE WHEN p_setor IN ('geral','comercial','topografia','projeto','posprotocolo','juridico') THEN p_setor END;
 parado integer := greatest(7, least(365, coalesce(p_parado_dias,45)));
 lim integer := greatest(5, least(40, coalesce(p_limite,12)));
 hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 mapa record;
 r jsonb;
BEGIN
 IF NOT erp_collab_private.integracao_diretoria() THEN
  RAISE EXCEPTION 'Painel disponível apenas para a diretoria' USING ERRCODE='42501';
 END IF;
 IF setor IS NULL THEN RAISE EXCEPTION 'Setor desconhecido' USING ERRCODE='22023'; END IF;
 SELECT * INTO mapa FROM erp_collab_private.integracao_setor_mapa(setor);

 WITH nucleos AS (
  SELECT k.*, (hoje - (k.etapa_iniciada_em AT TIME ZONE 'America/Sao_Paulo')::date) AS dias_etapa
  FROM public.processos_kanban k
  WHERE coalesce(k.ativo,true) AND NOT coalesce(k.excluido_erp,false) AND coalesce(k.etapa_atual,'') <> 'Concluído'
   AND (mapa.etapas IS NULL OR k.etapa_atual = ANY(mapa.etapas))
 ), metas AS (
  SELECT m.*, s.nome AS setor_nome,
   (SELECT coalesce(string_agg(p.nome,', ' ORDER BY p.nome),'sem responsável') FROM public.meta_responsaveis mr JOIN public.profiles p ON p.id=mr.usuario_id WHERE mr.meta_id=m.id) AS responsaveis
  FROM public.metas m LEFT JOIN public.meta_setores s ON s.id=m.setor_id
  WHERE mapa.setores_meta IS NULL OR lower(s.nome) = ANY(mapa.setores_meta)
 ), abertas AS (
  SELECT * FROM metas WHERE status NOT IN ('Concluído','Cancelado')
 ), andamentos AS (
  SELECT a.*, coalesce(a.data_atualizacao,(a.created_at AT TIME ZONE 'America/Sao_Paulo')::date) AS quando, k.nucleo, concat_ws('/',k.municipio,k.estado) AS municipio
  FROM public.processos_kanban_andamentos a JOIN public.processos_kanban k ON k.id=a.processo_id
  WHERE NOT coalesce(k.excluido_erp,false)
   AND (mapa.etapas IS NULL OR a.status = ANY(mapa.status_andamento) OR k.id IN (SELECT id FROM nucleos))
 )
 SELECT jsonb_build_object(
  'setor', setor,
  'hoje', hoje,
  'parado_dias', parado,
  'nucleos', jsonb_build_object(
   'total', (SELECT count(*) FROM nucleos),
   'por_etapa', (SELECT coalesce(jsonb_agg(jsonb_build_object('etapa',etapa,'total',total) ORDER BY total DESC, etapa),'[]'::jsonb)
     FROM (SELECT coalesce(etapa_atual,'Sem etapa') AS etapa, count(*) AS total FROM nucleos GROUP BY 1) t),
   'faixas', (SELECT jsonb_build_object(
     'ate_30', count(*) FILTER (WHERE dias_etapa IS NULL OR dias_etapa <= 30), 'de_31_a_60', count(*) FILTER (WHERE dias_etapa BETWEEN 31 AND 60),
     'de_61_a_90', count(*) FILTER (WHERE dias_etapa BETWEEN 61 AND 90), 'mais_de_90', count(*) FILTER (WHERE dias_etapa > 90)) FROM nucleos),
   'por_responsavel', (SELECT coalesce(jsonb_agg(jsonb_build_object('responsavel',nome,'total',total,'parados',parados) ORDER BY total DESC, nome),'[]'::jsonb) FROM (
     SELECT coalesce(p.nome,'Sem responsável') AS nome, count(*) AS total, count(*) FILTER (WHERE n.dias_etapa >= parado) AS parados
     FROM nucleos n LEFT JOIN public.profiles p ON p.id=n.responsavel_id GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 8) t),
   'parados', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'dias_na_etapa')::int DESC),'[]'::jsonb) FROM (
     SELECT jsonb_build_object('nucleo',n.nucleo,'municipio',concat_ws('/',n.municipio,n.estado),'etapa',n.etapa_atual,'dias_na_etapa',n.dias_etapa,
      'responsavel',(SELECT p.nome FROM public.profiles p WHERE p.id=n.responsavel_id),'pendencia',nullif(n.pendencia,'')) AS x
     FROM nucleos n WHERE n.dias_etapa >= parado ORDER BY n.dias_etapa DESC LIMIT lim) y)
  ),
  'metas', jsonb_build_object(
   'abertas', (SELECT count(*) FROM abertas),
   'vencidas', (SELECT count(*) FROM abertas WHERE prazo < hoje),
   'vencem_em_7', (SELECT count(*) FROM abertas WHERE prazo BETWEEN hoje AND hoje+7),
   'no_prazo', (SELECT count(*) FROM abertas WHERE prazo > hoje+7),
   'sem_prazo', (SELECT count(*) FROM abertas WHERE prazo IS NULL),
   'aguardando_aprovacao', (SELECT count(*) FROM abertas WHERE status='Aguardando aprovação'),
   'concluidas_30_dias', (SELECT count(*) FROM metas WHERE status='Concluído' AND prazo >= hoje-30),
   'por_responsavel', (SELECT coalesce(jsonb_agg(jsonb_build_object('responsavel',nome,'abertas',total,'vencidas',vencidas) ORDER BY vencidas DESC, total DESC, nome),'[]'::jsonb) FROM (
     SELECT coalesce(p.nome,'Sem responsável') AS nome, count(DISTINCT a.id) AS total, count(DISTINCT a.id) FILTER (WHERE a.prazo < hoje) AS vencidas
     FROM abertas a LEFT JOIN public.meta_responsaveis mr ON mr.meta_id=a.id LEFT JOIN public.profiles p ON p.id=mr.usuario_id
     GROUP BY 1 ORDER BY 3 DESC, 2 DESC, 1 LIMIT 8) t),
   'pendencias', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'prazo',prazo,'dias_atraso',CASE WHEN prazo < hoje THEN hoje-prazo END,
      'status',status,'setor',setor_nome,'responsaveis',responsaveis) ORDER BY (prazo IS NULL), prazo, titulo),'[]'::jsonb)
     FROM (SELECT * FROM abertas ORDER BY (prazo IS NULL), prazo, titulo LIMIT lim) q)
  ),
  'andamentos', jsonb_build_object(
   'ultimos_30_dias', (SELECT count(*) FROM andamentos WHERE quando > hoje-30),
   'por_semana', (SELECT coalesce(jsonb_agg(jsonb_build_object('semana',s.inicio,'total',
      (SELECT count(*) FROM andamentos a WHERE a.quando >= s.inicio AND a.quando < s.inicio+7)) ORDER BY s.inicio),'[]'::jsonb)
     FROM (SELECT (date_trunc('week',hoje)::date - 7*g) AS inicio FROM generate_series(0,7) g) s),
   'por_situacao', (SELECT coalesce(jsonb_agg(jsonb_build_object('situacao',situacao,'total',total) ORDER BY total DESC, situacao),'[]'::jsonb) FROM (
     SELECT coalesce(nullif(u.status_operacional,''),'Sem situação') AS situacao, count(*) AS total FROM (
      SELECT DISTINCT ON (processo_id) processo_id, status_operacional FROM andamentos ORDER BY processo_id, quando DESC, created_at DESC) u GROUP BY 1) t),
   'recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('nucleo',nucleo,'municipio',municipio,'etapa',status,'situacao',status_operacional,
      'data',quando,'observacao',left(nullif(observacao_interna,''),300)) ORDER BY quando DESC, created_at DESC),'[]'::jsonb)
     FROM (SELECT * FROM andamentos ORDER BY quando DESC, created_at DESC LIMIT lim) q)
  ),
  'setores', CASE WHEN setor='geral' THEN (SELECT jsonb_agg(jsonb_build_object('setor',s.id,
     'nucleos',(SELECT count(*) FROM nucleos n WHERE n.etapa_atual = ANY(m.etapas)),
     'metas_abertas',(SELECT count(*) FROM abertas a WHERE lower(a.setor_nome) = ANY(m.setores_meta)),
     'metas_vencidas',(SELECT count(*) FROM abertas a WHERE lower(a.setor_nome) = ANY(m.setores_meta) AND a.prazo < hoje)) ORDER BY s.ordem)
    FROM (VALUES ('comercial',1),('topografia',2),('projeto',3),('posprotocolo',4),('juridico',5)) s(id,ordem),
     LATERAL erp_collab_private.integracao_setor_mapa(s.id) m) END
 ) INTO r;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.integracao_agente_setor(text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_agente_setor(text,integer,integer) TO authenticated;

-- What the chat reads when a question names a núcleo or a município: the
-- matching núcleos with their latest andamentos, plus the most recent ones
-- across the operation for questions that name nothing. Matching is plain
-- text containment, accents and case ignored; a núcleo named together with its
-- município ranks first, so "NUI01 de Ibirama" does not pick another NUI01.
CREATE FUNCTION public.integracao_agente_andamentos(p_texto text, p_limite integer DEFAULT 8)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 lim integer := greatest(1, least(15, coalesce(p_limite,8)));
 hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 de text := 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
 para text := 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc';
 texto text := lower(translate(left(coalesce(p_texto,''),3000), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc'));
 r jsonb;
BEGIN
 IF NOT erp_collab_private.integracao_diretoria() THEN
  RAISE EXCEPTION 'Painel disponível apenas para a diretoria' USING ERRCODE='42501';
 END IF;

 WITH candidatos AS (
  SELECT k.*,
   (CASE WHEN length(trim(coalesce(k.nucleo,''))) >= 3 AND position(lower(translate(trim(k.nucleo),de,para)) IN texto) > 0 THEN 2 ELSE 0 END
    + CASE WHEN length(trim(coalesce(k.municipio,''))) >= 4 AND position(lower(translate(trim(k.municipio),de,para)) IN texto) > 0 THEN 1 ELSE 0 END) AS pontos
  FROM public.processos_kanban k
  WHERE coalesce(k.ativo,true) AND NOT coalesce(k.excluido_erp,false)
 ), achados AS (
  SELECT * FROM candidatos WHERE pontos > 0 ORDER BY pontos DESC, nucleo, municipio LIMIT lim
 )
 SELECT jsonb_build_object(
  'hoje', hoje,
  'encontrados', (SELECT coalesce(jsonb_agg(jsonb_build_object('nucleo',n.nucleo,'municipio',concat_ws('/',n.municipio,n.estado),
     'etapa',n.etapa_atual,'dias_na_etapa',hoje-(n.etapa_iniciada_em AT TIME ZONE 'America/Sao_Paulo')::date,
     'responsavel',(SELECT p.nome FROM public.profiles p WHERE p.id=n.responsavel_id),'pendencia',nullif(n.pendencia,''),
     'prioridade',nullif(n.prioridade,''),'sla_prazo',n.sla_prazo,
     'andamentos',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'data' DESC),'[]'::jsonb) FROM (
       SELECT jsonb_build_object('data',coalesce(a.data_atualizacao,(a.created_at AT TIME ZONE 'America/Sao_Paulo')::date),'etapa',a.status,
        'situacao',a.status_operacional,'observacao',left(nullif(a.observacao_interna,''),400)) AS x
       FROM public.processos_kanban_andamentos a WHERE a.processo_id=n.id
       ORDER BY coalesce(a.data_atualizacao,(a.created_at AT TIME ZONE 'America/Sao_Paulo')::date) DESC, a.created_at DESC LIMIT 6) z)
    ) ORDER BY n.pontos DESC, n.nucleo, n.municipio),'[]'::jsonb) FROM achados n),
  'recentes', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'data' DESC),'[]'::jsonb) FROM (
    SELECT jsonb_build_object('nucleo',k.nucleo,'municipio',concat_ws('/',k.municipio,k.estado),
     'data',coalesce(a.data_atualizacao,(a.created_at AT TIME ZONE 'America/Sao_Paulo')::date),'etapa',a.status,
     'situacao',a.status_operacional,'observacao',left(nullif(a.observacao_interna,''),300)) AS x
    FROM public.processos_kanban_andamentos a JOIN public.processos_kanban k ON k.id=a.processo_id
    WHERE NOT coalesce(k.excluido_erp,false)
    ORDER BY coalesce(a.data_atualizacao,(a.created_at AT TIME ZONE 'America/Sao_Paulo')::date) DESC, a.created_at DESC LIMIT 15) q)
 ) INTO r;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.integracao_agente_andamentos(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_agente_andamentos(text,integer) TO authenticated;
