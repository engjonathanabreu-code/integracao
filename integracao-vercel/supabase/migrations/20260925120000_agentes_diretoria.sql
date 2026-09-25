-- Two director-only readers for the AI agents: one technical, one commercial.
-- Every number is counted here, in SQL, so the agent never does arithmetic on
-- its own. Nothing is written: these functions only read what already exists.

CREATE FUNCTION erp_collab_private.integracao_diretoria() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND ativo
  AND tipo IN ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto'));
$$;
REVOKE ALL ON FUNCTION erp_collab_private.integracao_diretoria() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_collab_private.integracao_diretoria() TO authenticated;

-- Technical panorama. "Late" cannot come from sla_prazo alone, which the team
-- rarely fills, so the honest signal is time standing still: days in the current
-- stage and days since the last andamento. The coverage block says out loud how
-- much of the base supports each reading, so a gap is never read as good news.
CREATE FUNCTION public.integracao_agente_tecnico(p_parado_dias integer DEFAULT 45, p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 parado integer := greatest(7, least(365, coalesce(p_parado_dias,45)));
 lim integer := greatest(5, least(60, coalesce(p_limite,20)));
 hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 r jsonb;
BEGIN
 IF NOT erp_collab_private.integracao_diretoria() THEN
  RAISE EXCEPTION 'Painel disponível apenas para a diretoria' USING ERRCODE='42501';
 END IF;

 WITH nucleos AS (
  SELECT k.*, (hoje - (k.etapa_iniciada_em AT TIME ZONE 'America/Sao_Paulo')::date) AS dias_etapa,
   (SELECT max(coalesce(a.data_atualizacao,(a.created_at AT TIME ZONE 'America/Sao_Paulo')::date)) FROM public.processos_kanban_andamentos a WHERE a.processo_id=k.id) AS ultimo_andamento
  FROM public.processos_kanban k
  WHERE coalesce(k.ativo,true) AND NOT coalesce(k.excluido_erp,false) AND coalesce(k.etapa_atual,'') <> 'Concluído'
 ), ativos AS (SELECT * FROM nucleos)
 SELECT jsonb_build_object(
  'gerado_em', now(),
  'hoje', hoje,
  'parado_dias', parado,
  'nucleos', jsonb_build_object(
   'ativos', (SELECT count(*) FROM ativos),
   'por_etapa', (SELECT coalesce(jsonb_agg(jsonb_build_object('etapa',etapa,'total',total) ORDER BY total DESC),'[]'::jsonb)
     FROM (SELECT coalesce(etapa_atual,'Sem etapa') AS etapa, count(*) AS total FROM ativos GROUP BY 1) t),
   'parados_por_faixa', (SELECT jsonb_build_object(
     'mais_de_30', count(*) FILTER (WHERE dias_etapa >= 30), 'mais_de_60', count(*) FILTER (WHERE dias_etapa >= 60),
     'mais_de_90', count(*) FILTER (WHERE dias_etapa >= 90), 'mais_de_180', count(*) FILTER (WHERE dias_etapa >= 180)) FROM ativos),
   'parados', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'dias_na_etapa')::int DESC),'[]'::jsonb) FROM (
     SELECT jsonb_build_object('nucleo',n.nucleo,'municipio',concat_ws('/',n.municipio,n.estado),'etapa',n.etapa_atual,
      'dias_na_etapa',n.dias_etapa,'responsavel',(SELECT p.nome FROM public.profiles p WHERE p.id=n.responsavel_id),
      'pendencia',nullif(n.pendencia,''),'ultimo_andamento',n.ultimo_andamento,'prioridade',nullif(n.prioridade,'')) AS x
     FROM ativos n WHERE n.dias_etapa >= parado ORDER BY n.dias_etapa DESC LIMIT lim) y),
   'sla_vencido', (SELECT coalesce(jsonb_agg(jsonb_build_object('nucleo',n.nucleo,'municipio',concat_ws('/',n.municipio,n.estado),
      'etapa',n.etapa_atual,'prazo',n.sla_prazo,'dias_atraso',hoje-n.sla_prazo) ORDER BY n.sla_prazo),'[]'::jsonb)
     FROM ativos n WHERE n.sla_prazo IS NOT NULL AND n.sla_prazo < hoje)
  ),
  'andamentos', jsonb_build_object(
   'total', (SELECT count(*) FROM public.processos_kanban_andamentos),
   'por_operacional', (SELECT coalesce(jsonb_agg(jsonb_build_object('situacao',situacao,'total',total) ORDER BY total DESC),'[]'::jsonb)
     FROM (SELECT coalesce(nullif(a.status_operacional,''),'Sem situação') AS situacao, count(*) AS total
       FROM public.processos_kanban_andamentos a GROUP BY 1) t),
   'aguardando', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'dias')::int DESC),'[]'::jsonb) FROM (
     SELECT DISTINCT ON (a.processo_id) jsonb_build_object('nucleo',k.nucleo,'municipio',concat_ws('/',k.municipio,k.estado),
      'etapa',a.status,'situacao',a.status_operacional,'desde',coalesce(a.data_atualizacao,(a.created_at AT TIME ZONE 'America/Sao_Paulo')::date),
      'dias',hoje-coalesce(a.data_atualizacao,(a.created_at AT TIME ZONE 'America/Sao_Paulo')::date),
      'observacao',nullif(a.observacao_interna,'')) AS x
     FROM public.processos_kanban_andamentos a JOIN ativos k ON k.id=a.processo_id
     ORDER BY a.processo_id, coalesce(a.data_atualizacao,(a.created_at AT TIME ZONE 'America/Sao_Paulo')::date) DESC) z
     WHERE z.x->>'situacao' IN ('Aguardando Prefeitura','Aguardando Cartório','Aguardando cliente','Pausado') LIMIT lim)
  ),
  'metas', jsonb_build_object(
   'abertas', (SELECT count(*) FROM public.metas m WHERE m.status NOT IN ('Concluído','Cancelado')),
   'vencidas', (SELECT count(*) FROM public.metas m WHERE m.status NOT IN ('Concluído','Cancelado') AND m.prazo < hoje),
   'vencem_em_7', (SELECT count(*) FROM public.metas m WHERE m.status NOT IN ('Concluído','Cancelado') AND m.prazo BETWEEN hoje AND hoje+7),
   'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',m.titulo,'prazo',m.prazo,'dias_atraso',hoje-m.prazo,'status',m.status,
      'setor',(SELECT s.nome FROM public.meta_setores s WHERE s.id=m.setor_id),
      'responsaveis',(SELECT coalesce(string_agg(p.nome,', ' ORDER BY p.nome),'sem responsável') FROM public.meta_responsaveis mr JOIN public.profiles p ON p.id=mr.usuario_id WHERE mr.meta_id=m.id)
     ) ORDER BY m.prazo),'[]'::jsonb)
     FROM (SELECT * FROM public.metas m2 WHERE m2.status NOT IN ('Concluído','Cancelado') AND m2.prazo < hoje ORDER BY m2.prazo LIMIT lim) m)
  ),
  'planos', jsonb_build_object(
   'etapas_em_andamento', (SELECT count(*) FROM public.etapas_plano e WHERE e.status='Em andamento'),
   'etapas_vencidas', (SELECT coalesce(jsonb_agg(jsonb_build_object('plano',pl.titulo,'etapa',e.titulo,'prazo',e.prazo,'dias_atraso',hoje-e.prazo,
      'responsaveis',(SELECT coalesce(string_agg(p.nome,', ' ORDER BY p.nome),'sem responsável') FROM public.etapa_responsaveis er JOIN public.profiles p ON p.id=er.usuario_id WHERE er.etapa_id=e.id)
     ) ORDER BY e.prazo),'[]'::jsonb)
     FROM public.etapas_plano e JOIN public.planos_trabalho pl ON pl.id=e.plano_id
     WHERE e.status='Em andamento' AND e.prazo < hoje)
  ),
  'devolutivas', (SELECT jsonb_build_object(
    'total', count(*),
    'abertas', count(*) FILTER (WHERE m.status NOT IN ('Concluído','Cancelado')),
    'vencidas', count(*) FILTER (WHERE m.status NOT IN ('Concluído','Cancelado') AND (d.dados->'devolutiva'->>'prazo') < hoje::text),
    'sem_analise', count(*) FILTER (WHERE d.dados->'devolutiva'->'analiseIA'->'etapa1' IS NULL),
    'por_origem', (SELECT coalesce(jsonb_agg(jsonb_build_object('origem',origem,'total',total) ORDER BY total DESC),'[]'::jsonb)
      FROM (SELECT coalesce(nullif(d2.dados->'devolutiva'->>'origem',''),'Sem origem') AS origem, count(*) AS total
        FROM public.integracao_metas d2 WHERE d2.dados ? 'devolutiva' GROUP BY 1) o),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('meta',m2.titulo,'origem',d3.dados->'devolutiva'->>'origem',
        'chegada',d3.dados->'devolutiva'->>'chegada','prazo',d3.dados->'devolutiva'->>'prazo','status',m2.status,
        'itens',jsonb_array_length(coalesce(d3.dados->'devolutiva'->'analiseIA'->'etapa1'->'itens','[]'::jsonb))) ORDER BY d3.dados->'devolutiva'->>'prazo'),'[]'::jsonb)
      FROM public.integracao_metas d3 JOIN public.metas m2 ON m2.id=d3.referencia_id
      WHERE d3.dados ? 'devolutiva' AND m2.status NOT IN ('Concluído','Cancelado') LIMIT lim))
   FROM public.integracao_metas d LEFT JOIN public.metas m ON m.id=d.referencia_id WHERE d.dados ? 'devolutiva'),
  'falhas', jsonb_build_object(
   'por_categoria', (SELECT coalesce(jsonb_agg(jsonb_build_object('categoria',categoria,'total',total) ORDER BY total DESC),'[]'::jsonb)
     FROM (SELECT coalesce(nullif(item->>'categoria',''),'outro') AS categoria, count(*) AS total
       FROM public.integracao_metas d, LATERAL jsonb_array_elements(coalesce(d.dados->'devolutiva'->'analiseIA'->'etapa1'->'itens','[]'::jsonb)) item
       WHERE d.dados ? 'devolutiva' GROUP BY 1) c),
   'nao_corrigidos', (SELECT count(*) FROM public.integracao_metas d, LATERAL jsonb_array_elements(coalesce(d.dados->'devolutiva'->'analiseIA'->'etapa2'->'itens','[]'::jsonb)) item
     WHERE d.dados ? 'devolutiva' AND item->>'status'='nao_corrigido'),
   'pendencias', (SELECT coalesce(jsonb_agg(jsonb_build_object('descricao',left(pend->>'descricao',300),'o_que_fazer',left(pend->>'oQueFazer',300))),'[]'::jsonb)
     FROM (SELECT pend FROM public.integracao_metas d, LATERAL jsonb_array_elements(coalesce(d.dados->'devolutiva'->'analiseIA'->'etapa2'->'pendencias','[]'::jsonb)) pend
       WHERE d.dados ? 'devolutiva' LIMIT lim) q),
   'recusas_conclusao', (SELECT coalesce(jsonb_agg(jsonb_build_object('motivo',left(rec->>'motivo',300),'data',rec->>'data')),'[]'::jsonb)
     FROM (SELECT rec FROM public.integracao_metas d, LATERAL jsonb_array_elements(coalesce(d.dados->'recusasConclusao','[]'::jsonb)) rec
       WHERE d.dados ? 'recusasConclusao' LIMIT lim) q)
  ),
  'cobertura', jsonb_build_object(
   'nucleos_com_sla', (SELECT count(*) FROM ativos WHERE sla_prazo IS NOT NULL),
   'nucleos_sem_andamento', (SELECT count(*) FROM ativos n WHERE n.ultimo_andamento IS NULL),
   'nucleos_sem_responsavel', (SELECT count(*) FROM ativos WHERE responsavel_id IS NULL),
   'metas_sem_prazo', (SELECT count(*) FROM public.metas m WHERE m.status NOT IN ('Concluído','Cancelado') AND m.prazo IS NULL)
  )
 ) INTO r;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.integracao_agente_tecnico(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_agente_tecnico(integer,integer) TO authenticated;

-- Commercial panorama. Stage changes come from the audit log, which is the only
-- place a transition is dated, and the close rate is counted over closed
-- outcomes only, so an untouched pipeline never inflates it.
CREATE FUNCTION public.integracao_agente_comercial(p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL, p_parado_dias integer DEFAULT 14, p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 fim date := coalesce(p_fim,hoje);
 inicio date := coalesce(p_inicio,fim-89);
 parado integer := greatest(3, least(180, coalesce(p_parado_dias,14)));
 lim integer := greatest(5, least(60, coalesce(p_limite,20)));
 r jsonb;
BEGIN
 IF NOT erp_collab_private.integracao_diretoria() THEN
  RAISE EXCEPTION 'Painel disponível apenas para a diretoria' USING ERRCODE='42501';
 END IF;

 WITH cards AS (
  SELECT c.* FROM public.integracao_crm_cards c WHERE c.arquivado_em IS NULL
 ), desfechos AS (
  SELECT a.registro_id, a.autor_id, a.created_at, a.atual->>'status' AS para, a.anterior->>'status' AS de
  FROM public.integracao_crm_auditoria a
  WHERE a.tabela='integracao_crm_cards' AND a.acao='UPDATE'
   AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN inicio AND fim
   AND a.atual->>'status' IS DISTINCT FROM a.anterior->>'status'
 ), ganhos AS (
  SELECT DISTINCT registro_id FROM desfechos WHERE para IN ('Contrato','Cliente ativo') AND coalesce(de,'') NOT IN ('Contrato','Cliente ativo')
 ), perdas AS (
  SELECT DISTINCT registro_id FROM desfechos WHERE para='Perdido'
 ), ultima_msg AS (
  SELECT v.card_id, max(m.data) AS quando,
   (array_agg(m.direcao ORDER BY m.data DESC))[1] AS direcao
  FROM public.integracao_crm_conversas v JOIN public.integracao_crm_mensagens m ON m.conversa_id=v.id
  GROUP BY v.card_id
 ), movimento AS (
  SELECT c.id, greatest(c.updated_at, coalesce((SELECT max(a.created_at) FROM public.integracao_crm_auditoria a WHERE a.tabela='integracao_crm_cards' AND a.registro_id=c.id),c.created_at)) AS quando
  FROM cards c
 )
 SELECT jsonb_build_object(
  'gerado_em', now(),
  'periodo', jsonb_build_object('inicio',inicio,'fim',fim,'parado_dias',parado),
  'funil', (SELECT coalesce(jsonb_agg(jsonb_build_object('etapa',etapa,'cards',total,'valor',valor) ORDER BY ordem),'[]'::jsonb) FROM (
    SELECT coalesce(nullif(c.status,''),'Sem etapa') AS etapa, count(*) AS total, coalesce(sum(c.valor_total),0) AS valor,
     array_position(ARRAY['Cliente novo','Negociação','Contrato','Cliente ativo','Perdido'],c.status) AS ordem
    FROM cards c GROUP BY 1,4) f),
  -- Two readings side by side: what closed inside the period, from the audit
  -- log, and where the whole base stands today. A rate over fewer than five
  -- outcomes is left null instead of printing a reassuring 100%.
  'fechamento', jsonb_build_object(
   'ganhos', (SELECT count(*) FROM ganhos),
   'perdas', (SELECT count(*) FROM perdas),
   'indice', (SELECT CASE WHEN (SELECT count(*) FROM ganhos)+(SELECT count(*) FROM perdas) < 5 THEN NULL
     ELSE round(100.0*(SELECT count(*) FROM ganhos)/((SELECT count(*) FROM ganhos)+(SELECT count(*) FROM perdas)),1) END),
   'desfechos_no_periodo', (SELECT count(*) FROM ganhos)+(SELECT count(*) FROM perdas),
   'acumulado', (SELECT jsonb_build_object(
     'contrato', count(*) FILTER (WHERE status='Contrato'), 'cliente_ativo', count(*) FILTER (WHERE status='Cliente ativo'),
     'perdido', count(*) FILTER (WHERE status='Perdido'), 'em_aberto', count(*) FILTER (WHERE status IN ('Cliente novo','Negociação')),
     'indice', CASE WHEN count(*) FILTER (WHERE status IN ('Contrato','Cliente ativo','Perdido')) < 5 THEN NULL
       ELSE round(100.0*count(*) FILTER (WHERE status IN ('Contrato','Cliente ativo'))/count(*) FILTER (WHERE status IN ('Contrato','Cliente ativo','Perdido')),1) END)
     FROM cards),
   'por_comercial', (SELECT coalesce(jsonb_agg(jsonb_build_object('comercial',nome,'carteira',carteira,'ganhos',g,'perdas',p,
      'indice', CASE WHEN g+p=0 THEN NULL ELSE round(100.0*g/(g+p),1) END) ORDER BY g DESC, nome),'[]'::jsonb) FROM (
     SELECT coalesce(pr.nome,'Sem responsável') AS nome,
      (SELECT count(*) FROM cards c WHERE c.responsavel_id IS NOT DISTINCT FROM pr.id) AS carteira,
      (SELECT count(*) FROM ganhos gg JOIN cards c ON c.id=gg.registro_id WHERE c.responsavel_id IS NOT DISTINCT FROM pr.id) AS g,
      (SELECT count(*) FROM perdas pp JOIN cards c ON c.id=pp.registro_id WHERE c.responsavel_id IS NOT DISTINCT FROM pr.id) AS p
     FROM (SELECT DISTINCT responsavel_id AS id FROM cards) d LEFT JOIN public.profiles pr ON pr.id=d.id) t)
  ),
  'ativacoes', (SELECT jsonb_build_object('quantidade',count(*),'valor',coalesce(sum(av.valor),0),
     'por_comercial',(SELECT coalesce(jsonb_agg(jsonb_build_object('comercial',coalesce(p.nome,'Sem responsável'),'quantidade',q.n,'valor',q.v) ORDER BY q.n DESC),'[]'::jsonb)
       FROM (SELECT responsavel_id, count(*) AS n, coalesce(sum(valor),0) AS v FROM public.integracao_crm_ativacoes
         WHERE desfeito_em IS NULL AND (ativado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN inicio AND fim GROUP BY 1) q
       LEFT JOIN public.profiles p ON p.id=q.responsavel_id))
   FROM public.integracao_crm_ativacoes av WHERE av.desfeito_em IS NULL AND (av.ativado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN inicio AND fim),
  'followup', jsonb_build_object(
   'pendentes', (SELECT count(*) FROM public.integracao_crm_followups WHERE status='pendente'),
   'atrasados', (SELECT count(*) FROM public.integracao_crm_followups WHERE status='pendente' AND previsto_em < now()),
   'concluidos_no_periodo', (SELECT count(*) FROM public.integracao_crm_followups WHERE status='feito' AND (concluido_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN inicio AND fim),
   'no_prazo', (SELECT count(*) FROM public.integracao_crm_followups WHERE status='feito' AND concluido_em <= previsto_em AND (concluido_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN inicio AND fim),
   'cards_sem_followup', (SELECT count(*) FROM cards c WHERE c.status IN ('Cliente novo','Negociação','Contrato')
     AND NOT EXISTS(SELECT 1 FROM public.integracao_crm_followups f WHERE f.card_id=c.id AND f.status='pendente')),
   'atrasados_lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('lead',coalesce(c.lead_nome,'Sem nome'),'etapa',c.status,
      'responsavel',(SELECT p.nome FROM public.profiles p WHERE p.id=c.responsavel_id),'previsto',f.previsto_em,
      'dias',hoje-(f.previsto_em AT TIME ZONE 'America/Sao_Paulo')::date) ORDER BY f.previsto_em),'[]'::jsonb)
     FROM public.integracao_crm_followups f JOIN cards c ON c.id=f.card_id
     WHERE f.status='pendente' AND f.previsto_em < now() LIMIT lim)
  ),
  'mensagens', jsonb_build_object(
   'conversas', (SELECT count(*) FROM public.integracao_crm_conversas),
   'total', (SELECT count(*) FROM public.integracao_crm_mensagens),
   'no_periodo', (SELECT count(*) FROM public.integracao_crm_mensagens WHERE (data AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN inicio AND fim),
   'recebidas', (SELECT count(*) FROM public.integracao_crm_mensagens WHERE direcao IN ('incoming','0') AND (data AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN inicio AND fim),
   'enviadas', (SELECT count(*) FROM public.integracao_crm_mensagens WHERE direcao IN ('outgoing','1') AND (data AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN inicio AND fim),
   'automaticas', (SELECT count(*) FROM public.integracao_crm_mensagens WHERE autor_tipo='agent_bot' AND (data AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN inicio AND fim),
   'cards_sem_conversa', (SELECT count(*) FROM cards c WHERE NOT EXISTS(SELECT 1 FROM public.integracao_crm_conversas v WHERE v.card_id=c.id)),
   'sem_resposta', (SELECT coalesce(jsonb_agg(jsonb_build_object('lead',coalesce(c.lead_nome,'Sem nome'),'etapa',c.status,
      'responsavel',(SELECT p.nome FROM public.profiles p WHERE p.id=c.responsavel_id),
      'ultima_mensagem',u.quando,'dias',hoje-(u.quando AT TIME ZONE 'America/Sao_Paulo')::date) ORDER BY u.quando),'[]'::jsonb)
     FROM ultima_msg u JOIN cards c ON c.id=u.card_id
     WHERE u.direcao IN ('incoming','0') AND u.quando < now()-make_interval(days=>parado)
      AND c.status IN ('Cliente novo','Negociação','Contrato') LIMIT lim)
  ),
  'parados', (SELECT coalesce(jsonb_agg(jsonb_build_object('lead',coalesce(c.lead_nome,'Sem nome'),'etapa',c.status,
     'responsavel',(SELECT p.nome FROM public.profiles p WHERE p.id=c.responsavel_id),
     'dias_sem_movimento',hoje-(mv.quando AT TIME ZONE 'America/Sao_Paulo')::date) ORDER BY mv.quando),'[]'::jsonb)
    FROM movimento mv JOIN cards c ON c.id=mv.id
    WHERE c.status IN ('Cliente novo','Negociação','Contrato') AND mv.quando < now()-make_interval(days=>parado) LIMIT lim),
  'institucionais', (SELECT jsonb_build_object(
    'em_negociacao', count(*) FILTER (WHERE i.status='Em negociação'),
    'ganho', count(*) FILTER (WHERE i.status='Ganho'),
    'perdido', count(*) FILTER (WHERE i.status='Perdido'),
    'motivos_perda', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome',i2.nome,'motivo',left(i2.motivo_perda,300))),'[]'::jsonb)
      FROM public.integracao_crm_institucionais i2 WHERE i2.status='Perdido' AND coalesce(i2.motivo_perda,'')<>'' LIMIT lim))
   FROM public.integracao_crm_institucionais i),
  'cobertura', jsonb_build_object(
   'cards', (SELECT count(*) FROM cards),
   'sem_responsavel', (SELECT count(*) FROM cards WHERE responsavel_id IS NULL),
   'sem_telefone', (SELECT count(*) FROM cards WHERE coalesce(lead_telefone,'')=''),
   'sem_valor', (SELECT count(*) FROM cards WHERE valor_total IS NULL AND status IN ('Negociação','Contrato')),
   'followups_registrados', (SELECT count(*) FROM public.integracao_crm_followups)
  )
 ) INTO r;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.integracao_agente_comercial(date,date,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integracao_agente_comercial(date,date,integer,integer) TO authenticated;
